// Wrap and unwrap (FR-002/AC11, section 3.2 "Container style"). Wrapping puts the selected element in a new grid or
// group box, which appears as a visible parent in the outline; combinations of container styles are made this way.
// Unwrap is offered only for a grid that holds a single element and has no style, and puts the element back in
// the grid's place. New containers are written in the house style; the wrapped element's own lines move one level.
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { OpResult, Path, TextRange } from '../../types.ts';
import { INDENT, salt } from '../../project/house-style.ts';
import { escapeSaltText } from '../escape.ts';
import type { CellContent, Container } from '../model.ts';
import { locate, type ScreenDoc } from '../destinations.ts';
import { eolOf, escapeTitle, indentAt, reindent, startsLine } from './presets.ts';

export type WrapKind = 'grid' | 'group box';

/** A text cell written for the first-cell position of a row (section 3.4), when it is plain text. */
function asFirstCell(content: CellContent, source: string, first: boolean): string {
  if (content.type !== 'text' || content.text.formatted) return source;
  return escapeSaltText(content.text.text, { firstCellOfRow: first });
}

export function wrap(doc: ScreenDoc, target: Path, as: WrapKind): OpResult {
  const at = locate(doc.model, target);
  let range: TextRange;
  let content: CellContent | null = null;
  if (!at || at.kind === 'row') return { ok: false, messageKey: 'screen.refuse.wrapNothing' };
  if (at.kind === 'container') range = at.container.range;
  else if (at.kind === 'separator') range = at.row.range;
  else {
    if (at.cell.content.type === 'empty') return { ok: false, messageKey: 'screen.refuse.wrapEmpty' };
    content = at.cell.content;
    range = content.range;
  }
  const { text } = doc;
  const eol = eolOf(text);
  const base = indentAt(text, range.start);
  let inner = reindent(text.slice(range.start, range.end), base, base + INDENT);
  if (content) inner = asFirstCell(content, inner, true);
  const opener = as === 'grid' ? '{' : salt.opener({ style: 'groupBox', title: escapeTitle(salt.DEFAULTS.groupTitle) });
  const written = [opener, base + INDENT + inner, `${base}}`].join(eol);
  return {
    ok: true,
    edits: [{ start: range.start, end: range.end, text: written }],
    select: at.kind === 'separator' ? [...target, 0] : target,
    announceKey: as === 'grid' ? 'screen.announce.wrappedGrid' : 'screen.announce.wrappedGroup',
    historyName: as === 'grid' ? 'screen.history.wrapGrid' : 'screen.history.wrapGroup',
  };
}

/** The single element of a plain grid, or `null`. */
function singleElement(c: Container): { range: TextRange; content: CellContent | null } | null {
  if (c.type !== 'grid' || c.style !== 'plain' || c.rows.length !== 1) return null;
  const row = c.rows[0]!;
  if (row.type === 'separator') return { range: row.range, content: null };
  if (row.cells.length !== 1) return null;
  const only = row.cells[0]!;
  if (only.content.type === 'empty' || only.span !== 1) return null;
  return { range: only.content.range, content: only.content };
}

/**
 * The grid "Unwrap" applies to for a selection: the selected grid itself, or else the grid holding the selected
 * element. `null` when neither is a single-element grid with no style.
 */
export function canUnwrap(model: ScreenDoc['model'], path: Path): Path | null {
  const fits = (p: Path): boolean => {
    const at = locate(model, p);
    const grid = at?.kind === 'container' ? at.container : at?.kind === 'cell' ? at.cell.content : null;
    if (!grid || grid.type !== 'grid') return false;
    const single = singleElement(grid);
    if (!single) return false;
    // The root must stay a grid; a separator needs a row of its own.
    if (p.length === 0) return single.content?.type === 'grid';
    if (single.content === null) return at?.kind === 'cell' && at.row.cells.length === 1;
    return true;
  };
  const at = locate(model, path);
  if (!at) return null;
  if ((at.kind === 'cell' || at.kind === 'container') && fits(path)) return path;
  if (at.kind === 'cell' || at.kind === 'separator') {
    const parent = at.containerPath;
    if (fits(parent)) return parent;
  }
  return null;
}

export function unwrap(doc: ScreenDoc, target: Path): OpResult {
  const g = canUnwrap(doc.model, target);
  if (!g) return { ok: false, messageKey: 'screen.refuse.unwrap' };
  const at = locate(doc.model, g)!;
  const grid = (at.kind === 'container' ? at.container : at.kind === 'cell' ? at.cell.content : null) as Container;
  const single = singleElement(grid)!;
  const { text } = doc;
  const base = indentAt(text, grid.range.start);
  const innerIndent = startsLine(text, single.range.start) ? indentAt(text, single.range.start) : base;
  let written = reindent(text.slice(single.range.start, single.range.end), innerIndent, base);
  if (single.content && at.kind === 'cell') written = asFirstCell(single.content, written, at.cellIndex === 0);
  // A separator replaces the whole row it was wrapped in.
  const range = single.content === null && at.kind === 'cell' ? at.row.range : grid.range;
  return {
    ok: true,
    edits: [{ start: range.start, end: range.end, text: written }],
    select: single.content === null ? g.slice(0, -1) : g,
    announceKey: 'screen.announce.unwrapped',
    historyName: 'screen.history.unwrap',
  };
}
