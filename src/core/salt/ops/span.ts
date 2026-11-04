// Column spans (FR-002/AC9, EC-03, section 3.2 "Spans"). A span is a property of a cell, written as `*` cells after
// it. It is never offered on the first cell of a row, extends only over empty cells to its right, and the property
// names what limits it ("Span limited by 'Password' in column 3"). A span wider than allowed is reduced to fit.
//
// Pure TypeScript: no DOM, no imports from src/ui or src/services (constitution principle 9).

import type { OpResult, Path, TextEdit } from '../../types.ts';
import type { CellContent, SaltScreen } from '../model.ts';
import { locate, type ScreenDoc } from '../destinations.ts';

export type SpanLimit =
  | { readonly kind: 'element'; readonly name: string; readonly column: number }
  | { readonly kind: 'rowEnd' };

export interface SpanInfo {
  /** False on the first cell of a row, or for anything that is not a cell. */
  readonly offered: boolean;
  readonly current: number;
  readonly max: number;
  /** What stops the span growing further: an element (with its 1-based column) or the end of the row. */
  readonly limit: SpanLimit | null;
}

/** The text a user would recognise an element by, or '' when it has none. */
export function elementName(content: CellContent): string {
  switch (content.type) {
    case 'text':
      return content.text.text;
    case 'button':
    case 'checkbox':
    case 'radioButton':
      return content.label.text;
    case 'textField':
    case 'dropDown':
      return content.value.text;
    case 'grid':
      return content.title?.text ?? '';
    default:
      return '';
  }
}

export function spanInfo(model: SaltScreen, target: Path): SpanInfo {
  const at = locate(model, target);
  if (!at || at.kind !== 'cell') return { offered: false, current: 1, max: 1, limit: null };
  const { cell, row, cellIndex } = at;
  if (cellIndex === 0 || cell.column === 0) return { offered: false, current: cell.span, max: cell.span, limit: null };
  let max = cell.span;
  let i = cellIndex + 1;
  for (; i < row.cells.length; i++) {
    const next = row.cells[i]!;
    if (next.content.type !== 'empty' || next.span !== 1) break;
    max++;
  }
  const blocker = row.cells[i];
  const limit: SpanLimit = blocker ? { kind: 'element', name: elementName(blocker.content), column: blocker.column + 1 } : { kind: 'rowEnd' };
  return { offered: true, current: cell.span, max, limit };
}

/** Sets the span of the cell at `target`, reduced to fit (EC-03). */
export function setSpan(doc: ScreenDoc, target: Path, span: number): OpResult {
  const info = spanInfo(doc.model, target);
  const at = locate(doc.model, target);
  if (!at || at.kind !== 'cell') return { ok: false, messageKey: 'screen.refuse.notACell' };
  if (!info.offered) return { ok: false, messageKey: 'screen.refuse.spanFirstCell' };
  const n = Math.max(1, Math.min(Math.floor(span), info.max));
  const { cell, row, cellIndex } = at;
  if (n === cell.span) return { ok: false, messageKey: 'screen.refuse.spanUnchanged', params: { span: n } };
  const edits: TextEdit[] = [];
  if (n > cell.span) {
    for (let k = 1; k <= n - cell.span; k++) {
      const empty = row.cells[cellIndex + k]!;
      edits.push({ start: empty.content.range.start, end: empty.content.range.end, text: '*' });
    }
  } else {
    for (const s of cell.spanRanges.slice(n - 1)) edits.push({ start: s.start, end: s.end, text: '.' });
  }
  return { ok: true, edits, select: target, announceKey: 'screen.announce.spanChanged', announceParams: { span: n }, historyName: 'screen.history.span' };
}
