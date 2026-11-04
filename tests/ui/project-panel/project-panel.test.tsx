// T051: the project panel (FR-015/AC1–AC3, FR-011/AC11, FR-017; VO-128, VO-067 render status shown).
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import { slots } from '../../../src/ui/app/slots.ts';
import { RenderQueue, type EngineFactory } from '../../../src/services/render/render-queue.ts';
import type { ToWorker } from '../../../src/services/render/render.worker.ts';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';
import { importSource } from '../../../src/core/project/project.ts';
import { t } from '../../../src/ui/messages/en.ts';
import { ProjectPanel } from '../../../src/ui/project-panel/ProjectPanel.tsx';

const salt = (name: string, body = '  [OK]') => `@startsalt ${name}\n{\n${body}\n}\n@endsalt\n`;
const activity = (name: string, body: string) => `@startuml ${name}\n${body}\n@enduml\n`;

// File order: Login, other content, the flow, an unnamed screen, a duplicate name, a broken screen.
const SOURCE = [
  salt('Login'),
  '@startuml\nAlice -> Bob : hi\n@enduml\n',
  activity('Screen-flow', 'start\n:[[#Login Sign in]];\n:[[#Login Again]];\n:[[#Home Go home]];\nstop'),
  '@startsalt\n{\n  [Unnamed]\n}\n@endsalt\n',
  salt('Home'),
  salt('Home', '  [Second]'),
  salt('Broken', '  [OK]\n  {'),
].join('');

const record = (source: string): ProjectRecord => {
  const state = importSource(source);
  return {
    id: 'p1', name: 'Project', source: state.source, flowIndex: state.flowIndex, lastWorking: [],
    createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
    downloadedAt: null, downloadedRevision: null,
  };
};

/** A renderer that holds every request until the test releases it, so render statuses can be seen changing. */
function heldEngine() {
  const held: { id: number; reply: () => void }[] = [];
  const factory: EngineFactory = (onMessage) => {
    queueMicrotask(() => onMessage({ type: 'ready' }));
    return {
      post(message: ToWorker) {
        if (message.type !== 'render') return;
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text x="1" y="10">ok</text></svg>';
        held.push({ id: message.id, reply: () => onMessage({ type: 'svg', id: message.id, svg }) });
      },
      terminate() {},
    };
  };
  return { factory, held };
}

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
});

function setup(source = SOURCE, queue?: RenderQueue) {
  const store: Store = createStore({ write: async () => {}, announce: () => {}, ...(queue ? { renderQueue: queue } : {}) });
  store.load(record(source));
  cleanups.push(() => store.dispose());
  render(
    <StoreContext.Provider value={store}>
      <ProjectPanel />
    </StoreContext.Provider>,
  );
  return store;
}

const section = (key: string) => screen.getByRole('group', { name: t(key) });
const items = (key: string) => within(section(key)).getAllByRole('listitem');
const itemFor = (name: RegExp | string) => screen.getAllByRole('listitem').find((li) => within(li).queryByRole('button', { name }))!;

describe('ProjectPanel: lists every block (VO-128)', () => {
  it('lists the screens in file order, then the flow, then other content, each with its status', () => {
    setup();
    const screens = items('projectPanel.screens');
    expect(screens.map((li) => within(li).getByRole('button').textContent)).toEqual([
      'Login', t('names.untitledScreen', { n: 1 }), 'Home', 'Home', 'Broken',
    ]);
    expect(within(screens[0]!).getByText(t('projectPanel.status', { status: 'Editable' }))).toBeInTheDocument();
    expect(within(screens[4]!).getByText(t('projectPanel.status', { status: 'Error' }))).toBeInTheDocument();

    const flow = items('projectPanel.flow');
    expect(flow).toHaveLength(1);
    expect(within(flow[0]!).getByRole('button')).toHaveTextContent('Screen-flow');

    const other = items('projectPanel.other');
    expect(other).toHaveLength(1);
    expect(within(other[0]!).getByRole('button')).toHaveTextContent('@startuml (block 2)');
    expect(within(other[0]!).getByText(t('projectPanel.status', { status: 'Source only' }))).toBeInTheDocument();
    expect(within(other[0]!).getByText(t('reason.otherContent'))).toBeInTheDocument();
  });

  it('shows how many flow steps link to each screen (FR-015/AC2)', () => {
    setup();
    const [login, unnamed, home] = items('projectPanel.screens');
    expect(within(login!).getByText(t('projectPanel.incomingLinks', { count: 2 }))).toBeInTheDocument();
    expect(within(unnamed!).getByText(t('projectPanel.noIncomingLinks'))).toBeInTheDocument();
    expect(within(home!).getByText(t('projectPanel.incomingLinks', { count: 1 }))).toBeInTheDocument();
  });

  it('flags names that are duplicated (FR-011/AC11)', () => {
    setup();
    const [, , home1, home2] = items('projectPanel.screens');
    for (const li of [home1!, home2!]) expect(within(li).getByText(t('projectPanel.nameFlag.duplicate'))).toBeInTheDocument();
    expect(within(items('projectPanel.screens')[0]!).queryByText(t('projectPanel.nameFlag.duplicate'))).toBeNull();
  });

  it('shows the line and problem for a block with a source problem', () => {
    setup();
    const broken = items('projectPanel.screens')[4]!;
    expect(within(broken).getByText(/^Line \d+: /)).toBeInTheDocument();
  });

  it('has no flow section when the project has no screen flow, leaving room for the "Add screen flow" entry', () => {
    setup(salt('Only'));
    expect(screen.queryByRole('group', { name: t('projectPanel.flow') })).toBeNull();
    expect(items('projectPanel.screens')).toHaveLength(1);
  });
});

describe('ProjectPanel: selecting a block opens it (FR-015/AC3)', () => {
  it('opens the chosen block and marks it as the current one', async () => {
    const store = setup();
    const first = store.getSnapshot().blocks[0]!;
    expect(within(itemFor('Login')).getByRole('button')).toHaveAttribute('aria-current', 'true');

    await userEvent.click(screen.getByRole('button', { name: /Screen-flow/ }));
    const flow = store.getSnapshot().blocks.find((b) => b.kind === 'flow')!;
    expect(store.getSnapshot().openBlockKey).toBe(flow.key);
    expect(screen.getByRole('button', { name: /Screen-flow/ })).toHaveAttribute('aria-current', 'true');
    expect(within(itemFor('Login')).getByRole('button')).not.toHaveAttribute('aria-current');
    expect(first.key).not.toBe(flow.key);

    await userEvent.click(screen.getByRole('button', { name: /@startuml \(block 2\)/ }));
    expect(store.getSnapshot().openBlockKey).toBe(store.getSnapshot().blocks[1]!.key);
  });
});

describe('ProjectPanel: render status (VO-067)', () => {
  it('shows "Not yet checked" until a block renders, then its render status, while the panel stays usable', async () => {
    const { factory, held } = heldEngine();
    const queue = new RenderQueue({ createEngine: factory, sanitize: (s) => s });
    cleanups.push(() => queue.dispose());
    setup(salt('A') + salt('B'), queue);

    const [a, b] = items('projectPanel.screens');
    expect(within(a!).getByText(t('renderStatus.notYetChecked'))).toBeInTheDocument();
    expect(within(b!).getByText(t('renderStatus.notYetChecked'))).toBeInTheDocument();

    // The open block (A) renders first, one request at a time.
    expect(held).toHaveLength(1);
    await act(async () => held[0]!.reply());
    expect(within(items('projectPanel.screens')[0]!).getByText(t('projectPanel.render.rendered'))).toBeInTheDocument();
    expect(within(items('projectPanel.screens')[1]!).getByText(t('renderStatus.notYetChecked'))).toBeInTheDocument();

    // Opening B while it waits does not wait for the renderer.
    await userEvent.click(screen.getByRole('button', { name: /^B/ }));
    expect(within(itemFor(/^B/)).getByRole('button')).toHaveAttribute('aria-current', 'true');
  });
});

describe('ProjectPanel: projectPanel slot', () => {
  it('shows header entries once and block entries beside each block', () => {
    cleanups.push(
      slots.projectPanel.register({ id: 'test.header', placement: 'header', Component: () => <button type="button">Add thing</button> }),
      slots.projectPanel.register({
        id: 'test.block',
        placement: 'block',
        Component: ({ blockKey, ctx }) => <span>{`entry for ${blockKey} in ${ctx.projectId}`}</span>,
      }),
    );
    const store = setup(salt('A') + salt('B'));
    expect(screen.getAllByRole('button', { name: 'Add thing' })).toHaveLength(1);
    const [a, b] = store.getSnapshot().blocks;
    expect(within(items('projectPanel.screens')[0]!).getByText(`entry for ${a!.key} in p1`)).toBeInTheDocument();
    expect(within(items('projectPanel.screens')[1]!).getByText(`entry for ${b!.key} in p1`)).toBeInTheDocument();
  });
});
