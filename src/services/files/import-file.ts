// Importing a `.puml` file from the user's computer as a new project (FR-006/AC5, AC6, AC13, AC14, AC17, R-9).
//
// - The file picker resolves `null` when cancelled, and the caller then does nothing.
// - The file is read as bytes and handed to the core `importFile`: a non-UTF-8 or binary file is refused and
//   nothing is stored.
// - The new record is named after the file, with the import date appended if a project of that name exists, and
//   starts never downloaded. The caller opens it on the block `openIndex` names.

import { importFile } from '../../core/project/import.ts';
import type { ProjectRecord } from '../storage/db.ts';
import { importedProjectRecord } from '../storage/library-ops.ts';

/** Opens the browser's file picker for one file. Resolves `null` when the picker is cancelled. */
export function pickFile(doc: Document = document): Promise<File | null> {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.puml,.plantuml,.txt,text/plain';
    input.style.display = 'none';
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    doc.body.append(input);
    input.click();
  });
}

export interface ImportDeps {
  /** Names of the projects already in the library. */
  listNames(): Promise<readonly string[]>;
  put(record: ProjectRecord): Promise<void>;
  newId(): string;
  /** ISO 8601 timestamp. */
  now(): string;
  /** The import date as appended on a name clash, e.g. "2026-10-28". */
  today(): string;
}

export type ImportOutcome =
  | { readonly ok: true; readonly record: ProjectRecord; readonly openIndex: number; readonly noticeKey: string | null }
  | { readonly ok: false; readonly reason: 'not-utf8' | 'binary' | 'storage' };

/** The local date as YYYY-MM-DD. */
export function localDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Imports a file's bytes as a new stored project. */
export async function importProjectFile(file: Pick<File, 'name' | 'arrayBuffer'>, deps: ImportDeps): Promise<ImportOutcome> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let takenNames: readonly string[];
  try {
    takenNames = await deps.listNames();
  } catch {
    takenNames = [];
  }
  const result = importFile(bytes, file.name, { takenNames, today: deps.today() });
  if (!result.ok) return result;
  const record = importedProjectRecord(deps.newId(), result.name, result.state, deps.now());
  try {
    await deps.put(record);
  } catch {
    return { ok: false, reason: 'storage' };
  }
  return { ok: true, record, openIndex: result.openIndex, noticeKey: result.noticeKey };
}
