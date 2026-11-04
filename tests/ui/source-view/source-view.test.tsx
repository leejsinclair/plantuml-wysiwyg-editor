import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceView, FLASH_MS, type SourceViewHandle } from '../../../src/ui/source-view/SourceView.tsx';
import { activityLanguage, languageFor, saltLanguage } from '../../../src/ui/source-view/highlight.ts';
import { createSlots } from '../../../src/ui/app/slots.ts';
import { t } from '../../../src/ui/messages/en.ts';

const SALT = "@startsalt Login\n' a comment\n{+\n  Name | \"     \"\n  [X] Remember | [OK]\n}\n@endsalt\n";

function viewOf(container: HTMLElement): EditorView {
  const dom = container.querySelector('.cm-editor');
  expect(dom).not.toBeNull();
  const view = EditorView.findFromDOM(dom as HTMLElement);
  expect(view).not.toBeNull();
  return view!;
}

function controller() {
  return { begin: vi.fn<(key: string) => void>(), change: vi.fn<(key: string, text: string) => void>(), end: vi.fn<(key: string) => void>() };
}

/** A user edit, as CodeMirror's input handling would dispatch it. */
function type(view: EditorView, at: number, insert: string): void {
  act(() => view.dispatch({ changes: { from: at, insert }, userEvent: 'input.type' }));
}

afterEach(() => vi.useRealTimers());

describe('SourceView: a CodeMirror 6 wrapper (R-6)', () => {
  it('shows the block text in a labelled editor', () => {
    const slots = createSlots();
    const { container } = render(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" />);
    expect(viewOf(container).state.doc.toString()).toBe(SALT);
    expect(screen.getByRole('textbox', { name: t('region.source') })).toBeInTheDocument();
  });

  it('is read-only while no sourceEdit controller is registered', () => {
    const slots = createSlots();
    const { container } = render(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" />);
    const view = viewOf(container);
    expect(view.state.readOnly).toBe(true);
    expect(view.contentDOM).toHaveAttribute('aria-readonly', 'true');
  });

  it('becomes editable when a controller is registered and read-only again when it goes', () => {
    const slots = createSlots();
    const { container } = render(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" />);
    const view = viewOf(container);
    let remove: () => void = () => {};
    act(() => {
      remove = slots.sourceEdit.set(controller());
    });
    expect(view.state.readOnly).toBe(false);
    expect(view.contentDOM).toHaveAttribute('aria-readonly', 'false');
    act(() => remove());
    expect(view.state.readOnly).toBe(true);
  });

  it('reports typing to the controller: begin once, then every change with the whole text', () => {
    const slots = createSlots();
    const c = controller();
    slots.sourceEdit.set(c);
    const { container } = render(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" />);
    const view = viewOf(container);
    type(view, 0, 'x');
    type(view, 1, 'y');
    expect(c.begin).toHaveBeenCalledTimes(1);
    expect(c.begin).toHaveBeenCalledWith('b1');
    expect(c.change).toHaveBeenLastCalledWith('b1', `xy${SALT}`);
    expect(c.end).not.toHaveBeenCalled();
  });

  it('ends the source edit when focus leaves', () => {
    const slots = createSlots();
    const c = controller();
    slots.sourceEdit.set(c);
    const { container } = render(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" />);
    const view = viewOf(container);
    type(view, 0, 'x');
    fireEvent.blur(view.contentDOM);
    expect(c.end).toHaveBeenCalledWith('b1');
  });
});

describe('SourceView: keyboard (FR-009/AC15)', () => {
  it('moves focus out on Esc and ends the source edit', () => {
    const slots = createSlots();
    const c = controller();
    slots.sourceEdit.set(c);
    const onEscape = vi.fn();
    const { container } = render(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" onEscape={onEscape} />);
    const view = viewOf(container);
    type(view, 0, 'x');
    const notPrevented = fireEvent.keyDown(view.contentDOM, { key: 'Escape', code: 'Escape', keyCode: 27 });
    expect(notPrevented).toBe(false);
    expect(c.end).toHaveBeenCalledTimes(1);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not trap Tab', () => {
    const slots = createSlots();
    const { container } = render(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" />);
    const view = viewOf(container);
    const notPrevented = fireEvent.keyDown(view.contentDOM, { key: 'Tab', code: 'Tab', keyCode: 9 });
    expect(notPrevented).toBe(true);
  });
});

describe('SourceView: focusLine for "Fix in source"', () => {
  it('focuses the editor with the cursor at the start of the line', () => {
    const slots = createSlots();
    const ref = createRef<SourceViewHandle>();
    const { container } = render(<SourceView ref={ref} slots={slots} blockKey="b1" text={SALT} language="salt" />);
    const view = viewOf(container);
    act(() => ref.current!.focusLine(4));
    expect(view.state.selection.main.head).toBe(view.state.doc.line(4).from);
    expect(document.activeElement).toBe(view.contentDOM);
  });

  it('clamps a line beyond the end', () => {
    const slots = createSlots();
    const ref = createRef<SourceViewHandle>();
    const { container } = render(<SourceView ref={ref} slots={slots} blockKey="b1" text={SALT} language="salt" />);
    const view = viewOf(container);
    act(() => ref.current!.focusLine(99));
    expect(view.state.selection.main.head).toBe(view.state.doc.line(view.state.doc.lines).from);
  });
});

describe('SourceView: selection highlight and changed lines', () => {
  it('highlights the selected element’s source', () => {
    const slots = createSlots();
    const start = SALT.indexOf('[OK]');
    const { container, rerender } = render(
      <SourceView slots={slots} blockKey="b1" text={SALT} language="salt" highlight={{ start, end: start + 4 }} />,
    );
    const marks = container.querySelectorAll('.cm-source-selected');
    expect([...marks].map((m) => m.textContent).join('')).toBe('[OK]');
    rerender(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" highlight={null} />);
    expect(container.querySelectorAll('.cm-source-selected')).toHaveLength(0);
  });

  it('applies a visual edit, briefly highlights the changed lines and leaves the cursor where it was', () => {
    vi.useFakeTimers();
    const slots = createSlots();
    const c = controller();
    slots.sourceEdit.set(c);
    const { container, rerender } = render(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" />);
    const view = viewOf(container);
    act(() => view.dispatch({ selection: { anchor: 3 } }));
    const scrollTop = view.scrollDOM.scrollTop;

    const next = SALT.replace('[OK]', '[Save]');
    rerender(<SourceView slots={slots} blockKey="b1" text={next} language="salt" />);
    expect(view.state.doc.toString()).toBe(next);
    expect(view.state.selection.main.head).toBe(3);
    expect(view.scrollDOM.scrollTop).toBe(scrollTop);
    const flashed = [...container.querySelectorAll('.cm-source-changed')].map((l) => l.textContent);
    expect(flashed).toEqual(['  [X] Remember | [Save]']);
    // A change from outside is not typing.
    expect(c.begin).not.toHaveBeenCalled();
    expect(c.change).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(FLASH_MS + 10));
    expect(container.querySelectorAll('.cm-source-changed')).toHaveLength(0);
  });

  it('shows another block’s text when the block changes, without a highlight', () => {
    const slots = createSlots();
    const { container, rerender } = render(<SourceView slots={slots} blockKey="b1" text={SALT} language="salt" />);
    const other = '@startuml Screen-flow\nstart\n:Sign in;\nstop\n@enduml\n';
    rerender(<SourceView slots={slots} blockKey="b2" text={other} language="activity" />);
    expect(viewOf(container).state.doc.toString()).toBe(other);
    expect(container.querySelectorAll('.cm-source-changed')).toHaveLength(0);
  });
});

describe('SourceView: CRLF blocks keep their line endings (FR-020)', () => {
  const CRLF = SALT.replaceAll('\n', '\r\n');

  it('shows a CRLF block and reports typing with CRLF intact', () => {
    const slots = createSlots();
    const c = controller();
    slots.sourceEdit.set(c);
    const { container } = render(<SourceView slots={slots} blockKey="b1" text={CRLF} language="salt" />);
    const view = viewOf(container);
    expect(view.state.sliceDoc()).toBe(CRLF);
    type(view, view.state.doc.line(4).from, '  ');
    expect(c.change).toHaveBeenLastCalledWith('b1', CRLF.replace('  Name', '    Name'));
  });

  it('applies a visual edit and highlights a range given as string offsets', () => {
    const slots = createSlots();
    const { container, rerender } = render(<SourceView slots={slots} blockKey="b1" text={CRLF} language="salt" />);
    const edited = CRLF.replace('[OK]', '[Okay]');
    rerender(<SourceView slots={slots} blockKey="b1" text={edited} language="salt" />);
    const view = viewOf(container);
    expect(view.state.sliceDoc()).toBe(edited);
    const start = edited.indexOf('[Okay]');
    rerender(<SourceView slots={slots} blockKey="b1" text={edited} language="salt" highlight={{ start, end: start + 6 }} />);
    expect(container.querySelector('.cm-source-selected')?.textContent).toBe('[Okay]');
  });
});

describe('highlight: Salt and activity tokens', () => {
  /** Each highlighted span as `text:classes`. */
  function spans(language: typeof saltLanguage, text: string): string[] {
    const tree = language.parser.parse(text);
    const out: string[] = [];
    highlightTree(tree, classHighlighter, (from, to, cls) => out.push(`${text.slice(from, to)}:${cls}`));
    return out;
  }

  it('highlights Salt structure, elements and comments', () => {
    const out = spans(saltLanguage, SALT);
    expect(out).toContain('@startsalt:tok-keyword');
    expect(out).toContain('Login:tok-labelName');
    expect(out).toContain("' a comment:tok-comment");
    expect(out).toContain('{+:tok-keyword');
    expect(out).toContain('|:tok-operator');
    expect(out).toContain('"     ":tok-string');
    expect(out).toContain('[X]:tok-atom');
    expect(out).toContain('[OK]:tok-string');
    expect(out).toContain('}:tok-punctuation');
  });

  it('highlights Salt preprocessor lines, separators, spans and block comments', () => {
    const out = spans(saltLanguage, "!define X 1\n{\n  ==\n  a | *\n/' one\n two '/\n}\n");
    expect(out).toContain('!define X 1:tok-meta');
    expect(out).toContain('==:tok-atom');
    expect(out).toContain('*:tok-operator');
    expect(out.filter((s) => s.endsWith(':tok-comment')).map((s) => s.slice(0, -':tok-comment'.length)).join('|')).toBe("/' one| two '/");
  });

  it('highlights activity keywords, steps, links, lanes and notes', () => {
    const text =
      "@startuml Screen-flow\n|Customer|\nstart\n:[[#Sign-in Sign in]];\nif (OK?) then (yes)\n  :Pay;\nelse (no)\nendif\nnote right: Hi\nstop\n@enduml\n";
    const out = spans(activityLanguage, text);
    expect(out).toContain('@startuml:tok-keyword');
    expect(out).toContain('|Customer|:tok-labelName');
    expect(out).toContain('start:tok-keyword');
    expect(out).toContain('if:tok-keyword');
    expect(out).toContain('endif:tok-keyword');
    expect(out).toContain('[[#Sign-in:tok-link');
    expect(out).toContain(':Pay;:tok-string');
    expect(out).toContain('note right:tok-keyword');
  });

  it('chooses the language for a block kind', () => {
    expect(languageFor('salt')).toBe(saltLanguage);
    expect(languageFor('activity')).toBe(activityLanguage);
    expect(languageFor('other')).toBeNull();
  });
});
