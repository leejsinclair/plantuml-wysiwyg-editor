// Corpus file discovery shared by the round-trip and classification suites (tests/corpus/README.md).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const CORPUS = join(import.meta.dirname, '../../corpus');

export interface CorpusFile {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly expected: Expected | null;
}

export interface Expected {
  readonly flowIndex: number | null;
  readonly blocks: readonly {
    readonly kind: string;
    readonly status: string;
    readonly name: string | null;
    readonly nameFlag: string | null;
    readonly reasonKey?: string;
    readonly line?: number;
  }[];
}

export function corpusFiles(): CorpusFile[] {
  const out: CorpusFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.puml')) {
        const sidecar = path.replace(/\.puml$/, '.expected.json');
        const expected = existsSync(sidecar) ? (JSON.parse(readFileSync(sidecar, 'utf8')) as Expected) : null;
        out.push({ name: relative(CORPUS, path), bytes: new Uint8Array(readFileSync(path)), expected });
      }
    }
  };
  walk(CORPUS);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
