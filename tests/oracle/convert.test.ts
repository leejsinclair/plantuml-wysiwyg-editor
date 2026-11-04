// T105: converted older-format blocks render in the command-line oracle (VO-017 render, FR-010/AC7, OD-5).
// Each older-format block, from the corpus and a few written here, is converted with `convertOlderFormat`; the
// result must be a supported screen and render through plantuml-1.2026.9.jar with its text drawn.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { convertAllOlderFormat, convertOlderFormat } from '../../src/core/blocks/convert.ts';
import { classify } from '../../src/core/blocks/classify.ts';
import { split } from '../../src/core/blocks/split.ts';
import { applyEdits } from '../../src/core/source/edits.ts';
import { renderBlocks, svgHasText, type OracleResult } from './runner.ts';

const corpusFile = readFileSync(resolve(import.meta.dirname, '../corpus/import/older-format-salt.puml'), 'utf8');

const CASES: { name: string; source: string; texts: string[] }[] = [
  { name: 'corpus older-format-salt.puml', source: corpusFile, texts: ['Password', 'Cancel', 'OK'] },
  { name: 'unnamed, CRLF', source: '@startuml\r\nsalt\r\n{\r\n  Name | "Ann  "\r\n  [Save]\r\n}\r\n@enduml\r\n', texts: ['Name', 'Save'] },
  {
    name: 'comment before salt',
    source: "@startuml Settings\n' kept\nsalt\n{+\n  [X] Remember me\n  ^Light^\n}\n@enduml",
    texts: ['Remember me', 'Light'],
  },
  { name: 'nested group box', source: '@startuml Box\nsalt\n{\n{^"Account"\n  Email | "     "\n}\n[Next]\n}\n@enduml\n', texts: ['Account', 'Email', 'Next'] },
];

const converted = CASES.map((c) => {
  const block = split(c.source).find((s) => s.type === 'block')!;
  const out = applyEdits(c.source, convertOlderFormat(c.source, block));
  const b = split(out).find((s) => s.type === 'block')!;
  return { ...c, text: out.slice(b.start, b.end) };
});

let results: OracleResult[] = [];
beforeAll(async () => {
  results = await renderBlocks(converted.map((c) => c.text));
});

describe('converted older-format blocks render (VO-017)', () => {
  it.each(converted.map((c, i) => [c.name, i] as const))('%s', (_name, i) => {
    const c = converted[i]!;
    expect(classify(c.text).syntax).toBe('salt');
    expect(classify(c.text).category).toBe(1);
    const r = results[i]!;
    expect(r.ok, r.message ?? '').toBe(true);
    for (const text of c.texts) expect(svgHasText(r.svg, text), text).toBe(true);
  });

  it('"Convert all" over a file of several older-format blocks gives blocks that all render', async () => {
    const source = CASES.map((c) => c.source.replace(/\r\n/g, '\n').replace(/\n?$/, '\n')).join('\n');
    const out = applyEdits(source, convertAllOlderFormat(source));
    const texts = split(out).filter((s) => s.type === 'block').map((s) => out.slice(s.start, s.end));
    expect(texts).toHaveLength(CASES.length);
    const rendered = await renderBlocks(texts);
    for (const [i, r] of rendered.entries()) expect(r.ok, `${i}: ${r.message}`).toBe(true);
  });
});
