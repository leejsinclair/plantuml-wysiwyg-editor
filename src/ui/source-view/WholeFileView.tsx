// The read-only whole-file view (T120; spec section 4.2, FR-016/AC7, R-6, contracts/ui.md §9). It shows the entire
// project file, text between blocks included, exactly as stored, for reading and copying. It can be focused,
// navigated and selected, never edited. "Copy whole file" copies the exact text.

import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { t } from '../messages/en.ts';

export interface WholeFileViewProps {
  /** The whole project source. */
  readonly text: string;
  /** Called with the outcome of "Copy whole file". */
  readonly onCopied?: (ok: boolean) => void;
  /** Writes text to the clipboard; the browser's clipboard by default. */
  readonly writeClipboard?: (text: string) => Promise<void>;
}

const browserClipboard = (text: string): Promise<void> =>
  typeof navigator !== 'undefined' && navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('No clipboard'));

export function WholeFileView({ text, onCopied, writeClipboard = browserClipboard }: WholeFileViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const initial = useRef(text);

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.contentAttributes.of({ 'aria-label': t('source.wholeFile.editor'), 'aria-readonly': 'true' }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === text) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
  }, [text]);

  const copy = (): void => {
    writeClipboard(text).then(
      () => onCopied?.(true),
      () => onCopied?.(false),
    );
  };

  return (
    <div className="whole-file">
      <button type="button" onClick={copy}>
        {t('source.wholeFile.copy')}
      </button>
      <div ref={host} className="whole-file__text" />
    </div>
  );
}
