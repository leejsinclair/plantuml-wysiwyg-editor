import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { catalogue, format, has, mergeParts, t } from '../../../src/ui/messages/en.ts';
import shared from '../../../src/ui/messages/en/shared.ts';

const ROOT = join(import.meta.dirname, '../../..');
const UI_DIR = join(ROOT, 'src/ui');
const MESSAGES_DIR = join(UI_DIR, 'messages');

describe('t(key, params)', () => {
  it('returns the exact English string for a key', () => {
    expect(t('autosave.saved')).toBe('All changes saved');
    expect(t('autosave.saving')).toBe('Saving…');
  });

  it('substitutes parameters, passing diagram content in any language through unchanged', () => {
    expect(t('toolbar.undoAction', { action: 'Insert button' })).toBe('Undo Insert button');
    expect(t('toolbar.undoAction', { action: 'Zahlung prüfen — 支払い {x}' })).toBe('Undo Zahlung prüfen — 支払い {x}');
    expect(t('names.untitledScreen', { n: 3 })).toBe('Untitled screen 3');
  });

  it('chooses the plural form with Intl.PluralRules', () => {
    expect(t('diagnostic.syntax.unclosedContainers', { count: 1 })).toBe('1 container is not closed.');
    expect(t('diagnostic.syntax.unclosedContainers', { count: 2 })).toBe('2 containers are not closed.');
    expect(t('diagnostic.syntax.unclosedContainers', { count: 0 })).toBe('0 containers are not closed.');
  });

  it('fails loudly on an unknown key during development and testing', () => {
    expect(has('no.such.key')).toBe(false);
    expect(() => t('no.such.key')).toThrow(/no\.such\.key/);
  });
});

describe('format', () => {
  it('leaves a placeholder with no parameter as written', () => {
    expect(format('Hello {name}', {})).toBe('Hello {name}');
  });

  it('does not re-substitute inside substituted values', () => {
    expect(format('{a} {b}', { a: '{b}', b: 'x' })).toBe('{b} x');
  });

  it('requires a numeric count for plural messages', () => {
    expect(() => format({ one: 'one', other: 'many' }, {})).toThrow(/count/);
  });
});

describe('mergeParts: an eager merge of ./en/*.ts that fails on duplicate keys', () => {
  it('merges parts into one catalogue', () => {
    expect(mergeParts({ './en/a.ts': { 'a.x': 'X' }, './en/b.ts': { 'b.y': 'Y' } })).toEqual({ 'a.x': 'X', 'b.y': 'Y' });
  });

  it('names the key and both files when two parts define the same key', () => {
    expect(() => mergeParts({ './en/a.ts': { 'same.key': 'A' }, './en/b.ts': { 'same.key': 'B' } })).toThrow(
      /same\.key.*\.\/en\/a\.ts.*\.\/en\/b\.ts/,
    );
  });

  it('includes every part file in the folder', () => {
    const files = readdirSync(join(MESSAGES_DIR, 'en')).filter((f) => f.endsWith('.ts'));
    expect(files).toContain('shared.ts');
    for (const key of Object.keys(shared)) expect(has(key), key).toBe(true);
  });
});

describe('shared part: strings from contracts/ui.md', () => {
  const values = new Set(Object.values(catalogue).flatMap((m) => (typeof m === 'string' ? [m] : Object.values(m))));

  it.each([
    // §3 regions
    'Project panel', 'Palette', 'Canvas', 'Outline', 'Properties', 'Source', 'Preview',
    // §3 toolbar
    'Import .puml file', 'Download', 'Undo', 'Redo',
    // §4 statuses
    'All changes saved', 'Saving…',
    'Editable', 'Has locked parts', 'Source only', 'Error', 'Older format', 'Cannot be rendered',
    'Not yet checked', 'never downloaded',
  ])('contains "%s"', (value) => {
    expect(values.has(value)).toBe(true);
  });

  it('has a block status string for every core BlockStatus value', async () => {
    const { BLOCK_STATUSES, RENDER_STATUSES } = await import('../../../src/core/types.ts');
    for (const status of BLOCK_STATUSES) expect(values.has(status), status).toBe(true);
    expect(values.has(RENDER_STATUSES[0]!)).toBe(true);
  });

  it('uses only non-empty values with the plural forms "one" and "other"', () => {
    for (const [key, message] of Object.entries(catalogue)) {
      if (typeof message === 'string') {
        expect(message.trim(), key).not.toBe('');
      } else {
        expect(Object.keys(message).sort(), key).toEqual(expect.arrayContaining(['one', 'other']));
        for (const form of Object.values(message)) expect(form.trim(), key).not.toBe('');
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// VO-134: no interface literal escapes the catalogue.

const USER_VISIBLE_ATTRIBUTES = new Set([
  'aria-label', 'aria-description', 'aria-roledescription', 'aria-placeholder', 'aria-valuetext',
  'title', 'placeholder', 'alt', 'label',
]);

const HAS_LETTER = /\p{L}/u;

interface Finding { file: string; line: number; text: string }

/** Every JSX text node or user-visible attribute written as a literal containing a letter. */
function findUiLiterals(fileName: string, code: string): Finding[] {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const report = (node: ts.Node, text: string): void => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push({ file: fileName, line: line + 1, text: text.trim() });
  };
  const literalText = (node: ts.Expression | undefined): string | null => {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('');
    return null;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && HAS_LETTER.test(node.text)) report(node, node.text);
    if (ts.isJsxAttribute(node) && USER_VISIBLE_ATTRIBUTES.has(node.name.getText(source))) {
      const init = node.initializer;
      const text = init && ts.isStringLiteral(init)
        ? init.text
        : init && ts.isJsxExpression(init) ? literalText(init.expression) : null;
      if (text !== null && HAS_LETTER.test(text)) report(node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function uiFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return path === MESSAGES_DIR ? [] : uiFiles(path);
    return entry.endsWith('.tsx') ? [path] : [];
  });
}

describe('VO-134: all interface text comes from the catalogue', () => {
  it('detects literals, so the guard is not vacuous', () => {
    const code = `
      export const A = () => <div aria-label="Close panel" title={'Help'}>Click here {t('x')}</div>;
      export const B = () => <span aria-label={\`Row \${1}\`}>{t('y')} › </span>;
      export const C = () => <p className="not-text" aria-label={t('ok')}>{'  '}</p>;`;
    expect(findUiLiterals('x.tsx', code).map((f) => f.text)).toEqual(['Close panel', 'Help', 'Click here', 'Row']);
  });

  it('finds no interface literal in any src/ui component', () => {
    const findings = uiFiles(UI_DIR).flatMap((file) =>
      findUiLiterals(relative(ROOT, file), readFileSync(file, 'utf8')),
    );
    expect(findings).toEqual([]);
  });
});
