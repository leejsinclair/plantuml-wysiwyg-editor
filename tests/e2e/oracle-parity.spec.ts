// VO-073: the built app's render worker succeeds or fails on every corpus block exactly as the PlantUML jar
// does (R-1, spike-renderer.md). Blocks that use !include or !import are left out: the editor never resolves
// them (EC-13), while the jar reads the file system.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from './fixtures.ts';
import { corpusFiles } from '../unit/corpus/corpus.ts';
import { decode } from '../../src/core/source/decode.ts';
import { split } from '../../src/core/blocks/split.ts';
import { readErrorImage } from '../../src/services/render/render-queue.ts';
import { renderBlocks } from '../oracle/runner.ts';

const EXTERNAL = /^[ \t]*!(?:include\w*|import)\b/im;

function corpusBlocks(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const file of corpusFiles()) {
    const decoded = decode(file.bytes);
    if (!decoded.ok) continue;
    split(decoded.text).forEach((s, i) => {
      const text = decoded.text.slice(s.start, s.end);
      if (s.type === 'block' && !EXTERNAL.test(text)) out.push({ name: `${file.name}#${i}`, text });
    });
  }
  return out;
}

test('the app renderer agrees with the PlantUML jar on every corpus block (VO-073)', async ({ page }) => {
  test.setTimeout(240_000);
  const blocks = corpusBlocks();
  expect(blocks.length).toBeGreaterThan(30);
  const oracle = await renderBlocks(blocks.map((b) => b.text));

  const worker = readdirSync(resolve(import.meta.dirname, '../../dist/assets')).find((f) => /^render\.worker-.*\.js$/.test(f));
  expect(worker, 'run `vite build` first').toBeDefined();
  await page.goto('/');
  const replies = await page.evaluate(
    async ({ url, texts }) => {
      const w = new Worker(url, { type: 'module' });
      const results: { type: string; svg?: string; message?: string }[] = [];
      await new Promise<void>((done) => {
        w.addEventListener('message', (event: MessageEvent<{ type: string; id?: number; svg?: string; message?: string }>) => {
          const m = event.data;
          if (m.type === 'ready') return;
          results[m.id!] = m;
          if (results.filter(Boolean).length === texts.length) done();
        });
        texts.forEach((lines, id) => w.postMessage({ type: 'render', id, lines }));
      });
      w.terminate();
      return results;
    },
    { url: `/assets/${worker}`, texts: blocks.map((b) => b.text) },
  );

  const appOk = replies.map((r) => r.type === 'svg' && readErrorImage(r.svg!) === null);
  // The corpus holds both diagrams that draw and diagrams PlantUML rejects, so a vacuous pass is caught.
  expect(appOk.filter(Boolean).length).toBeGreaterThan(20);
  expect(appOk).toContain(false);
  const disagreements = blocks
    .map((b, i) => ({ block: b.name, app: appOk[i], jar: oracle[i]!.ok }))
    .filter((d) => d.app !== d.jar);
  expect(disagreements).toEqual([]);
});
