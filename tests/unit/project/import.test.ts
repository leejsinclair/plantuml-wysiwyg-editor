// T082: importing a file (VO-013 core, VO-014, VO-082, VO-084 import; FR-006/AC5, AC6, AC13, AC14, AC17).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importFile, openIndexFor, projectNameFromFile, ONLY_OTHER_CONTENT_KEY } from '../../../src/core/project/import.ts';
import { blocks, withKeys } from '../../../src/core/project/project.ts';
import { encode } from '../../../src/core/source/decode.ts';

const CORPUS = join(import.meta.dirname, '../../corpus');
const corpus = (path: string) => new Uint8Array(readFileSync(join(CORPUS, path)));
const bytes = (text: string, bom = false) => encode(text, bom);
const screen = (name: string, body = '  [OK]') => `@startsalt ${name}\n{\n${body}\n}\n@endsalt\n`;
const activity = (name: string, body = 'start\n:Go;\nstop') => `@startuml ${name}\n${body}\n@enduml\n`;
const BROKEN = '@startsalt Broken\n{\n  [Save]\n@endsalt\n';
let n = 0;
const newKey = () => `k${++n}`;

function ok(result: ReturnType<typeof importFile>) {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result;
}

describe('naming (VO-013 core)', () => {
  it('names the project after the file without its extension', () => {
    expect(projectNameFromFile('Shop checkout.puml', [], '2026-10-28')).toBe('Shop checkout');
    expect(projectNameFromFile('notes.txt', [], '2026-10-28')).toBe('notes');
    expect(projectNameFromFile('archive.v2.puml', [], '2026-10-28')).toBe('archive.v2');
  });

  it('appends the import date when the name is already in the library', () => {
    expect(projectNameFromFile('Shop.puml', ['Shop', 'Other'], '2026-10-28')).toBe('Shop 2026-10-28');
    expect(projectNameFromFile('Shop.puml', ['shop'], '2026-10-28')).toBe('Shop');
  });

  it('falls back to "Untitled project" when the file name gives nothing', () => {
    expect(projectNameFromFile('.puml', [], '2026-10-28')).toBe('Untitled project');
  });

  it('passes the name and date through importFile', () => {
    const r = ok(importFile(bytes(screen('A')), 'Mine.puml', { takenNames: ['Mine'], today: '2026-10-28' }));
    expect(r.name).toBe('Mine 2026-10-28');
  });
});

describe('content (VO-013 core, FR-006/AC5)', () => {
  it('keeps the decoded text unchanged and chooses the flow', () => {
    const text = screen('A') + activity('Flow') + screen('B');
    const r = ok(importFile(bytes(text), 'p.puml'));
    expect(r.state).toEqual({ source: text, flowIndex: 1, lastWorking: [] });
    expect(r.bom).toBe(false);
  });

  it('keeps a byte-order mark as a leading U+FEFF in the stored source', () => {
    const file = corpus('fidelity/bom.puml');
    const r = ok(importFile(file, 'bom.puml'));
    expect(r.bom).toBe(true);
    expect(r.state.source.startsWith('﻿')).toBe(true);
    expect(new TextEncoder().encode(r.state.source)).toEqual(file);
  });

  it('keeps CRLF line endings and a missing final newline byte for byte', () => {
    for (const path of ['fidelity/crlf.puml', 'fidelity/no-final-newline.puml']) {
      const file = corpus(path);
      expect(new TextEncoder().encode(ok(importFile(file, path)).state.source)).toEqual(file);
    }
  });

  it('uses the first supported activity block as the flow; others are other content (FR-006/AC14)', () => {
    const r = ok(importFile(corpus('import/sequence-and-two-activities.puml'), 'x.puml'));
    expect(r.state.flowIndex).toBe(1);
  });
});

describe('refusals (VO-014, FR-006/AC13)', () => {
  it('refuses a file that is not UTF-8', () => {
    expect(importFile(new Uint8Array([0x40, 0xff, 0xfe, 0x41]), 'latin.puml')).toEqual({ ok: false, reason: 'not-utf8' });
  });

  it('refuses a binary file', () => {
    expect(importFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]), 'image.png')).toEqual({ ok: false, reason: 'binary' });
  });
});

describe('the block to open (VO-082, FR-006/AC17)', () => {
  it('opens the first screen that can be edited visually', () => {
    const text = activity('Flow') + BROKEN + screen('Good');
    const r = ok(importFile(bytes(text), 'p.puml'));
    // Block 1 is an invalid screen; block 2 is the first editable one.
    expect(r.openIndex).toBe(2);
  });

  it('opens a screen with locked parts', () => {
    const text = activity('Flow') + new TextDecoder().decode(corpus('import/tree-table.puml'));
    const r = ok(importFile(bytes(text), 'p.puml'));
    const views = blocks(withKeys(r.state, newKey));
    expect(views[r.openIndex]).toMatchObject({ kind: 'screen', status: 'Has locked parts' });
  });

  it('opens the flow when no screen can be edited', () => {
    const text = BROKEN + '@startuml Seq\nA -> B\n@enduml\n' + activity('Flow');
    const r = ok(importFile(bytes(text), 'p.puml'));
    expect(r.openIndex).toBe(2);
    expect(r.state.flowIndex).toBe(2);
  });

  it('opens the first block otherwise', () => {
    const r = ok(importFile(corpus('import/no-screen-or-flow.puml'), 'p.puml'));
    expect(r.openIndex).toBe(0);
  });

  it('openIndexFor agrees with importFile', () => {
    const r = ok(importFile(bytes(activity('Flow') + screen('S')), 'p.puml'));
    expect(openIndexFor(r.state)).toBe(r.openIndex);
  });
});

describe('degenerate files (VO-084 import, EC-01)', () => {
  it('gives an empty file one new screen', () => {
    const r = ok(importFile(new Uint8Array(), 'empty.puml'));
    expect(r.state.source).toBe('@startsalt Screen-1\n{\n}\n@endsalt\n');
    expect(r.openIndex).toBe(0);
    expect(r.noticeKey).toBeNull();
  });

  it('gives a file holding only a byte-order mark one new screen after the mark', () => {
    const r = ok(importFile(new Uint8Array([0xef, 0xbb, 0xbf]), 'bom-only.puml'));
    expect(r.state.source).toBe('﻿@startsalt Screen-1\n{\n}\n@endsalt\n');
    const views = blocks(withKeys(r.state, newKey));
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ kind: 'screen', status: 'Editable' });
  });

  it('keeps a file without screen or flow as other content, with a status explaining why', () => {
    const r = ok(importFile(corpus('import/no-screen-or-flow.puml'), 'p.puml'));
    const views = blocks(withKeys(r.state, newKey));
    expect(views.map((b) => b.kind)).toEqual(['other', 'other']);
    expect(r.noticeKey).toBe(ONLY_OTHER_CONTENT_KEY);
  });

  it('gives no status when there is a screen or flow', () => {
    expect(ok(importFile(bytes(screen('A')), 'p.puml')).noticeKey).toBeNull();
    expect(ok(importFile(bytes(activity('F')), 'p.puml')).noticeKey).toBeNull();
  });
});
