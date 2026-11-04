// Nested containers are drawn inside their cell, so the whole layout is visible and each inner cell can be
// selected (FR-016/AC5; the login form is a Form inside the screen). A brand-new project shows the empty prompt.
import { render, screen, within } from '../render';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createSlots } from '../../../src/ui/app/slots.ts';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import { createProject, importSource } from '../../../src/core/project/project.ts';
import { t } from '../../../src/ui/messages/en.ts';
import { Workspace } from '../../../src/ui/workspace/Workspace.tsx';
import { registerScreenEditor } from '../../../src/ui/canvas/register.tsx';

let stores: Store[] = [];
afterEach(() => { stores.forEach((s) => s.dispose()); stores = []; });

function open(source: string) {
  const slots = createSlots();
  registerScreenEditor(slots);
  const store = createStore({ write: async () => {}, announce: () => {}, slots });
  stores.push(store);
  const state = importSource(source);
  store.load({
    id: 'p1', name: 'P', source: state.source, flowIndex: state.flowIndex, lastWorking: [],
    createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
    downloadedAt: null, downloadedRevision: null,
  });
  store.openBlock(store.getSnapshot().blocks[0]!.key);
  const settings = { get: async () => ({ panels: {} }), put: async () => {} };
  render(
    <StoreContext.Provider value={store}>
      <Workspace slots={slots} platform="windows" settings={settings} />
    </StoreContext.Provider>,
  );
  return store;
}

describe('nested containers on the canvas', () => {
  it('draws the cells of a nested grid inside their cell and selects an inner cell', async () => {
    const user = userEvent.setup();
    const store = open('@startsalt S\n{\n  {\n    Username | "      "\n    Password | "      "\n  }\n}\n@endsalt\n');
    const canvas = screen.getByRole('region', { name: t('region.canvas') });
    // The Form's own cell plus its four cells.
    expect(within(canvas).getAllByRole('gridcell')).toHaveLength(5);
    await user.click(within(canvas).getByRole('gridcell', { name: /Username/ }));
    expect(store.getSnapshot().selection?.path).toEqual([0, 0, 0, 0]);
  });

  it('shows the empty-screen prompt for a new project', () => {
    open(createProject().source);
    expect(screen.getByText(t('screen.canvas.emptyPrompt'))).toBeInTheDocument();
  });
});
