// Storage, library, tabs, download and import strings (T090; FR-006, FR-014/AC6, FR-016/AC1, contracts/ui.md §2
// and §11). `storage.failed` and `storage.failed.quota` are the autosave error keys (services/storage/autosave.ts).
// The toolbar's own "Import .puml file" and "Download" labels are shared (shared.ts).
import type { MessagePart } from '../en.ts';

const storage = {
  // Storage failure (FR-006/AC7): prominent, non-blocking, while the editor retries.
  'storage.failed':
    'Your latest changes could not be saved in this browser. Keep this tab open: the editor keeps trying to save them. Download a backup now so no work is lost.',
  'storage.failed.quota':
    'Browser storage is full, so your latest changes could not be saved. Keep this tab open: the editor keeps trying to save them. Download a backup now, then free space by deleting projects you no longer need.',
  'storage.downloadBackup': 'Download a backup',
  'storage.recovered': 'Your changes are saved again.',

  // Protecting against storage loss (FR-006/AC9, AC11).
  'storage.persistRefused':
    'This browser has not agreed to keep your projects permanently, so it may delete them if it runs short of space. Download your projects regularly to keep a copy.',
  'storage.privateWindow':
    'This looks like a private window. Your projects will be deleted when it closes, so download your work before closing it.',
  'storage.reminder': '"{name}" has changes that have not been downloaded. Download it to keep a copy outside this browser.',
  'storage.reminderDownload': 'Download now',

  // Library commands (FR-006/AC3, contracts/ui.md §2).
  'storage.library.import': 'Import .puml file',
  'storage.library.open': 'Open',
  'storage.library.rename': 'Rename',
  'storage.library.duplicate': 'Duplicate',
  'storage.library.delete': 'Delete',
  'storage.library.download': 'Download',
  'storage.library.renameLabel': 'New name for {name}',
  'storage.library.renameSave': 'Save name',
  'storage.library.renameCancel': 'Cancel',
  'storage.library.renameEmpty': 'A project name cannot be empty, so "{name}" keeps its name.',
  'storage.library.renamed': 'Renamed to "{name}".',
  'storage.library.duplicated': 'Created "{name}".',
  'storage.library.deleted': 'Deleted "{name}".',
  'storage.library.failed': 'The change could not be saved because browser storage refused it. Try again.',
  'storage.library.missing': 'That project no longer exists. It may have been deleted in another tab.',

  // Delete confirmation (FR-006/AC3).
  'storage.delete.title': 'Delete "{name}"?',
  'storage.delete.notDownloaded':
    'This project has changes that have not been downloaded. Deleting it loses them unless you download it first.',
  'storage.delete.upToDate': 'Every change in this project is in a file you downloaded.',
  'storage.delete.cannotUndo': 'Deleting a project cannot be undone.',
  'storage.delete.downloadAndDelete': 'Download and delete',
  'storage.delete.confirm': 'Delete',
  'storage.delete.cancel': 'Cancel',

  // Tabs (FR-006/AC12, AC16, FR-007/AC7).
  'storage.tab.readOnly':
    'This project is being edited in another tab, so this tab is read-only. It shows the version stored when you opened it and does not update.',
  'storage.tab.editHerePrompt':
    'Choose "Edit here instead" to save the other tab\'s changes and continue editing here. Undo history is not carried over: both tabs start with no undo history.',
  'storage.tab.editHere': 'Edit here instead',
  'storage.tab.handingOver': 'Moving editing to this tab. Waiting for the other tab to save its changes…',
  'storage.tab.editingHere': 'You are now editing this project in this tab.',
  'storage.tab.deleted': 'This project was deleted in another tab. Download its content to keep a copy.',
  'storage.tab.downloadContent': 'Download its content',
  'storage.tab.banner': 'Editing in other tabs',

  // Download (FR-006/AC4, FR-014/AC6, EC-12).
  'storage.download.unrenderable': {
    one: 'Downloaded with every block unchanged. Standard PlantUML will report an error for 1 block: {blocks}. Blocks not yet checked by the renderer: {unchecked}.',
    other:
      'Downloaded with every block unchanged. Standard PlantUML will report errors for {count} blocks: {blocks}. Blocks not yet checked by the renderer: {unchecked}.',
  },
  'storage.download.notChecked':
    'Downloaded with every block unchanged. Blocks not yet checked by the renderer: {unchecked}. Standard PlantUML may report errors for them.',
  'storage.download.flowWillBeOther':
    'The screen flow "{name}" is invalid or can only be edited in the source view. If this file is imported again, it will be kept as other content instead of the screen flow.',

  // Import (FR-006/AC13, EC-01).
  'storage.import.notUtf8': '"{file}" was not imported because it is not UTF-8 text. Save it as UTF-8 and try again. Nothing was created.',
  'storage.import.binary': '"{file}" was not imported because it is not a text file. Choose a .puml file. Nothing was created.',
  'storage.import.failed': '"{file}" could not be imported because browser storage refused to save it. Nothing was created.',
  'storage.import.onlyOtherContent':
    'This file has no screens and no screen flow, so everything in it is kept as other content and can be edited in the source view.',
} as const satisfies MessagePart;

export default storage;
