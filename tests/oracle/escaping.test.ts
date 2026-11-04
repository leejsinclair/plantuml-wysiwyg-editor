// Escaping oracle (T040, VO-007 render, VO-055 contract, FR-003/AC6, EC-05). Every corpus text goes through the
// editor's escape writer into a minimal block and must render through plantuml-1.2026.9.jar exactly as typed, with
// no visible escape characters. Ordinary text is written unchanged, and unescaping gives the typed text back.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { escapeSaltText, unescapeSaltText } from '../../src/core/salt/escape.ts';
import { escapeStepLabel, unescapeStepLabel } from '../../src/core/activity/escape.ts';
import { renderBlocks, svgText, type OracleResult } from './runner.ts';

type Cell = 'first' | 'later';
interface SaltCase {
  text: string;
  unchanged?: boolean;
  cells?: Cell[];
}
interface StepCase {
  text: string;
  linked: boolean;
  unchanged?: boolean;
}
interface Corpus {
  salt: SaltCase[];
  step: StepCase[];
}

const corpus = JSON.parse(readFileSync(resolve(import.meta.dirname, '../corpus/escaping/cases.json'), 'utf8')) as Corpus;

/** The neighbouring cell's text. It contains no character any case relies on. */
const OTHER = 'Zq';
const ZWS = '​';

interface Item {
  name: string;
  text: string;
  written: string;
  unchanged: boolean;
  roundTrip: string;
  block: string;
}

const items: Item[] = [];
for (const c of corpus.salt) {
  for (const cell of c.cells ?? (['first', 'later'] as const)) {
    const written = escapeSaltText(c.text, { firstCellOfRow: cell === 'first' });
    const row = cell === 'first' ? `${written} | ${OTHER}` : `${OTHER} | ${written}`;
    items.push({
      name: `Salt ${cell} cell ${JSON.stringify(c.text)}`,
      text: c.text,
      written,
      unchanged: c.unchanged ?? false,
      roundTrip: unescapeSaltText(written),
      block: `@startsalt\n{\n  ${row}\n}\n@endsalt\n`,
    });
  }
}
for (const c of corpus.step) {
  const written = escapeStepLabel(c.text, c.linked);
  const label = c.linked ? `[[#Sign-in ${written}]]` : written;
  items.push({
    name: `${c.linked ? 'linked' : 'plain'} step ${JSON.stringify(c.text)}`,
    text: c.text,
    written,
    unchanged: c.unchanged ?? false,
    roundTrip: unescapeStepLabel(written),
    block: `@startuml\nstart\n:${label};\nstop\n@enduml\n`,
  });
}

const norm = (s: string) => s.replaceAll(ZWS, '').replace(/\s+/g, ' ').trim();

/** The visible text of a render: every text run, zero-width spaces dropped, with the neighbouring cell removed. */
function visible(svg: string): string[] {
  return svgText(svg)
    .map(norm)
    .filter((t) => t !== '' && t !== OTHER);
}

describe('escaping oracle (FR-003/AC6, EC-05)', () => {
  let results: OracleResult[] = [];
  beforeAll(async () => {
    results = await renderBlocks(items.map((i) => i.block));
  });

  it('covers every FR-003/AC6 text', () => {
    const texts = new Set(items.map((i) => i.text));
    for (const t of ['{', '}', '|', '[x', '(a', '^a', '"q', '*a', '==a', '.', '...', '**b**', '//i//', '__u__', '""m""', '--s--', '~~w~~', 'a.b', '5 * 3', 'Title', 'Header 1', 'Legend', 'Pick [x] or ]] | y'])
      expect(texts, t).toContain(t);
  });

  describe.each(items.map((item, index) => ({ ...item, index })))('$name', (item) => {
    it('writes ordinary text unchanged and unescapes to the typed text (VO-055 contract)', () => {
      if (item.unchanged) expect(item.written).toBe(item.text);
      expect(item.roundTrip).toBe(item.text);
    });

    it('renders literally with no visible escape characters (VO-007, VO-055 render)', () => {
      const result = results[item.index]!;
      expect(result.ok, `${result.message ?? ''}\n${item.block}`).toBe(true);
      const shown = visible(result.svg);
      // PlantUML may draw one label as several runs; joined with or without spaces it is the typed text.
      const joined = [shown.join(''), shown.join(' ')];
      expect(joined, `${JSON.stringify(shown)}\n${item.block}`).toContain(norm(item.text));
      if (!item.text.includes('<U+')) expect(shown.join(' ')).not.toMatch(/<U\+/i);
      if (!item.text.includes('~')) expect(shown.join(' ')).not.toContain('~');
    });
  });
});
