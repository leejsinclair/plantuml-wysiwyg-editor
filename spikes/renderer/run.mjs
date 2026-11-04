// OD-1 spike runner: renders every case in the browser build (Chromium, dedicated worker) and in the
// command-line tool at the same version, then scores the six criteria. Writes results.json.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm, stat, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import cases from './cases.mjs';

const run = promisify(execFile);
const root = resolve(import.meta.dirname);
const engineDir = join(root, 'node_modules/@plantuml/core');
const jar = resolve(root, '../../tools/plantuml-1.2026.9.jar');
const mode = process.argv[2] ?? 'worker';
const types = { '.js': 'text/javascript', '.html': 'text/html' };

const served = new Set();
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  served.add(path);
  const file = path.startsWith('/engine/') ? join(engineDir, path.slice(8)) : join(root, 'public', path === '/' ? 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const svgText = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => decode(m[1]));
const looksLikeError = (svg) => /Syntax Error|Error line \d|cannot include|Cannot include|Diagram is empty|An error has occured/i.test(svgText(svg).join(' '));
const has = (svg, t) => { const parts = svgText(svg); const norm = (s) => s.replace(/\s+/g, ' '); return norm(parts.join('')).includes(norm(t)) || norm(parts.join(' ')).includes(norm(t)); };

async function browserRun(offlineFrom) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const requests = [];
  const aborted = [];
  context.on('request', (r) => requests.push(r.url()));
  if (offlineFrom) {
    // Second pass: only files fetched in the first pass are available; anything else is aborted.
    await context.route('**/*', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (offlineFrom.has(path)) return route.continue();
      aborted.push(route.request().url());
      return route.abort();
    });
  }
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(origin + '/');
  const out = await page.evaluate((cs) => window.runCases(...cs), [cases.map(({ name, text }) => ({ name, text })), mode]);
  out.wallMs = Date.now() - t0;
  await browser.close();
  return { ...out, requests, aborted };
}

async function jarRun() {
  const cache = join(root, 'jar-results.json');
  try { return JSON.parse(await readFile(cache, 'utf8')); } catch {}
  const dir = join(root, 'out-jar');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const results = {};
  const queue = [...cases];
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const caseDir = join(dir, c.name);
      await mkdir(caseDir, { recursive: true });
      const file = join(caseDir, 'case.puml');
      await writeFile(file, c.text + '\n');
      let ok = true, message = '';
      try { await run('java', ['-jar', jar, '-tsvg', '-charset', 'UTF-8', '-nometadata', file], { timeout: 60000 }); }
      catch (e) { ok = false; message = (e.stderr || e.message || '').trim().split('\n').slice(0, 3).join(' | '); }
      const svgFile = (await readdir(caseDir)).find((f) => f.endsWith('.svg'));
      const svg = svgFile ? await readFile(join(caseDir, svgFile), 'utf8') : '';
      results[c.name] = { ok: ok && !looksLikeError(svg), exitOk: ok, svg, message };
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  await writeFile(cache, JSON.stringify(results));
  return results;
}

const [first, jarResults] = await Promise.all([browserRun(), jarRun()]);
await rm(join(root, `out-${mode}`), { recursive: true, force: true });
await mkdir(join(root, `out-${mode}`), { recursive: true });
for (const r of first.results) if (r.svg) await writeFile(join(root, `out-${mode}`, r.id + '.svg'), r.svg);
const fetched = new Set([...served]);
const second = await browserRun(fetched);
server.close();

const rows = cases.map((c) => {
  const b = first.results.find((r) => r.id === c.name);
  const b2 = second.results.find((r) => r.id === c.name);
  const j = jarResults[c.name];
  const bOk = b.type === 'svg' && !looksLikeError(b.svg);
  const row = {
    name: c.name, browser: b.type === 'svg' ? (bOk ? 'ok' : 'error-image') : b.type, browserMessage: b.message?.slice(0, 200),
    jar: j.ok ? 'ok' : (j.exitOk ? 'error-image' : 'error'), jarMessage: j.message?.slice(0, 200),
    parity: c.parity === false ? 'n/a (include refused by design)' : (bOk === j.ok ? 'same' : 'DIFFERENT'),
    ms: Math.round(b.ms ?? 0), svgHash: b.svg ? createHash('sha1').update(b.svg).digest('hex').slice(0, 12) : null, refused: b.refused ?? [],
    offlineSame: (b2?.type === b.type),
  };
  if (c.expect) {
    row.textBrowser = c.expect.every((t) => bOk && has(b.svg, t));
    row.textJar = c.expect.every((t) => j.ok && has(j.svg, t));
  }
  if (c.escape) {
    const visibleTilde = (svg) => !c.escape.text.includes('~') && svgText(svg).join('').includes('~');
    row.escape = { ...c.escape, browserLiteral: bOk && has(b.svg, c.escape.text === 'link label' ? 'Pick [x] or ]] | y' : c.escape.text) && !visibleTilde(b.svg), jarLiteral: j.ok && has(j.svg, c.escape.text === 'link label' ? 'Pick [x] or ]] | y' : c.escape.text) && !visibleTilde(j.svg) };
  }
  if (c.reference) row.reference = true;
  return row;
});

const sizes = {};
for (const f of ['plantuml.js', 'viz-global.js', 'themes.js', 'openiconic.js', 'emoji.js']) sizes[f] = (await stat(join(engineDir, f))).size;
const external = [...first.requests, ...second.requests].filter((u) => !u.startsWith(origin));

const summary = {
  engineFilesBytes: sizes,
  totalBytes: Object.values(sizes).reduce((a, b) => a + b, 0),
  mode,
  hostReadyMs: Math.round(first.readyMs),
  startupMaxGapMs: Math.round(first.startupMaxGapMs),
  maxMainThreadGapMs: Math.round(first.maxMainThreadGapMs),
  servedPaths: [...fetched].sort(),
  externalRequests: external,
  offlinePassAborted: second.aborted,
  parityDifferences: rows.filter((r) => r.parity === 'DIFFERENT').map((r) => r.name),
  timedOut: rows.filter((r) => r.browser === 'timedOut').map((r) => r.name),
  referenceMs: rows.filter((r) => r.reference).map((r) => ({ name: r.name, ms: r.ms })),
  maxRenderMs: Math.max(...rows.map((r) => r.ms)),
};
await writeFile(join(root, `results-${mode}.json`), JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const r of rows) console.log([r.name, r.browser, r.jar, r.parity, r.ms + 'ms', r.textBrowser ?? '', r.textJar ?? '', r.escape ? `lit b=${r.escape.browserLiteral} j=${r.escape.jarLiteral}` : '', r.offlineSame ? '' : 'OFFLINE-DIFF', (r.browserMessage || '').slice(0, 80)].join('\t'));
