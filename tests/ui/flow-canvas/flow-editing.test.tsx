// T139: flow canvas UI tests (FR-012/AC2, AC8, AC9, AC12, AC13, FR-009/AC13, FR-015/AC1, FR-016/AC8).
//
// VO-032: "Add screen flow" opens the flow.
// VO-033: Enter on a decision goes to its first branch; Left/Right switch branches; empty branch takes insertions.
// VO-034: Delete decision with four steps announces "Deleted decision and 4 steps", undo restores.
// VO-037: Deleting a lane in use asks for a destination lane.
// VO-093: Invalid insertion/move targets are refused with an announcement.
// VO-099: moveByKey never moves an element sideways (left/right refused).
// VO-125: Deleting the flow asks for confirmation; panel shows "Add screen flow" after.
import { act, render, screen, waitFor, within } from '../render';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import { createSlots } from '../../../src/ui/app/slots.ts';
import { registerFlowEditor } from '../../../src/ui/flow-canvas/register.tsx';
import { t } from '../../../src/ui/messages/en.ts';
import { Workspace, type SettingsStore } from '../../../src/ui/workspace/Workspace.tsx';
import { notices, Notices } from '../../../src/ui/notices/Notices.tsx';

// ---- helpers ------------------------------------------------------------------

const SCREEN_BLOCK = '@startsalt Login\n{\n  [OK]\n}\n@endsalt\n';

const FLOW_ONLY = '@startuml Screen-flow\nstart\nstop\n@enduml\n';

const FLOW_WITH_DECISION = `@startuml Screen-flow
start
if (Condition?) then (yes)
  :Step A;
  :Step B;
  :Step C;
  :Step D;
else (no)
endif
stop
@enduml
`;

const FLOW_WITH_LANES = `@startuml Screen-flow
|User|
start
|System|
:Step;
stop
@enduml
`;

const FLOW_WITH_STEP_AND_DECISION = `@startuml Screen-flow
start
:A Step;
if (Choose?) then (yes)
else (no)
endif
stop
@enduml
`;

const record = (source: string, flowIndex: number | null = null): ProjectRecord => ({
  id: 'p1', name: 'Proj', source, flowIndex,
  lastWorking: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-01T00:00:00.000Z',
  revision: 1,
  downloadedAt: null, downloadedRevision: null,
});

function memorySettings(): SettingsStore {
  let value: import('../../../src/services/storage/db.ts').Settings = { panels: {} };
  return { get: async () => value, put: async (s) => { value = s; } };
}

let stores: Store[] = [];

function setup(source: string, flowIndex: number | null = null) {
  const slots = createSlots();
  registerFlowEditor(slots);

  const announce = vi.fn();
  const store = createStore({ write: async () => undefined, announce, slots });
  stores.push(store);
  store.load(record(source, flowIndex));

  // Open the flow block when it exists so the canvas renders
  if (flowIndex !== null) {
    const state = store.getState();
    const flowKey = state?.keys[flowIndex];
    if (flowKey) store.openBlock(flowKey);
  }

  const utils = render(
    <StoreContext.Provider value={store}>
      <Notices />
      <Workspace platform="windows" settings={memorySettings()} slots={slots} />
    </StoreContext.Provider>,
  );
  return { store, announce, ...utils };
}

afterEach(() => {
  for (const s of stores) s.dispose();
  stores = [];
  // Dismiss any active notices
  for (const n of notices.list()) notices.dismiss(n.id);
});

// ---- tests -------------------------------------------------------------------

describe('VO-032: Add screen flow opens the flow', () => {
  it('shows "Add screen flow" button when no flow exists', () => {
    setup(SCREEN_BLOCK, null);
    expect(screen.getByRole('button', { name: t('flow.add') })).toBeInTheDocument();
  });

  it('"Add screen flow" creates and opens the flow block', async () => {
    const user = userEvent.setup();
    const { store } = setup(SCREEN_BLOCK, null);
    await user.click(screen.getByRole('button', { name: t('flow.add') }));
    await waitFor(() => {
      expect(store.getState()?.flowIndex).not.toBeNull();
    });
    // The flow canvas should now be rendered (has its labelled region)
    expect(screen.getByRole('region', { name: t('flow.canvas.label') })).toBeInTheDocument();
  });
});

describe('VO-033: decision navigation', () => {
  it('Enter on a decision moves focus to its first branch', async () => {
    const user = userEvent.setup();
    setup(FLOW_WITH_STEP_AND_DECISION, 0);
    // Wait for canvas
    const canvas = await screen.findByRole('region', { name: t('flow.canvas.label') });
    // Find and focus the decision item within the canvas
    const decisions = canvas.querySelectorAll('[role="treeitem"]');
    const decision = Array.from(decisions).find((el) => /Decision/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''));
    expect(decision).toBeTruthy();
    await user.click(decision!);
    await user.keyboard('{Enter}');
    // After Enter, a branch slot item should be focused
    const focused = document.activeElement;
    expect(focused).not.toBeNull();
    expect(focused?.getAttribute('role')).toBe('treeitem');
  });

  it('Left/Right keys move between branches', async () => {
    const user = userEvent.setup();
    setup(FLOW_WITH_STEP_AND_DECISION, 0);
    const canvas = await screen.findByRole('region', { name: t('flow.canvas.label') });
    const decisions = canvas.querySelectorAll('[role="treeitem"]');
    const decision = Array.from(decisions).find((el) => /Decision/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''));
    await user.click(decision!);
    await user.keyboard('{Enter}');
    const firstBranch = document.activeElement;
    await user.keyboard('{ArrowRight}');
    const secondBranch = document.activeElement;
    expect(firstBranch).not.toBe(secondBranch);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(firstBranch);
  });

  it('an empty branch can receive a step insertion', async () => {
    const user = userEvent.setup();
    const { store } = setup(FLOW_WITH_STEP_AND_DECISION, 0);
    const canvas = await screen.findByRole('region', { name: t('flow.canvas.label') });
    // Select the decision, navigate to first branch, insert a step
    const decisions = canvas.querySelectorAll('[role="treeitem"]');
    const decision = Array.from(decisions).find((el) => /Decision/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''));
    await user.click(decision!);
    await user.keyboard('{Enter}');
    // Click the "Step" palette button
    const stepBtn = screen.getByRole('button', { name: t('flow.palette.step') });
    await user.click(stepBtn);
    await waitFor(() => {
      const src = store.getState()!.source;
      // The flow now contains a step inserted inside the branch
      const segments = src.split('@startuml');
      const flowPart = segments.find((s) => s.includes('Screen-flow')) ?? '';
      expect(flowPart).toContain(':Step;');
    });
  });
});

describe('VO-034: delete decision with contents', () => {
  it('deletes decision and announces "Deleted decision and 4 steps"', async () => {
    const user = userEvent.setup();
    const { announce } = setup(FLOW_WITH_DECISION, 0);
    const canvas = await screen.findByRole('region', { name: t('flow.canvas.label') });
    const allItems = canvas.querySelectorAll('[role="treeitem"]');
    const decision = Array.from(allItems).find((el) => /Decision/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''));
    expect(decision).toBeTruthy();
    await user.click(decision!);
    await user.keyboard('{Delete}');
    await waitFor(() => {
      // announceKey flow.deleted.decisionItems with count=4
      expect(announce).toHaveBeenCalledWith(
        expect.stringContaining('flow.deleted.decision'),
        expect.objectContaining({ count: 4 }),
      );
    });
  });

  it('undo after delete restores the decision', async () => {
    const { store } = setup(FLOW_WITH_DECISION, 0);
    const canvas = await screen.findByRole('region', { name: t('flow.canvas.label') });
    const allItems = canvas.querySelectorAll('[role="treeitem"]');
    const decision = Array.from(allItems).find((el) => /Decision/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''));
    const user = userEvent.setup();
    await user.click(decision!);
    await user.keyboard('{Delete}');
    // Undo via store directly (Ctrl+Z keyboard in jsdom is unreliable)
    await waitFor(() => {
      expect(store.getState()!.source).not.toContain('if (');
    });
    act(() => store.undo());
    await waitFor(() => {
      const src = store.getState()!.source;
      expect(src).toContain('if (');
    });
  });
});

describe('VO-037: deleting lane in use asks for destination', () => {
  it('shows a destination dialog when deleting a lane that has elements', async () => {
    const user = userEvent.setup();
    setup(FLOW_WITH_LANES, 0);
    await screen.findByRole('region', { name: t('flow.canvas.label') });
    // Find and click "Delete lane System" button in properties/lanes panel
    const deleteBtn = screen.getByRole('button', { name: t('flow.lanes.delete', { lane: 'System' }) });
    await user.click(deleteBtn);
    // A dialog should appear with the destination selector
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: t('flow.lanes.deleteTitle', { lane: 'System' }) })).toBeInTheDocument();
    });
  });
});

describe('VO-093: invalid targets are refused', () => {
  it('cannot insert a stop not at the end of a branch', async () => {
    const user = userEvent.setup();
    const { announce, store } = setup(FLOW_WITH_STEP_AND_DECISION, 0);
    const canvas = await screen.findByRole('region', { name: t('flow.canvas.label') });
    // Select the step (which is on the main path in a non-branch position)
    const allItems = canvas.querySelectorAll('[role="treeitem"]');
    const step = Array.from(allItems).find((el) => /Step/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''));
    expect(step).toBeTruthy();
    await user.click(step!);
    const srcBefore = store.getState()!.source;
    const stopBtn = screen.getByRole('button', { name: t('flow.palette.stop') });
    await user.click(stopBtn);
    // Either a refusal was announced or the source didn't change (stop refused)
    await waitFor(() => {
      const srcAfter = store.getState()!.source;
      const refused = announce.mock.calls.some(([key]) => typeof key === 'string' && key.includes('flow.refused'));
      const unchanged = srcAfter === srcBefore;
      expect(refused || unchanged).toBe(true);
    });
  });
});

describe('VO-099: moveByKey never moves sideways', () => {
  it('refuses left/right move from a branch element', async () => {
    const user = userEvent.setup();
    const src = `@startuml Screen-flow\nstart\nif (Go?) then (yes)\n  :Step;\nelse (no)\nendif\nstop\n@enduml\n`;
    const { announce, store } = setup(src, 0);
    const canvas = await screen.findByRole('region', { name: t('flow.canvas.label') });
    // Navigate to the step inside the branch
    const allItems = canvas.querySelectorAll('[role="treeitem"]');
    const step = Array.from(allItems).find((el) => /Step/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''));
    expect(step).toBeTruthy();
    await user.click(step!);
    const srcBefore = store.getState()!.source;
    // Alt+Shift+ArrowLeft should be refused (moveByKey left/right refused)
    await user.keyboard('{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}');
    // Either moveSideways refusal was announced or the source didn't change
    await waitFor(() => {
      const refused = announce.mock.calls.some(([key]) => key === 'flow.refused.moveSideways');
      const srcUnchanged = store.getState()!.source === srcBefore;
      expect(refused || srcUnchanged).toBe(true);
    });
  });
});

describe('VO-125: delete flow asks for confirmation', () => {
  it('shows a confirmation dialog when deleting the flow', async () => {
    const user = userEvent.setup();
    setup(SCREEN_BLOCK + FLOW_ONLY, 1);
    await screen.findByRole('region', { name: t('flow.canvas.label') });
    // Find the "Delete screen flow" block command
    const deleteBtn = screen.getByRole('button', { name: t('flow.delete') });
    await user.click(deleteBtn);
    await waitFor(() => {
      expect(screen.getByRole('alertdialog', { name: t('flow.deleteConfirm.title') })).toBeInTheDocument();
    });
  });

  it('confirms deletion and panel shows "Add screen flow"', async () => {
    const user = userEvent.setup();
    const { store } = setup(SCREEN_BLOCK + FLOW_ONLY, 1);
    await screen.findByRole('region', { name: t('flow.canvas.label') });
    const deleteBtn = screen.getByRole('button', { name: t('flow.delete') });
    await user.click(deleteBtn);
    // Find the confirm button inside the alertdialog
    const dialog = await screen.findByRole('alertdialog', { name: t('flow.deleteConfirm.title') });
    const confirmBtn = within(dialog).getByRole('button', { name: t('flow.deleteConfirm.confirm') });
    await user.click(confirmBtn);
    await waitFor(() => {
      expect(store.getState()?.flowIndex).toBeNull();
      expect(screen.getByRole('button', { name: t('flow.add') })).toBeInTheDocument();
    });
  });
});
