// T104: "Convert to current format" and "Convert all" (FR-010/AC7, OD-5). VO-112: each older-format block's
// opening and closing lines are replaced and its `salt` line removed, nothing else changes, all as one set of
// edits (one history entry when the store applies them).
import { describe, expect, it } from 'vitest';
import { convertAllOlderFormat, convertOlderFormat } from '../../../src/core/blocks/convert.ts';
import { classify } from '../../../src/core/blocks/classify.ts';
import { split, type Segment } from '../../../src/core/blocks/split.ts';
import { applyEdits } from '../../../src/core/source/edits.ts';

const blocksOf = (source: string) => split(source).filter((s): s is Extract<Segment, { type: 'block' }> => s.type === 'block');

const OLDER = '@startuml Login\nsalt\n{\n  Login    | "MyName   "\n  [Cancel] | [  OK   ]\n}\n@enduml\n';
const CURRENT = '@startsalt Login\n{\n  Login    | "MyName   "\n  [Cancel] | [  OK   ]\n}\n@endsalt\n';

describe('convertOlderFormat (one block)', () => {
  it('replaces @startuml with @startsalt keeping the name, @enduml with @endsalt, and removes the salt line', () => {
    const [block] = blocksOf(OLDER);
    const out = applyEdits(OLDER, convertOlderFormat(OLDER, block!));
    expect(out).toBe(CURRENT);
    expect(classify(out).syntax).toBe('salt');
    expect(classify(out).category).toBe(1);
  });

  it('keeps a block without a name unnamed', () => {
    const src = '@startuml\nsalt\n{\n  [OK]\n}\n@enduml\n';
    expect(applyEdits(src, convertOlderFormat(src, blocksOf(src)[0]!))).toBe('@startsalt\n{\n  [OK]\n}\n@endsalt\n');
  });

  it('touches only the opening line keyword, the closing line keyword and the salt line', () => {
    const [block] = blocksOf(OLDER);
    const edits = convertOlderFormat(OLDER, block!);
    expect(edits).toHaveLength(3);
    const touched = edits.map((e) => OLDER.slice(e.start, e.end));
    expect(touched).toEqual(['@startuml', 'salt\n', '@enduml']);
  });

  it('keeps CRLF line endings, indentation, comments and preamble lines exactly', () => {
    const src = "  @startuml Sign-in \r\n' a comment\r\nskinparam handwritten true\r\n  salt  \r\n{\r\n  [OK]\r\n}\r\n  @enduml\r\n";
    const out = applyEdits(src, convertOlderFormat(src, blocksOf(src)[0]!));
    expect(out).toBe("  @startsalt Sign-in \r\n' a comment\r\nskinparam handwritten true\r\n{\r\n  [OK]\r\n}\r\n  @endsalt\r\n");
  });

  it('keeps a block comment above the salt line', () => {
    const src = "@startuml A\n/' note\n   more '/\nsalt\n{\n[OK]\n}\n@enduml";
    const out = applyEdits(src, convertOlderFormat(src, blocksOf(src)[0]!));
    expect(out).toBe("@startsalt A\n/' note\n   more '/\n{\n[OK]\n}\n@endsalt");
  });

  it('converts a block with no final newline after @enduml', () => {
    const src = '@startuml X\nsalt\n{\n[OK]\n}\n@enduml';
    expect(applyEdits(src, convertOlderFormat(src, blocksOf(src)[0]!))).toBe('@startsalt X\n{\n[OK]\n}\n@endsalt');
  });

  it('returns no edits for a block that is not in the older format', () => {
    const src = CURRENT + '@startuml\nAlice -> Bob\n@enduml\n' + '@startuml F\nstart\n:A;\nstop\n@enduml\n';
    for (const b of blocksOf(src)) expect(convertOlderFormat(src, b)).toEqual([]);
  });

  it('returns no edits for an older-format block that is never closed', () => {
    const src = '@startuml\nsalt\n{\n[OK]\n}\n';
    expect(classify(src).olderFormat).toBe(true);
    expect(convertOlderFormat(src, blocksOf(src)[0]!)).toEqual([]);
  });

  it('works on a block in the middle of a file, with file-absolute offsets', () => {
    const before = '﻿text before\r\n@startsalt A\r\n{\r\n[x]\r\n}\r\n@endsalt\r\n\r\n';
    const after = '\r\ntrailing text';
    const older = '@startuml B\r\nsalt\r\n{\r\n[y]\r\n}\r\n@enduml\r\n';
    const src = before + older + after;
    const block = blocksOf(src)[1]!;
    expect(applyEdits(src, convertOlderFormat(src, block))).toBe(before + '@startsalt B\r\n{\r\n[y]\r\n}\r\n@endsalt\r\n' + after);
  });
});

describe('convertAllOlderFormat (VO-112)', () => {
  it('converts every older-format block and changes nothing else, as one list of edits', () => {
    const seq = '@startuml\nAlice -> Bob\n@enduml\n';
    const other = "' between\n\n";
    const a = '@startuml One\nsalt\n{\n[A]\n}\n@enduml\n';
    const b = '@startuml Two\n  salt\n{+\n"x" | [B]\n}\n@enduml\n';
    const src = CURRENT + other + a + seq + b + 'tail';
    const edits = convertAllOlderFormat(src);
    expect(edits).toHaveLength(6);
    const out = applyEdits(src, edits);
    expect(out).toBe(CURRENT + other + '@startsalt One\n{\n[A]\n}\n@endsalt\n' + seq + '@startsalt Two\n{+\n"x" | [B]\n}\n@endsalt\n' + 'tail');
    // The same blocks, each still starting with its own opening line: the store keeps block keys.
    expect(blocksOf(out).map((s) => s.name)).toEqual(blocksOf(src).map((s) => s.name));
    for (const b of blocksOf(src)) expect(edits.some((e) => e.start < b.start && e.end > b.start)).toBe(false);
    expect(blocksOf(out).map((s) => classify(out.slice(s.start, s.end)).syntax)).toEqual(['salt', 'salt', 'other', 'salt']);
  });

  it('returns no edits when nothing is in the older format', () => {
    expect(convertAllOlderFormat(CURRENT + '@startuml\nAlice -> Bob\n@enduml\n')).toEqual([]);
    expect(convertAllOlderFormat('')).toEqual([]);
  });
});
