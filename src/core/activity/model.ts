// The screen-flow model (data-model §5.3), derived from the lossless activity syntax tree (R-3).
// Every node keeps the block-relative range of its source and the full-line comments directly before it
// (`leadingComments`), which move and are deleted with it (FR-020/AC4, A-3). A node's structural path
// (indices from the main path) identifies it for selection, destinations and undo.
import type { TextRange } from '../types.ts';

/** User-visible text (data-model §5.1). */
export interface TextValue {
  /** The literal text the user sees and types. */
  readonly text: string;
  /** Where it lives in the source (block-relative). */
  readonly raw: TextRange;
  /** The source differs from the editor's own escaped form of `text` (imported creole or markup). */
  readonly formatted: boolean;
}

/** A note attached to the element it follows, or to the start of a branch or loop body. */
export interface Note {
  readonly kind: 'note';
  readonly side: 'left' | 'right';
  readonly text: TextValue;
  readonly form: 'singleLine' | 'block';
  readonly range: TextRange;
  readonly leadingComments: readonly TextRange[];
}

interface NodeBase {
  /** The element's whole source, from its first to its last token. */
  readonly range: TextRange;
  readonly leadingComments: readonly TextRange[];
  /** Notes following the element, in order. */
  readonly notes: readonly Note[];
}

interface LanedBase extends NodeBase {
  /** The lane in effect before the element in source order; `null` only when the flow has no lanes. */
  readonly lane: string | null;
}

export interface Start extends NodeBase {
  readonly kind: 'start';
}

export interface Stop extends NodeBase {
  readonly kind: 'stop';
  /** `stop` as the palette writes it; an imported `end` is preserved. */
  readonly keyword: 'stop' | 'end';
}

/** The link from a step to a screen, `:[[#<target> <label>]];`. */
export interface Link {
  /** The screen name after `#`, as written. */
  readonly target: string;
  readonly raw: TextRange;
}

export interface Step extends LanedBase {
  readonly kind: 'step';
  readonly label: TextValue;
  readonly link: Link | null;
}

export interface Branch {
  readonly branchKind: 'if' | 'elseif' | 'else';
  /** Required for `if` and `elseif`; `null` for `else`. */
  readonly condition: TextValue | null;
  /** The `then (…)` or `else (…)` label. */
  readonly label: TextValue | null;
  readonly path: Path;
  /** The branch's header line (`if …`, `elseif …` or `else …`). */
  readonly header: TextRange;
  /** The header to the end of the branch's path. */
  readonly range: TextRange;
}

export interface Decision extends LanedBase {
  readonly kind: 'decision';
  /** As written: an imported `if` with no `else` has one branch. */
  readonly branches: readonly Branch[];
  /** The `endif` line. */
  readonly end: TextRange;
}

export interface LoopLabels {
  /** `while (…) is (…)` or `repeat while (…) is (…)`. */
  readonly is: TextValue | null;
  /** `endwhile (…)` or `repeat while (…) not (…)`. */
  readonly exit: TextValue | null;
}

export interface Loop extends LanedBase {
  readonly kind: 'loop';
  readonly loopKind: 'repeat' | 'while';
  readonly condition: TextValue | null;
  readonly labels: LoopLabels;
  /** May be empty. */
  readonly body: Path;
  /** The opening line (`repeat` or `while …`). */
  readonly header: TextRange;
  /** The closing line (`repeat while …` or `endwhile …`). */
  readonly end: TextRange;
}

/** Message keys for why a part of the flow is locked (section 4.1, EC-10, OD-6). */
export type FlowLockReason =
  | 'locked.fork'
  | 'locked.split'
  | 'locked.switch'
  | 'locked.partition'
  | 'locked.detach'
  | 'locked.kill'
  | 'locked.embeddedSalt'
  | 'locked.arrowLabel'
  | 'locked.arrow'
  | 'locked.stepShape'
  | 'locked.note'
  | 'locked.decisionForm'
  | 'locked.loopForm'
  | 'locked.statement';

/** Valid content the editor does not support, kept exactly and moved or deleted as a unit. */
export interface LockedPart extends LanedBase {
  readonly kind: 'locked';
  readonly reason: FlowLockReason;
  /** The source text of the part. */
  readonly excerpt: string;
}

export type FlowElement = Start | Stop | Step | Decision | Loop | LockedPart;

export interface Path {
  /** Notes at the beginning of a branch or loop body, before any element. */
  readonly leadingNotes: readonly Note[];
  /** May be empty: an empty path is a selectable insertion slot. */
  readonly elements: readonly FlowElement[];
}

export interface Lane {
  /** As written between the bars, trimmed. */
  readonly name: string;
  /** The switch that introduced the lane, with any decoration such as a colour; `null` for a new lane. */
  readonly raw: TextRange | null;
}

/** A `|Lane|` line. Renaming a lane rewrites every switch naming it. */
export interface LaneSwitch {
  readonly lane: string;
  readonly range: TextRange;
  /** The name between the last two bars. */
  readonly nameRange: TextRange;
  readonly leadingComments: readonly TextRange[];
}

export interface ScreenFlow {
  /** In order of first appearance, which is the order the render shows them (FR-012/AC12). */
  readonly lanes: readonly Lane[];
  readonly laneSwitches: readonly LaneSwitch[];
  /** Begins with the initial start and ends with the final stop when the source does. */
  readonly main: Path;
}

/** The contract's name for the flow model (contracts/core-api.md §3). */
export type FlowModel = ScreenFlow;
