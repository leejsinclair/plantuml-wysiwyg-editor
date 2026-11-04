// Block classification (spec section 4, data-model §4.3 and §7.1, contracts/core-api.md §2).
// Categories 1 to 3 come from the editor's own grammar, synchronously and without the renderer. Blocks whose
// structure is not analysed (other content) are checked only for external dependence.

import type { BlockKind, BlockStatus, Diagnostic, MessageParams } from '../types.ts';
import { parseSalt, type SaltParseResult } from '../salt/parser.ts';
import { parseActivity, type ActivityParse } from '../activity/parser.ts';
import type { Path } from '../activity/model.ts';

/** What the block is, structurally. Which activity block is the screen flow is decided by the project. */
export type BlockSyntax = 'salt' | 'activity' | 'olderFormat' | 'other';

/** Reason keys `classify` adds to the parsers' own (their strings are in src/ui/messages/en/reasons.ts). */
export const REASONS = {
  lockedParts: 'reason.lockedParts',
  dependsOnExternal: 'reason.dependsOnExternal',
  olderFormat: 'reason.olderFormat',
  otherContent: 'reason.otherContent',
  /** An activity block that could be the flow, when another block already is. */
  extraActivity: 'reason.extraActivity',
} as const;

export interface Classification {
  readonly syntax: BlockSyntax;
  /** 1 supported, 2 unsupported constructs, 3 invalid; `null` for content whose structure is not analysed. */
  readonly category: 1 | 2 | 3 | null;
  /** For category 2: every unsupported construct is a locked part. `false` means source-only. */
  readonly isolable: boolean;
  /** Uses `!include` or another file or URL reference; the renderer never resolves these (EC-13). */
  readonly dependsOnExternal: boolean;
  readonly olderFormat: boolean;
  /** An activity block in the current syntax that is category 1 or isolable category 2 (FR-006/AC14). */
  readonly flowCandidate: boolean;
  readonly diagnostics: readonly Diagnostic[];
  /** The first syntax error, for "Fix in source" (FR-004/AC4). */
  readonly problem: { readonly line: number; readonly messageKey: string; readonly params?: MessageParams } | null;
  /** The plain-language reason for the block's status; `null` when it is fully supported. */
  readonly reasonKey: string | null;
  readonly reasonParams?: MessageParams;
  readonly salt: SaltParseResult | null;
  readonly activity: ActivityParse | null;
}

const EXTERNAL = /^[ \t]*!(?:include\w*|import)\b|^[ \t]*!theme[ \t]+\S+[ \t]+from\b/im;
/** Lines that may come before an activity diagram's first statement without saying what the diagram is. */
const PREAMBLE = /^(?:'.*|!.*|skinparam\b.*|title\b.*|header\b.*|footer\b.*|caption\b.*|scale\b.*|hide\b.*|)$/i;
const ACTIVITY_START = /^(?:start|stop|end|:|\||if\s*\(|repeat\b|while\s*\(|fork\b|switch\s*\(|partition\b|split\b|detach\b|kill\b|\(\*\))/i;

/** The lines between the block's start and end lines, with block comments dropped. */
function bodyLines(blockText: string): string[] {
  const lines = blockText.split(/\r\n|\r|\n/).slice(1);
  const out: string[] = [];
  let inComment = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^@end/i.test(line)) break;
    if (inComment) {
      if (line.endsWith("'/")) inComment = false;
      continue;
    }
    if (line.startsWith("/'")) {
      inComment = !line.endsWith("'/") || line.length < 4;
      continue;
    }
    out.push(line);
  }
  return out;
}

function syntaxOf(blockText: string): BlockSyntax {
  const opener = /^\s*@(\w+)/.exec(blockText)?.[1]?.toLowerCase();
  if (opener === 'startsalt') return 'salt';
  if (opener !== 'startuml') return 'other';
  const significant = bodyLines(blockText).filter((l) => !PREAMBLE.test(l));
  const first = significant[0] ?? '';
  if (/^salt$/i.test(first)) return 'olderFormat';
  return ACTIVITY_START.test(first) ? 'activity' : 'other';
}

function countLocked(path: Path): number {
  let n = 0;
  for (const e of path.elements) {
    if (e.kind === 'locked') n += 1;
    else if (e.kind === 'decision') for (const b of e.branches) n += countLocked(b.path);
    else if (e.kind === 'loop') n += countLocked(e.body);
  }
  return n;
}

/** Classifies one block's text, from its `@start…` line to its `@end…` line. */
export function classify(blockText: string): Classification {
  const syntax = syntaxOf(blockText);
  const dependsOnExternal = EXTERNAL.test(blockText);
  const base = { syntax, dependsOnExternal, olderFormat: syntax === 'olderFormat', salt: null, activity: null };

  if (syntax === 'olderFormat' || syntax === 'other') {
    return {
      ...base, category: null, isolable: false, flowCandidate: false, diagnostics: [], problem: null,
      reasonKey: dependsOnExternal ? REASONS.dependsOnExternal : syntax === 'olderFormat' ? REASONS.olderFormat : REASONS.otherContent,
    };
  }

  const salt = syntax === 'salt' ? parseSalt(blockText) : null;
  const activity = syntax === 'activity' ? parseActivity(blockText) : null;
  const diagnostics = (salt ?? activity)!.diagnostics;
  const error = (salt ?? activity)!.errors[0];
  const unsupported = diagnostics.find((d) => d.kind !== 'syntax');
  const locked = salt ? salt.lockedParts.length : activity!.model ? countLocked(activity!.model.main) : 0;

  const category = error ? 3 : unsupported || locked > 0 ? 2 : 1;
  const isolable = category !== 3 && !unsupported;
  let reasonKey: string | null = null;
  let reasonParams: MessageParams | undefined;
  if (error) [reasonKey, reasonParams] = [error.messageKey, error.params];
  else if (dependsOnExternal) reasonKey = REASONS.dependsOnExternal;
  else if (unsupported) [reasonKey, reasonParams] = [unsupported.messageKey, unsupported.params];
  else if (locked > 0) [reasonKey, reasonParams] = [REASONS.lockedParts, { count: locked }];

  return {
    ...base, salt, activity, category, isolable, diagnostics,
    flowCandidate: syntax === 'activity' && isolable,
    problem: error ? { line: error.line, messageKey: error.messageKey, ...(error.params ? { params: error.params } : {}) } : null,
    reasonKey,
    ...(reasonParams ? { reasonParams } : {}),
  };
}

/**
 * The status shown in the project panel (data-model §7.1; the first matching rule wins). `latestRenderFailed`
 * matters only for blocks the editor cannot analyse fully: source-only screens and flows, and other content.
 */
export function blockStatus(kind: BlockKind, c: Classification, latestRenderFailed = false): BlockStatus {
  const editorBlock = kind !== 'other';
  if (editorBlock && c.category === 3) return 'Error';
  if (!editorBlock && c.olderFormat) return 'Older format';
  if (c.dependsOnExternal) return 'Cannot be rendered';
  const sourceOnly = !editorBlock || c.category === null || (c.category === 2 && !c.isolable);
  if (sourceOnly) return latestRenderFailed ? 'Cannot be rendered' : 'Source only';
  return c.category === 2 ? 'Has locked parts' : 'Editable';
}
