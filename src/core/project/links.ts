// Links from flow steps to screens (data-model §5.3 Link, FR-011/AC11, AC16, FR-013/AC4, EC-11).

import type { TextEdit } from '../types.ts';
import type { Path, ScreenFlow, Step } from '../activity/model.ts';
import { fold } from '../names/names.ts';

export type LinkStatus =
  | { readonly status: 'valid'; readonly screen: string }
  | { readonly status: 'broken' }
  /** No exact match, but one screen matches after case folding; it is offered as the fix. */
  | { readonly status: 'brokenCaseOnly'; readonly suggestion: string }
  /** More than one screen matches (imported duplicate names). */
  | { readonly status: 'ambiguous' };

function linkedSteps(path: Path, out: Step[] = []): Step[] {
  for (const e of path.elements) {
    if (e.kind === 'step' && e.link) out.push(e);
    else if (e.kind === 'decision') for (const b of e.branches) linkedSteps(b.path, out);
    else if (e.kind === 'loop') linkedSteps(e.body, out);
  }
  return out;
}

/** The steps whose target equals `name` after NFC, in source order (`incomingLinks`, FR-015/AC2). */
export function linksTo(flow: ScreenFlow, name: string): Step[] {
  const key = name.normalize('NFC');
  return linkedSteps(flow.main).filter((s) => s.link!.target.normalize('NFC') === key);
}

/** File-absolute edits that point every link to `oldName` at `newName`. `blockStart` is the flow block's offset. */
export function retargetEdits(flow: ScreenFlow, blockStart: number, oldName: string, newName: string): TextEdit[] {
  return linksTo(flow, oldName).map(({ link }) => ({ start: blockStart + link!.raw.start, end: blockStart + link!.raw.end, text: newName }));
}

/** The status of a link target against every screen's name; unnamed screens are `null`. */
export function linkStatus(target: string, screenNames: readonly (string | null)[]): LinkStatus {
  const names = screenNames.filter((n): n is string => n !== null);
  const key = target.normalize('NFC');
  const exact = names.filter((n) => n.normalize('NFC') === key);
  if (exact.length === 1) return { status: 'valid', screen: exact[0]! };
  if (exact.length > 1) return { status: 'ambiguous' };
  const folded = names.filter((n) => fold(n) === fold(target));
  if (folded.length === 1) return { status: 'brokenCaseOnly', suggestion: folded[0]! };
  return folded.length > 1 ? { status: 'ambiguous' } : { status: 'broken' };
}
