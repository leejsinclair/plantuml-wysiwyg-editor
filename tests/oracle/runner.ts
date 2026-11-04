// Command-line oracle (R-13, FR-017/AC7): renders blocks with plantuml-<version>.jar, the version pinned for the
// in-browser renderer. One JVM renders a whole batch through -pipe.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const ORACLE_VERSION = '1.2026.9';
export const JAR = process.env.PLANTUML_JAR ?? resolve(import.meta.dirname, `../../tools/plantuml-${ORACLE_VERSION}.jar`);
const DELIMITER = '@@ORACLE-SPLIT@@';

export interface OracleResult {
  ok: boolean;
  svg: string;
  /** The error text shown in PlantUML's error image, when the block failed. */
  message: string | null;
  /** 1-based line within the block, when PlantUML reports one. */
  line: number | null;
}

let checked = false;
function checkJar(): void {
  if (checked) return;
  if (!existsSync(JAR)) {
    throw new Error(`Oracle jar not found at ${JAR}. Download plantuml-${ORACLE_VERSION}.jar into tools/ or set PLANTUML_JAR.`);
  }
  let out: string;
  try {
    out = execFileSync('java', ['-jar', JAR, '-version'], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`Cannot run java (Java 17 or later is required): ${(e as Error).message}`, { cause: e });
  }
  if (!out.includes(`PlantUML version ${ORACLE_VERSION}`)) throw new Error(`Oracle jar is not ${ORACLE_VERSION}: ${out.split('\n')[0]}`);
  checked = true;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

/** Every `<text>` element's content, decoded, in document order. */
export function svgText(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => decode(m[1] ?? ''));
}

/** True when `text` appears literally in the SVG, whether PlantUML drew it as one text run or several. */
export function svgHasText(svg: string, text: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ');
  const parts = svgText(svg);
  return norm(parts.join('')).includes(norm(text)) || norm(parts.join(' ')).includes(norm(text));
}

function classify(svg: string): OracleResult {
  const texts = svgText(svg);
  const first = texts[0] ?? '';
  if (/^An error has occurred/.test(first)) return { ok: false, svg, message: first, line: null };
  if (/^PlantUML version /.test(first)) {
    const line = Number(/\(line (\d+)\)/.exec(texts[1] ?? '')?.[1] ?? NaN);
    const message = texts.filter((t) => t.trim() && t !== ' ').at(-1) ?? 'error';
    return { ok: false, svg, message, line: Number.isNaN(line) ? null : line };
  }
  if (!svg.includes('<svg')) return { ok: false, svg, message: 'no output', line: null };
  return { ok: true, svg, message: null, line: null };
}

/** Renders each block (text from `@start…` to `@end…`) and returns one result per block, in order. */
export async function renderBlocks(blocks: readonly string[]): Promise<OracleResult[]> {
  if (blocks.length === 0) return [];
  checkJar();
  const input = blocks.map((b) => (b.endsWith('\n') ? b : b + '\n')).join('');
  const stdout = await new Promise<string>((resolveOut, reject) => {
    const child = spawn('java', ['-Djava.awt.headless=true', '-jar', JAR, '-tsvg', '-pipe', '-pipedelimitor', DELIMITER, '-charset', 'UTF-8', '-nometadata']);
    let out = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (out += d));
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', () => resolveOut(out));
    child.stdin.end(input, 'utf8');
  });
  const parts = stdout.split(DELIMITER).slice(0, blocks.length);
  if (parts.length !== blocks.length) throw new Error(`Oracle returned ${parts.length} diagrams for ${blocks.length} blocks`);
  return parts.map((p) => classify(p.trim()));
}

export async function renderBlock(block: string): Promise<OracleResult> {
  const [result] = await renderBlocks([block]);
  return result!;
}
