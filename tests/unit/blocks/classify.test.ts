import { describe, expect, it } from 'vitest';
import { blockStatus, classify, REASONS } from '../../../src/core/blocks/classify.ts';
import { LOCKED_REASONS, SOURCE_ONLY_REASONS } from '../../../src/core/salt/model.ts';
import type { FlowLockReason } from '../../../src/core/activity/model.ts';
import { has } from '../../../src/ui/messages/en.ts';

const salt = (body: string, head = '') => `@startsalt Screen${head}\n${body}\n@endsalt\n`;
const uml = (body: string) => `@startuml Flow\n${body}\n@enduml\n`;

describe('classify: screens', () => {
  it('a fully supported screen is category 1 and Editable', () => {
    const c = classify(salt('{\n  [OK] | "name  "\n}'));
    expect(c).toMatchObject({ syntax: 'salt', category: 1, isolable: true, dependsOnExternal: false, reasonKey: null });
    expect(blockStatus('screen', c)).toBe('Editable');
    expect(c.salt?.model).not.toBeNull();
  });

  it('isolable unsupported content is category 2 with locked parts', () => {
    const c = classify(salt('{\n  {T#\n  + Name | Value\n  }\n  [OK]\n}'));
    expect(c).toMatchObject({ category: 2, isolable: true, reasonKey: REASONS.lockedParts });
    expect(c.reasonParams).toEqual({ count: 1 });
    expect(blockStatus('screen', c)).toBe('Has locked parts');
  });

  it('preprocessor use makes the screen source-only (EC-09)', () => {
    const c = classify(salt('!define BTN [OK]\n{\n  BTN\n}'));
    expect(c).toMatchObject({ category: 2, isolable: false, reasonKey: SOURCE_ONLY_REASONS.preprocessor });
    expect(blockStatus('screen', c)).toBe('Source only');
  });

  it('content PlantUML ignores is source-only with an ignored-content reason naming it (EC-08)', () => {
    const c = classify(salt('{\n  first\n}\n{\n  second\n}'));
    expect(c).toMatchObject({ category: 2, isolable: false, reasonKey: SOURCE_ONLY_REASONS.severalRootGrids });
    expect(c.diagnostics.some((d) => d.kind === 'ignoredContent')).toBe(true);
    expect(c.reasonParams?.content).toBeDefined();
    expect(blockStatus('screen', c)).toBe('Source only');
  });

  it('structurally malformed source is category 3, Error, with the problem line', () => {
    const c = classify(salt('{\n  a | b\n  {\n    c\n}'));
    expect(c.category).toBe(3);
    expect(c.problem?.line).toBeGreaterThan(0);
    expect(c.reasonKey).toBe(c.problem?.messageKey);
    expect(blockStatus('screen', c)).toBe('Error');
  });

  it('a block that depends on !include cannot be rendered, detected without rendering (EC-13)', () => {
    const c = classify(salt('!include common.puml\n{\n  a\n}'));
    expect(c).toMatchObject({ dependsOnExternal: true, reasonKey: REASONS.dependsOnExternal });
    expect(blockStatus('screen', c)).toBe('Cannot be rendered');
    for (const line of ['!include_many x.puml', '!includeurl https://x/y.puml', '!includesub f!PART', '!import lib', '!theme mine from ./themes'])
      expect(classify(uml(`${line}\nstart\nstop`)).dependsOnExternal, line).toBe(true);
    expect(classify(salt('!theme cerulean\n{\n  a\n}')).dependsOnExternal).toBe(false);
  });

  it('a render failure does not change the status of a block the editor can edit', () => {
    expect(blockStatus('screen', classify(salt('{\n  a\n}')), true)).toBe('Editable');
  });
});

describe('classify: activity blocks and other content', () => {
  it('a supported activity block is category 1 and a flow candidate', () => {
    const c = classify(uml('start\n:Enter details;\nstop'));
    expect(c).toMatchObject({ syntax: 'activity', category: 1, flowCandidate: true });
    expect(blockStatus('flow', c)).toBe('Editable');
    expect(blockStatus('other', c)).toBe('Source only');
  });

  it('recognises an activity block after title, comments and skinparam lines', () => {
    expect(classify(uml("' notes\ntitle Journey\nskinparam monochrome true\n|User|\nstart\nstop")).syntax).toBe('activity');
  });

  it('isolable unsupported activity content keeps the block a flow candidate with locked parts (EC-10)', () => {
    const c = classify(uml('start\nfork\n  :A;\nfork again\n  :B;\nend fork\nstop'));
    expect(c).toMatchObject({ category: 2, isolable: true, flowCandidate: true, reasonKey: REASONS.lockedParts });
    expect(blockStatus('flow', c)).toBe('Has locked parts');
  });

  it('legacy syntax and goto/label are source-only and never flow candidates (EC-09)', () => {
    for (const body of ['(*) --> "First"\n"First" --> (*)', 'start\nlabel here\n:a;\ngoto here']) {
      const c = classify(uml(body));
      expect(c, body).toMatchObject({ syntax: 'activity', category: 2, isolable: false, flowCandidate: false });
      expect(blockStatus('other', c)).toBe('Source only');
    }
  });

  it('an invalid activity block is not a flow candidate, and is an Error once it is the flow', () => {
    const c = classify(uml('start\nif (x?) then (yes)\n  :a;\nstop'));
    expect(c).toMatchObject({ category: 3, flowCandidate: false });
    expect(blockStatus('flow', c)).toBe('Error');
    expect(blockStatus('other', c)).toBe('Source only');
  });

  it('Salt written inside @startuml is other content in the older format (FR-010/AC7)', () => {
    const c = classify('@startuml Login\nsalt\n{\n  [OK]\n}\n@enduml\n');
    expect(c).toMatchObject({ syntax: 'olderFormat', olderFormat: true, category: null, reasonKey: REASONS.olderFormat });
    expect(blockStatus('other', c)).toBe('Older format');
  });

  it('other diagram types are other content, checked only for boundaries and external dependence', () => {
    const c = classify('@startuml\nAlice -> Bob : Hello\n@enduml\n');
    expect(c).toMatchObject({ syntax: 'other', category: null, flowCandidate: false, reasonKey: REASONS.otherContent });
    expect(c.diagnostics).toEqual([]);
    expect(blockStatus('other', c)).toBe('Source only');
    expect(blockStatus('other', c, true)).toBe('Cannot be rendered');
    expect(classify('@startmindmap\n* Root\n@endmindmap\n').syntax).toBe('other');
  });
});

describe('reason strings', () => {
  const flowLockReasons = [
    'locked.fork', 'locked.split', 'locked.switch', 'locked.partition', 'locked.detach', 'locked.kill', 'locked.embeddedSalt',
    'locked.arrowLabel', 'locked.arrow', 'locked.stepShape', 'locked.note', 'locked.decisionForm', 'locked.loopForm', 'locked.statement',
  ] as const satisfies readonly FlowLockReason[];
  const activitySourceOnly = ['diagnostic.unsupported.legacyActivity', 'diagnostic.unsupported.gotoLabel', 'diagnostic.unsupported.preprocessor'];

  it('every reason key the parsers and classify emit has a catalogue string', () => {
    const keys = [...Object.values(LOCKED_REASONS), ...Object.values(SOURCE_ONLY_REASONS), ...flowLockReasons, ...activitySourceOnly, ...Object.values(REASONS)];
    expect(keys.filter((k) => !has(k))).toEqual([]);
  });
});
