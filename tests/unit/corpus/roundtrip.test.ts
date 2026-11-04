// VO-062: opening and downloading every corpus file without edits gives the same bytes (FR-004/AC6, FR-020, SC-005).
import { describe, expect, it } from 'vitest';
import { corpusFiles } from './corpus.ts';
import { decode, encode } from '../../../src/core/source/decode.ts';
import { split } from '../../../src/core/blocks/split.ts';

const files = corpusFiles();

describe('corpus round trip', () => {
  it('finds the corpus', () => {
    expect(files.length).toBeGreaterThan(25);
  });

  it.each(files.map((f) => [f.name, f] as const))('%s splits, re-joins and encodes byte-identically', (_, file) => {
    const decoded = decode(file.bytes);
    if (!decoded.ok) return; // binary corpus files (e.g. for import testing) are skipped
    const segments = split(decoded.text);
    let offset = 0;
    for (const s of segments) {
      expect(s.start).toBe(offset);
      offset = s.end;
    }
    expect(offset).toBe(decoded.text.length);
    const joined = segments.map((s) => decoded.text.slice(s.start, s.end)).join('');
    expect(encode(joined, decoded.bom)).toEqual(file.bytes);
  });
});
