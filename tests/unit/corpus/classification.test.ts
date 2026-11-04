// The editor's view of every corpus file matches its sidecar (tests/corpus/README.md), plus the import cases of
// VO-015, VO-016, VO-019, VO-094, VO-106, VO-107, VO-108, VO-111, VO-116 and VO-119.
import { describe, expect, it } from 'vitest';
import { corpusFiles } from './corpus.ts';
import { decode } from '../../../src/core/source/decode.ts';
import { blocks, importSource, withKeys, type BlockView } from '../../../src/core/project/project.ts';
import { linkStatus } from '../../../src/core/project/links.ts';

const files = corpusFiles();
let n = 0;

function open(name: string): { source: string; flowIndex: number | null; view: BlockView[] } {
  const file = files.find((f) => f.name === name);
  if (!file) throw new Error(`no corpus file ${name}`);
  const decoded = decode(file.bytes);
  if (!decoded.ok) throw new Error(`${name} does not decode`);
  const state = withKeys(importSource(decoded.text), () => `k${++n}`);
  return { source: state.source, flowIndex: state.flowIndex, view: blocks(state) };
}

describe('corpus sidecars', () => {
  it.each(files.filter((f) => f.expected).map((f) => [f.name, f] as const))('%s', (name, file) => {
    const { flowIndex, view } = open(name);
    const expected = file.expected!;
    expect(flowIndex).toBe(expected.flowIndex);
    expect(view.map((b) => ({ kind: b.kind, status: b.status, name: b.name, nameFlag: b.nameFlag }))).toEqual(
      expected.blocks.map((b) => ({ kind: b.kind, status: b.status, name: b.name, nameFlag: b.nameFlag })),
    );
    expected.blocks.forEach((b, i) => {
      if (b.reasonKey !== undefined) expect(view[i]!.reasonKey, `block ${i} reason`).toBe(b.reasonKey);
      if (b.line !== undefined) expect(view[i]!.classification.problem?.line, `block ${i} line`).toBe(b.line);
    });
  });
});

describe('import cases', () => {
  it('VO-015: a tree-table variant is a locked part with reason and excerpt; the rest stays editable', () => {
    const [screen] = open('import/tree-table.puml').view;
    const locked = screen!.classification.salt!.lockedParts;
    expect(locked).toHaveLength(1);
    expect(locked[0]).toMatchObject({ reason: 'locked.treeTable' });
    expect(screen!.classification.salt!.model).not.toBeNull();
  });

  it('VO-016: a screen using !define is source-only, naming the preprocessor use', () => {
    expect(open('import/preprocessor-define.puml').view[0]).toMatchObject({ status: 'Source only', reasonKey: 'sourceOnly.preprocessor' });
  });

  it('VO-019: the first supported activity diagram is the flow; the sequence and the second activity are other content', () => {
    const { flowIndex, view } = open('import/sequence-and-two-activities.puml');
    expect(flowIndex).toBe(1);
    expect(view.map((b) => b.kind)).toEqual(['other', 'flow', 'other']);
  });

  it('VO-094: ignored content is source-only and its message names the content that will not appear', () => {
    for (const name of ['import/several-root-grids.puml', 'import/text-after-root-grid.puml']) {
      const [b] = open(name).view;
      expect(b!.status).toBe('Source only');
      expect(b!.reasonKey).toMatch(/^ignored\./);
      expect(String(b!.reasonParams?.content ?? '')).not.toBe('');
      expect(b!.classification.diagnostics.some((d) => d.kind === 'ignoredContent')).toBe(true);
    }
  });

  it('VO-106: every status comes with a plain-language reason and is Not yet checked until rendered', () => {
    const all = files.filter((f) => f.expected && f.name.startsWith('import/')).flatMap((f) => open(f.name).view);
    for (const b of all) {
      expect(b.renderStatus).toBe('Not yet checked');
      if (b.status !== 'Editable') expect(b.reasonKey, `${b.name} (${b.status})`).not.toBeNull();
    }
    expect(new Set(all.map((b) => b.status))).toEqual(new Set(['Editable', 'Has locked parts', 'Source only', 'Error', 'Older format', 'Cannot be rendered']));
  });

  it('VO-107: isolatable flow content is locked at the smallest unit with its reason', () => {
    const reasons = (name: string) => {
      const { view, flowIndex } = open(name);
      const flow = view[flowIndex!]!.classification.activity!.model!;
      const out: string[] = [];
      const walk = (els: typeof flow.main.elements) => {
        for (const e of els) {
          if (e.kind === 'locked') out.push(e.reason);
          else if (e.kind === 'decision') e.branches.forEach((b) => walk(b.path.elements));
          else if (e.kind === 'loop') walk(e.body.elements);
        }
      };
      walk(flow.main.elements);
      return out;
    };
    expect(reasons('import/fork.puml')).toEqual(['locked.fork']);
    expect(reasons('import/switch.puml')).toEqual(['locked.switch']);
    expect(reasons('import/partition.puml')).toEqual(['locked.partition']);
    expect(reasons('import/detach-kill.puml')).toEqual(['locked.kill', 'locked.detach']);
    expect(reasons('import/salt-inside-step.puml')).toEqual(['locked.embeddedSalt']);
  });

  it('VO-108: preprocessor, several style modifiers, legacy syntax and goto are source-only; legacy and goto are never the flow', () => {
    expect(open('import/multiple-style-modifiers.puml').view[0]).toMatchObject({ status: 'Source only', reasonKey: 'sourceOnly.multipleStyles' });
    const legacy = open('import/legacy-activity.puml');
    expect(legacy.flowIndex).toBeNull();
    expect(legacy.view[1]!.classification.reasonKey).toBe('diagnostic.unsupported.legacyActivity');
    const goto = open('import/goto-label.puml');
    expect(goto.flowIndex).toBe(1);
    expect(goto.view[0]!.classification.reasonKey).toBe('diagnostic.unsupported.gotoLabel');
  });

  it('VO-111: an unknown container modifier and arrow labels are locked, never Error', () => {
    expect(open('import/unknown-container-modifier.puml').view[0]!.status).toBe('Has locked parts');
    expect(open('import/arrow-labels.puml').view[0]!.status).toBe('Has locked parts');
  });

  it('VO-116: unnamed screens keep no name; bad names are flagged, not changed; a case-only link is broken with a fix', () => {
    const unnamed = open('import/unnamed-screen.puml');
    expect(unnamed.view.map((b) => [b.name, b.untitledNumber])).toEqual([[null, 1], ['Named', null]]);
    expect(open('import/disallowed-names.puml').view.map((b) => b.nameFlag)).toEqual(['not-allowed', 'not-allowed', 'not-allowed']);
    const { view, flowIndex } = open('import/case-only-link.puml');
    const step = view[flowIndex!]!.classification.activity!.model!.main.elements[1]!;
    expect(step.kind === 'step' && step.link?.target).toBe('login');
    expect(linkStatus('login', view.filter((b) => b.kind === 'screen').map((b) => b.name))).toEqual({ status: 'brokenCaseOnly', suggestion: 'Login' });
    expect(view[0]!.incomingLinks).toBe(0);
  });

  it('VO-119: a single Salt block opens as a one-screen project without conversion', () => {
    const file = files.find((f) => f.name === 'import/single-salt-block.puml')!;
    const { source, view } = open('import/single-salt-block.puml');
    expect(source).toBe((decode(file.bytes) as { text: string }).text);
    expect(view).toHaveLength(1);
    expect(view[0]).toMatchObject({ kind: 'screen', status: 'Editable' });
  });
});
