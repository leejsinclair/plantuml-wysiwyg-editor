// T124: managing screens in the project panel (FR-011, FR-015/AC4; VO-026, VO-027, VO-029, VO-030, VO-115, VO-130).
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import '../../../src/ui/project-panel/register.tsx';
import { createStore, StoreContext, type Store } from '../../../src/ui/app/store.ts';
import type { ProjectRecord } from '../../../src/services/storage/db.ts';
import { importSource } from '../../../src/core/project/project.ts';
import { t } from '../../../src/ui/messages/en.ts';
import { ProjectPanel } from '../../../src/ui/project-panel/ProjectPanel.tsx';
import { PropertiesPanel } from '../../../src/ui/properties/PropertiesPanel.tsx';
import { Notices, notices } from '../../../src/ui/notices/Notices.tsx';

const salt = (name: string, body = '  [OK]') => `@startsalt ${name}\n{\n${body}\n}\n@endsalt\n`;
const FLOW = '@startuml Screen-flow\nstart\n:[[#Login Sign in]];\n:[[#Login Again]];\n:[[#Login Third]];\nstop\n@enduml\n';
const OTHER = '@startuml\nAlice -> Bob : hi\n@enduml\n';
const SOURCE = salt('Login') + '\n' + salt('Home') + '\n' + FLOW + '\n' + OTHER + '\n' + '@startmindmap\n* root\n@endmindmap\n';

const record = (source: string): ProjectRecord => {
  const s = importSource(source);
  return {
    id: 'p1', name: 'Project', source: s.source, flowIndex: s.flowIndex, lastWorking: [],
    createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z', revision: 1,
    downloadedAt: null, downloadedRevision: null,
  };
};

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
  for (const n of notices.list()) notices.dismiss(n.id);
});

function setup(source = SOURCE) {
  const announced: string[] = [];
  const store: Store = createStore({ write: async () => {}, announce: (key, params) => announced.push(t(key, params)) });
  store.load(record(source));
  cleanups.push(() => store.dispose());
  render(
    <StoreContext.Provider value={store}>
      <ProjectPanel />
      <PropertiesPanel />
      <Notices />
    </StoreContext.Provider>,
  );
  return { store, announced, source: () => store.getState()!.source };
}

const panel = () => screen.getByRole('group', { name: t('projectPanel.label') });
const screenNames = () =>
  within(within(panel()).getByRole('group', { name: t('projectPanel.screens') }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.project-panel__open')!.textContent);
const openName = () => within(panel()).getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'true')!.textContent;
const command = (labelKey: string, name: string) => within(panel()).getByRole('button', { name: t(labelKey, { name }) });

describe('Add screen (VO-026)', () => {
  it('creates an empty Screen-n with the lowest unused n after the last screen and opens it', async () => {
    const { store } = setup(salt('Screen-1') + salt('Screen-3'));
    await userEvent.click(within(panel()).getByRole('button', { name: t('screens.add') }));
    expect(screenNames()).toEqual(['Screen-1', 'Screen-3', 'Screen-2']);
    expect(openName()).toBe('Screen-2');
    expect(store.getSnapshot().undoName?.nameKey).toBe('screens.history.add');
    act(() => store.undo());
    expect(screenNames()).toEqual(['Screen-1', 'Screen-3']);
  });
});

describe('Rename (VO-027, VO-028)', () => {
  it('previews "Will be saved as Sign-in" while typing, keeps the typed text, and converts on commit', async () => {
    const { source } = setup();
    await userEvent.click(command('screens.renameBlock', 'Home'));
    const field = within(panel()).getByRole('textbox', { name: t('screens.nameLabel') });
    await userEvent.clear(field);
    await userEvent.type(field, 'Sign in');
    expect(field).toHaveValue('Sign in');
    expect(within(panel()).getByText('Will be saved as Sign-in')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(screenNames()).toEqual(['Login', 'Sign-in']);
    expect(source()).toContain('@startsalt Sign-in\n');
  });

  it('refuses a name used by another block ignoring case, naming it, and keeps the previous name', async () => {
    const { source } = setup();
    const before = source();
    await userEvent.click(command('screens.renameBlock', 'Home'));
    const field = within(panel()).getByRole('textbox', { name: t('screens.nameLabel') });
    await userEvent.clear(field);
    await userEvent.type(field, 'LOGIN{Enter}');
    expect(within(panel()).getByText(t('screens.rename.duplicate', { name: 'Login' }))).toBeInTheDocument();
    expect(source()).toBe(before);
    expect(screenNames()).toEqual(['Login', 'Home']);
  });

  it('cancels with Escape, changing nothing', async () => {
    const { source } = setup();
    const before = source();
    await userEvent.click(command('screens.renameBlock', 'Home'));
    await userEvent.type(within(panel()).getByRole('textbox', { name: t('screens.nameLabel') }), 'x{Escape}');
    expect(within(panel()).queryByRole('textbox')).toBeNull();
    expect(source()).toBe(before);
  });
});

describe('Renaming a linked screen (VO-029, VO-115)', () => {
  it('warns with the three linked steps, and proceeding updates them in one undoable step', async () => {
    const { store, source } = setup();
    await userEvent.click(command('screens.renameBlock', 'Login'));
    const field = within(panel()).getByRole('textbox', { name: t('screens.nameLabel') });
    await userEvent.clear(field);
    await userEvent.type(field, 'Sign in{Enter}');
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Sign in', 'Again', 'Third']);
    await userEvent.click(within(dialog).getByRole('button', { name: t('screens.warning.proceed') }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(source().match(/\[\[#Sign-in /g)).toHaveLength(3);
    expect(screenNames()).toEqual(['Sign-in', 'Home']);
    act(() => store.undo());
    expect(source()).toBe(SOURCE);
  });

  it('changes nothing when the warning is cancelled', async () => {
    const { source } = setup();
    await userEvent.click(command('screens.renameBlock', 'Login'));
    const field = within(panel()).getByRole('textbox', { name: t('screens.nameLabel') });
    await userEvent.clear(field);
    await userEvent.type(field, 'Sign in{Enter}');
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: t('screens.warning.cancel') }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(source()).toBe(SOURCE);
  });
});

describe('Delete (VO-030, VO-115)', () => {
  it('deletes an unlinked screen without confirmation, offers Undo, and opens the neighbour', async () => {
    const { store, source } = setup();
    act(() => store.openBlock(store.getSnapshot().blocks[1]!.key));
    await userEvent.click(command('screens.deleteBlock', 'Home'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screenNames()).toEqual(['Login']);
    expect(openName()).toBe('Login');
    const notice = screen.getByText(t('screens.deleted', { name: 'Home' })).closest('li')!;
    await userEvent.click(within(notice).getByRole('button', { name: t('notice.undo') }));
    expect(source()).toBe(SOURCE);
    expect(screenNames()).toEqual(['Login', 'Home']);
  });

  it('warns before deleting a linked screen, listing the steps; cancel changes nothing, proceed deletes undoably', async () => {
    const { store, source } = setup();
    await userEvent.click(command('screens.deleteBlock', 'Login'));
    let dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(within(dialog).getByRole('button', { name: t('screens.warning.cancel') }));
    expect(source()).toBe(SOURCE);

    await userEvent.click(command('screens.deleteBlock', 'Login'));
    dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: t('screens.warning.proceed') }));
    expect(screenNames()).toEqual(['Home']);
    expect(source()).toContain('[[#Login Sign in]]');
    expect(screen.getByText(t('screens.deletedBrokenLinks', { name: 'Login', count: 3 }))).toBeInTheDocument();
    act(() => store.undo());
    expect(source()).toBe(SOURCE);
  });

  it('refuses to delete the only block with an explanation', async () => {
    const { announced, source } = setup(salt('Only'));
    await userEvent.click(command('screens.deleteBlock', 'Only'));
    expect(source()).toBe(salt('Only'));
    expect(announced).toContain(t('screens.delete.last'));
  });
});

describe('Duplicate and reorder', () => {
  it('duplicates after the original and opens the copy, and moves screens up and down', async () => {
    const { store } = setup();
    await userEvent.click(command('screens.duplicateBlock', 'Login'));
    expect(screenNames()).toEqual(['Login', 'Copy-of-Login', 'Home']);
    expect(openName()).toBe('Copy-of-Login');
    await userEvent.click(command('screens.moveUpBlock', 'Copy-of-Login'));
    expect(screenNames()).toEqual(['Copy-of-Login', 'Login', 'Home']);
    expect(openName()).toBe('Copy-of-Login');
    expect(command('screens.moveUpBlock', 'Copy-of-Login')).toBeDisabled();
    expect(command('screens.moveDownBlock', 'Home')).toBeDisabled();
    act(() => store.undo());
    expect(screenNames()).toEqual(['Login', 'Copy-of-Login', 'Home']);
  });
});

describe('Other content (VO-130)', () => {
  it('reorders and deletes as a unit, undoably, with no rename or duplicate', async () => {
    const { store, source } = setup();
    const otherLabel = t('projectPanel.otherUnnamed', { opener: 'startuml', n: 4 });
    expect(within(panel()).queryByRole('button', { name: t('screens.renameBlock', { name: otherLabel }) })).toBeNull();
    expect(within(panel()).queryByRole('button', { name: t('screens.duplicateBlock', { name: otherLabel }) })).toBeNull();
    await userEvent.click(command('screens.moveDownBlock', otherLabel));
    expect(source()).toBe(salt('Login') + '\n' + salt('Home') + '\n' + FLOW + '\n' + '@startmindmap\n* root\n@endmindmap\n' + '\n' + OTHER);
    act(() => store.undo());
    expect(source()).toBe(SOURCE);
    await userEvent.click(command('screens.deleteBlock', otherLabel));
    expect(source()).not.toContain('Alice -> Bob');
    act(() => store.undo());
    expect(source()).toBe(SOURCE);
  });
});

describe('The open screen\'s own name property (FR-016/AC2)', () => {
  it('renames the open screen from the properties panel with nothing selected', async () => {
    const { source } = setup();
    const properties = screen.getByRole('textbox', { name: t('screens.nameLabel') });
    expect(properties).toHaveValue('Login');
    await userEvent.clear(properties);
    await userEvent.type(properties, 'Sign in{Enter}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('screens.warning.proceed') }));
    expect(source()).toContain('@startsalt Sign-in\n');
    expect(screen.getByRole('textbox', { name: t('screens.nameLabel') })).toHaveValue('Sign-in');
  });
});
