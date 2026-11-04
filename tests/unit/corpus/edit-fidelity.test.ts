// T106: edit fidelity (VO-020 screens, FR-004, FR-020, US3-AS6). For every visually editable screen in the corpus,
// the file is imported, one Salt operation changes one element's text through the store, and the project is
// downloaded: the downloaded bytes differ from the imported bytes only within that element's source text.
// Everything else (other blocks, text between blocks, comments, CRLF, the byte-order mark, a missing final
// newline) stays byte-identical.
import { describe, expect, it } from 'vitest';
import { importFile } from '../../../src/core/project/import.ts';
import { setProperty } from '../../../src/core/salt/ops/properties.ts';
import type { CellContent, Container, SaltScreen } from '../../../src/core/salt/model.ts';
import type { Path, TextEdit } from '../../../src/core/types.ts';
import { createStore } from '../../../src/ui/app/store.ts';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';
import { corpusFiles } from './corpus.ts';

/** The property holding each text-bearing element's own text. */
const TEXT_PROPERTY: Partial<Record<CellContent['type'], string>> = {
  text: 'text', button: 'label', checkbox: 'label', radioButton: 'label', textField: 'value', dropDown: 'value',
};

interface Target { readonly path: Path; readonly content: CellContent; readonly prop: string }

/** The first element in reading order whose text can be set without a formatting choice. */
function firstTextElement(container: Container, base: Path = []): Target | null {
  for (const [r, row] of container.rows.entries()) {
    if (row.type !== 'cells') continue;
    for (const [c, cell] of row.cells.entries()) {
      const content = cell.content;
      const path = [...base, r, c];
      const prop = TEXT_PROPERTY[content.type];
      const value = 'text' in content ? content.text : 'label' in content ? content.label : 'value' in content ? content.value : null;
      if (prop && value && typeof value === 'object' && 'formatted' in value && !value.formatted) return { path, content, prop };
      if (content.type === 'grid' || content.type === 'scrollArea') {
        const inner = firstTextElement(content, path);
        if (inner) return inner;
      }
    }
  }
  return null;
}

const encoder = new TextEncoder();
const bytesOf = (source: string) => encoder.encode(source); // as projectBlob: U+FEFF becomes the byte-order mark

function startsWith(a: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.length <= a.length && prefix.every((b, i) => a[i] === b);
}
function endsWith(a: Uint8Array, suffix: Uint8Array): boolean {
  const off = a.length - suffix.length;
  return off >= 0 && suffix.every((b, i) => a[off + i] === b);
}

interface Case { readonly file: string; readonly bytes: Uint8Array; readonly blockIndex: number }

const cases: Case[] = [];
for (const file of corpusFiles()) {
  const imported = importFile(file.bytes, file.name);
  if (!imported.ok) continue;
  const store = createStore({ write: async () => {}, announce: () => {} });
  store.load(recordOf(imported.state));
  for (const view of store.getSnapshot().blocks) {
    const model = view.kind === 'screen' ? view.classification.salt?.model : null;
    if (model && firstTextElement(model.root)) cases.push({ file: file.name, bytes: file.bytes, blockIndex: view.index });
  }
  store.dispose();
}

function recordOf(state: { source: string; flowIndex: number | null; lastWorking: readonly { blockIndex: number; text: string }[] }): ProjectRecord {
  return {
    id: 'fidelity', name: 'Fidelity', source: state.source, flowIndex: state.flowIndex, lastWorking: state.lastWorking.map((e) => ({ ...e })),
    createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1, downloadedAt: null, downloadedRevision: null,
  };
}

describe('edit fidelity: one Salt operation changes only that element (VO-020, screens)', () => {
  it('covers the corpus screens', () => {
    expect(cases.length).toBeGreaterThan(15);
    expect(new Set(cases.map((c) => c.file)).size).toBeGreaterThan(10);
  });

  it.each(cases.map((c) => [`${c.file} block ${c.blockIndex}`, c] as const))('%s', (_name, c) => {
    const imported = importFile(c.bytes, c.file);
    if (!imported.ok) throw new Error('import refused');
    const store = createStore({ write: async () => {}, announce: () => {} });
    store.load(recordOf(imported.state));
    const original = store.getState()!.source;
    // Import, then download without edits, is byte-identical.
    expect(bytesOf(original)).toEqual(c.bytes);

    const view = store.getSnapshot().blocks[c.blockIndex]!;
    const text = original.slice(view.start, view.end);
    const model = view.classification.salt!.model as SaltScreen;
    const target = firstTextElement(model.root)!;
    const op = setProperty({ text, model }, target.path, target.prop, 'Zq');
    expect(op.ok, op.ok ? '' : op.messageKey).toBe(true);
    if (!op.ok) return;
    const absolute: TextEdit[] = op.edits.map((e) => ({ ...e, start: e.start + view.start, end: e.end + view.start }));
    expect(store.applyOp({ ...op, edits: absolute }, { blockKey: view.key })).toBe(true);

    const downloaded = bytesOf(store.getState()!.source);
    expect(downloaded).not.toEqual(c.bytes);
    const elStart = view.start + target.content.range.start;
    const elEnd = view.start + target.content.range.end;
    expect(startsWith(downloaded, bytesOf(original.slice(0, elStart))), 'bytes before the element are unchanged').toBe(true);
    expect(endsWith(downloaded, bytesOf(original.slice(elEnd))), 'bytes after the element are unchanged').toBe(true);
    const middle = store.getState()!.source.slice(elStart, store.getState()!.source.length - (original.length - elEnd));
    expect(middle).toContain('Zq');
    store.dispose();
  });
});
