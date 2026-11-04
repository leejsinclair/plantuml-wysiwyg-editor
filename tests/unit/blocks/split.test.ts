import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { split, type Segment } from '../../../src/core/blocks/split.ts';

function covers(source: string, segments: Segment[]): void {
  let at = 0;
  for (const s of segments) {
    expect(s.start).toBe(at);
    expect(s.end).toBeGreaterThan(s.start);
    at = s.end;
  }
  expect(at).toBe(source.length);
  expect(segments.map((s) => source.slice(s.start, s.end)).join('')).toBe(source);
}

const texts = (source: string, segments: Segment[]) => segments.map((s) => [s.type, source.slice(s.start, s.end)]);

describe('split', () => {
  it('returns no segments for an empty file', () => {
    expect(split('')).toEqual([]);
  });

  it('returns one block for a single Salt block, with opener and name', () => {
    const src = '@startsalt Login\n{\n  Name\n}\n@endsalt\n';
    const segs = split(src);
    expect(segs).toEqual([{ type: 'block', start: 0, end: src.length, commentStart: 0, opener: 'startsalt', name: 'Login' }]);
  });

  it('keeps text before, between and after blocks as text segments', () => {
    const src = 'intro\n\n@startsalt A\n{\n}\n@endsalt\nmiddle\n@startuml B\nstart\n@enduml\ntail';
    const segs = split(src);
    covers(src, segs);
    expect(texts(src, segs)).toEqual([
      ['text', 'intro\n\n'],
      ['block', '@startsalt A\n{\n}\n@endsalt\n'],
      ['text', 'middle\n'],
      ['block', '@startuml B\nstart\n@enduml\n'],
      ['text', 'tail'],
    ]);
  });

  it('includes the end line ending in the block (CRLF)', () => {
    const src = '@startsalt A\r\n{\r\n}\r\n@endsalt\r\n\r\n@startsalt B\r\n{\r\n}\r\n@endsalt\r\n';
    const segs = split(src);
    covers(src, segs);
    expect(texts(src, segs).map(([t]) => t)).toEqual(['block', 'text', 'block']);
    expect(src.slice(segs[0]!.start, segs[0]!.end)).toBe('@startsalt A\r\n{\r\n}\r\n@endsalt\r\n');
    expect(src.slice(segs[1]!.start, segs[1]!.end)).toBe('\r\n');
  });

  it('handles a block with no final newline', () => {
    const src = 'x\n@startsalt\n{\n}\n@endsalt';
    const segs = split(src);
    covers(src, segs);
    expect(segs[1]).toMatchObject({ type: 'block', opener: 'startsalt', name: null, end: src.length });
  });

  it('keeps a leading byte-order mark out of the block', () => {
    const src = '﻿@startsalt A\n{\n}\n@endsalt\n';
    const segs = split(src);
    covers(src, segs);
    expect(texts(src, segs)).toEqual([
      ['text', '﻿'],
      ['block', '@startsalt A\n{\n}\n@endsalt\n'],
    ]);
  });

  it('attaches comment lines directly above a block, not across a blank line', () => {
    const src = "free\n' one\n' two\n@startsalt A\n{\n}\n@endsalt\n' loose\n\n@startsalt B\n{\n}\n@endsalt\n";
    const segs = split(src);
    covers(src, segs);
    const [, a, , b] = segs;
    expect(a).toMatchObject({ type: 'block', name: 'A' });
    expect(src.slice((a as { commentStart: number }).commentStart, a!.start)).toBe("' one\n' two\n");
    expect(b).toMatchObject({ type: 'block', name: 'B' });
    expect((b as { commentStart: number }).commentStart).toBe(b!.start);
  });

  it("attaches a /' … '/ block comment directly above a block", () => {
    const src = "text\n/' a\n   b '/\n@startsalt A\n{\n}\n@endsalt\n";
    const segs = split(src);
    const block = segs[1] as Extract<Segment, { type: 'block' }>;
    expect(src.slice(block.commentStart, block.start)).toBe("/' a\n   b '/\n");
  });

  it('matches the end keyword to the start keyword, case-insensitively', () => {
    const src = '@startuml A\nstart\n@endsalt\nstop\n@ENDUML\nafter\n';
    const segs = split(src);
    covers(src, segs);
    expect(texts(src, segs)).toEqual([
      ['block', '@startuml A\nstart\n@endsalt\nstop\n@ENDUML\n'],
      ['text', 'after\n'],
    ]);
  });

  it('keeps an unmatched start as one block up to the next start line', () => {
    const src = '@startsalt A\n{\n}\n@startsalt B\n{\n}\n@endsalt\n';
    const segs = split(src);
    covers(src, segs);
    expect(texts(src, segs)).toEqual([
      ['block', '@startsalt A\n{\n}\n'],
      ['block', '@startsalt B\n{\n}\n@endsalt\n'],
    ]);
  });

  it('keeps an unmatched start at the end of the file as one block', () => {
    const src = 'lead\n@startsalt A\n{\n  Name\n';
    const segs = split(src);
    covers(src, segs);
    expect(texts(src, segs)).toEqual([
      ['text', 'lead\n'],
      ['block', '@startsalt A\n{\n  Name\n'],
    ]);
  });

  it('treats a stray end line and @start without a word as text', () => {
    const src = '@endsalt\n@start\nplain\n';
    expect(split(src)).toEqual([{ type: 'text', start: 0, end: src.length }]);
  });

  it('accepts indentation before the start and end lines and trims the name', () => {
    const src = '  @startsalt   Sign-in  \n{\n}\n  @endsalt  \n';
    const segs = split(src);
    expect(segs).toEqual([{ type: 'block', start: 0, end: src.length, commentStart: 0, opener: 'startsalt', name: 'Sign-in' }]);
  });

  it('handles lone CR line endings', () => {
    const src = '@startsalt A\r{\r}\r@endsalt\rafter';
    const segs = split(src);
    covers(src, segs);
    expect(texts(src, segs).map(([t]) => t)).toEqual(['block', 'text']);
  });

  it('covers every fidelity corpus file exactly', () => {
    const dir = join(import.meta.dirname, '../../corpus/fidelity');
    const files = readdirSync(dir).filter((f) => f.endsWith('.puml'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      const segs = split(src);
      covers(src, segs);
      const expected = JSON.parse(readFileSync(join(dir, f.replace(/\.puml$/, '.expected.json')), 'utf8')) as {
        blocks: { name: string | null }[];
      };
      const blocks = segs.filter((s) => s.type === 'block');
      expect(blocks.map((b) => b.name), f).toEqual(expected.blocks.map((b) => b.name));
    }
  });
});
