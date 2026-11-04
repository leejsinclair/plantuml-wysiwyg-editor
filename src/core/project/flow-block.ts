// Adding and deleting the screen-flow block (FR-012/AC8, AC13, FR-015/AC1, project-file.md §4 and §7,
// data-model §7.7; VO-032, VO-125).
//
// - "Add screen flow" writes `@startuml Screen-flow`, `start`, `stop`, `@enduml` at the end of the file in the
//   file's line ending (a generated name gets "-2", "-3" … when "Screen-flow" is taken) and makes it the flow.
// - Deleting the flow removes the block and the comment lines directly above it and clears `flowIndex`; the
//   caller confirms first. A project's last block is never removed (EC-01).
// Both return the edits and the block order (`order[newIndex]` = old index, `null` for a new block) for the
// store, which records `flowIndex` with the text so undo restores it.
import type { TextEdit } from '../types.ts';
import { split, type Segment } from '../blocks/split.ts';
import { generate } from '../names/names.ts';
import { chooseLineEnding, newFlowBlock } from './house-style.ts';

type BlockSegment = Extract<Segment, { type: 'block' }>;
const blockSegments = (source: string): BlockSegment[] => split(source).filter((s): s is BlockSegment => s.type === 'block');

export type AddFlowResult =
  | { readonly ok: true; readonly edits: TextEdit[]; readonly flowIndex: number; readonly order: (number | null)[]; readonly name: string }
  | { readonly ok: false; readonly messageKey: string };

export type DeleteFlowResult =
  | { readonly ok: true; readonly edits: TextEdit[]; readonly order: (number | null)[]; readonly name: string | null }
  | { readonly ok: false; readonly messageKey: string };

/** A new screen flow at the end of the file. Refused when the project already has one. */
export function addFlow(source: string, flowIndex: number | null): AddFlowResult {
  const segments = blockSegments(source);
  if (flowIndex !== null && segments[flowIndex]) return { ok: false, messageKey: 'flow.refused.flowExists' };
  const name = generate('flow', new Set(segments.map((s) => s.name).filter((n): n is string => n !== null)));
  const eol = chooseLineEnding({ file: source });
  const separator = source === '' || /[\r\n]$/.test(source) ? '' : eol;
  return {
    ok: true,
    edits: [{ start: source.length, end: source.length, text: separator + newFlowBlock(name, eol) }],
    flowIndex: segments.length,
    order: [...segments.map((_, i) => i), null],
    name,
  };
}

/** Removes the screen flow with the comment lines directly above it. The caller has confirmed. */
export function deleteFlow(source: string, flowIndex: number | null): DeleteFlowResult {
  const segments = blockSegments(source);
  const flow = flowIndex === null ? undefined : segments[flowIndex];
  if (!flow || flowIndex === null) return { ok: false, messageKey: 'flow.refused.noFlow' };
  if (segments.length === 1) return { ok: false, messageKey: 'flow.refused.lastBlock' };
  return {
    ok: true,
    edits: [{ start: flow.commentStart, end: flow.end, text: '' }],
    order: segments.map((_, i) => i).filter((i) => i !== flowIndex),
    name: flow.name,
  };
}
