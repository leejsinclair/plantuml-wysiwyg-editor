// The project library view (T048; FR-006/AC8, AC10, FR-001/AC1, contracts/ui.md §2).
import type { MessagePart } from '../en.ts';

const library = {
  'library.heading': 'Projects',
  'library.create': 'Create project',
  'library.listLabel': 'Your projects',
  'library.loading': 'Loading projects…',
  'library.empty': 'There are no projects yet. Create a project to start.',
  'library.loadFailed': 'Your projects could not be read from browser storage. Reload the page to try again.',
  'library.createFailed': 'The project could not be created because browser storage refused to save it. Try again.',
  'library.lastModified': 'Last modified {time}',
  'library.lastDownloaded': 'Last downloaded {time}',
  'library.notDownloaded': 'Changes not downloaded',
  'library.rowCommands': 'Commands for {name}',
  'library.notSynchronised':
    'Projects are kept in this browser only. They are not synchronised between browsers or devices, so download a project to keep a copy or move it.',
} as const satisfies MessagePart;

export default library;
