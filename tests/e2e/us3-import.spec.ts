// T108: User Story 3 Independent Test. Import every corpus file; each block's status in the project panel matches
// its sidecar, and downloading without edits gives back the imported bytes exactly (CRLF, byte-order mark,
// missing final newline, comments and text between blocks included). FR-010/AC1, AC6, FR-020, SC-004.
import { test, expect, type BlockStatusText } from './fixtures.ts';
import { corpusFiles, type Expected } from '../unit/corpus/corpus.ts';

const KIND_ORDER: Readonly<Record<string, number>> = { screen: 0, flow: 1, other: 2 };

/** The sidecar's blocks in project-panel order: screens, then the flow, then other content, each in file order. */
function panelOrder(expected: Expected): Expected['blocks'][number][] {
  return expected.blocks
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (KIND_ORDER[x.b.kind] ?? 3) - (KIND_ORDER[y.b.kind] ?? 3) || x.i - y.i)
    .map(({ b }) => b);
}

/**
 * The renderer may add "Cannot be rendered" to a block the editor does not analyse (source-only screens and flows,
 * other content) once it fails on it (FR-010/AC9); the sidecars hold the renderer-independent status.
 */
function statusMatches(actual: BlockStatusText | null, expected: string): boolean {
  return actual === expected || (expected === 'Source only' && actual === 'Cannot be rendered');
}

for (const file of corpusFiles().filter((f) => f.expected !== null && f.name.endsWith('.puml'))) {
  test(`imports ${file.name} with every block classified and downloads it unchanged`, async ({ app, page }) => {
    await app.open();
    await app.importFile({ name: file.name.replace(/^.*\//, ''), bytes: Buffer.from(file.bytes) });

    const expected = panelOrder(file.expected!);
    const panel = await app.readProjectPanel();
    expect(panel.map((b) => b.name).length, panel.map((b) => b.text).join('\n---\n')).toBe(expected.length);
    let untitled = 0;
    for (const [i, want] of expected.entries()) {
      const got = panel[i]!;
      expect(statusMatches(got.status, want.status), `${file.name} entry ${i} (${got.name}): ${got.status} ≠ ${want.status}`).toBe(true);
      if (want.name !== null) expect(got.name).toBe(want.name);
      else if (want.kind === 'screen') expect(got.name).toBe(`Untitled screen ${++untitled}`);
    }

    // An older-format file offers exactly one "Convert all", and nothing is converted on import.
    const hasOlder = file.expected!.blocks.some((b) => b.status === 'Older format');
    await expect(page.getByRole('button', { name: 'Convert all', exact: true })).toHaveCount(hasOlder ? 1 : 0);

    // The empty file is the one corpus file whose project differs from its bytes: it gains one new screen.
    if (file.bytes.length === 0) return;
    const downloaded = await app.download();
    expect(Buffer.compare(downloaded.bytes, Buffer.from(file.bytes)), `${file.name} downloads byte-identically`).toBe(0);
  });
}
