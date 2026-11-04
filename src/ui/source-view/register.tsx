// Source editing contributions (T122; spec section 4.2, FR-004/AC8–AC10, FR-016/AC7).
//
// A toolbar entry owns the source edit for the open project: while it is mounted it registers the `sourceEdit`
// controller, which makes `SourceView` editable, and hosts the re-division warning. It also offers the
// "Whole file" toggle, which opens the read-only whole-file view for copying. The controller needs the store,
// which only exists inside the workspace, so it is registered from there rather than at import time.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { slots as appSlots, type Slots } from '../app/slots.ts';
import { useSession, useStore } from '../app/store.ts';
import { announce } from '../announcer/Announcer.tsx';
import { t } from '../messages/en.ts';
import type { NoticesStore } from '../notices/Notices.tsx';
import { createSourceEdit, type RedivideWarning } from './source-edit.ts';
import { WholeFileView } from './WholeFileView.tsx';
import { IconFileText } from '@tabler/icons-react';

export interface SourceEditRegistration {
  readonly notices?: NoticesStore;
  readonly pauseMs?: number;
  /** Writes text to the clipboard (tests); the browser's clipboard by default. */
  readonly writeClipboard?: (text: string) => Promise<void>;
}

const overlay = { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0, 0, 0, 0.3)', zIndex: 20 } as const;
const panel = { background: 'var(--surface, #fff)', color: 'inherit', padding: 16, maxWidth: 'min(90vw, 960px)', maxHeight: '85vh', overflow: 'auto', borderRadius: 6 } as const;

interface Pending {
  readonly warning: RedivideWarning;
  readonly resolve: (proceed: boolean) => void;
}

function RedivideDialog({ pending, onClose }: { readonly pending: Pending; onClose(proceed: boolean): void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  const { warning } = pending;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose(false);
    }
  };
  return createPortal(
    <div style={overlay}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="redivide-title" aria-describedby="redivide-message" style={panel} onKeyDown={onKeyDown}>
        <h2 id="redivide-title">{t('source.redivideWarning.title')}</h2>
        <p id="redivide-message">
          {t('source.redivideWarning.message', { block: warning.block, screens: warning.screens.join(', '), count: warning.count })}
        </p>
        <button type="button" onClick={() => onClose(true)}>
          {t('source.redivideWarning.proceed')}
        </button>{' '}
        <button type="button" ref={cancel} onClick={() => onClose(false)}>
          {t('source.redivideWarning.cancel')}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function WholeFileDialog({ onClose, writeClipboard }: { onClose(): void; readonly writeClipboard?: (text: string) => Promise<void> }) {
  const store = useStore();
  useSession(); // re-render when the source changes
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };
  return createPortal(
    <div role="dialog" aria-labelledby="whole-file-title" style={{ ...panel, position: 'fixed', top: 48, right: 16, zIndex: 15, boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)' }} onKeyDown={onKeyDown}>
      <h2 id="whole-file-title">{t('source.wholeFile.title')}</h2>
      <WholeFileView
        text={store.getState()?.source ?? ''}
        onCopied={(ok) => announce(ok ? 'source.wholeFile.copied' : 'source.wholeFile.copyFailed')}
        {...(writeClipboard ? { writeClipboard } : {})}
      />
      <button type="button" ref={close} onClick={onClose}>
        {t('source.wholeFile.close')}
      </button>
    </div>,
    document.body,
  );
}

/** The toolbar entry: owns the controller while the workspace is shown, the warning, and the whole-file toggle. */
function makeSourceEditTools(slots: Slots, options: SourceEditRegistration) {
  return function SourceEditTools() {
    const store = useStore();
    const [pending, setPending] = useState<Pending | null>(null);
    const [wholeFile, setWholeFile] = useState(false);
    const toggle = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      const controller = createSourceEdit({
        store,
        slots,
        ...(options.notices ? { notices: options.notices } : {}),
        ...(options.pauseMs !== undefined ? { pauseMs: options.pauseMs } : {}),
        confirm: (warning) => new Promise<boolean>((resolve) => setPending({ warning, resolve })),
      });
      const remove = slots.sourceEdit.set(controller);
      return () => {
        remove();
        controller.dispose();
      };
    }, [store]);

    const closeWarning = (proceed: boolean): void => {
      pending?.resolve(proceed);
      setPending(null);
    };
    const closeWholeFile = (): void => {
      setWholeFile(false);
      toggle.current?.focus();
    };

    return (
      <>
        <button type="button" ref={toggle} aria-pressed={wholeFile} onClick={() => (wholeFile ? closeWholeFile() : setWholeFile(true))}>
          <IconFileText size={16} aria-hidden="true" />
          {t('source.wholeFile.toggle')}
        </button>
        {wholeFile ? <WholeFileDialog onClose={closeWholeFile} {...(options.writeClipboard ? { writeClipboard: options.writeClipboard } : {})} /> : null}
        {pending ? <RedivideDialog pending={pending} onClose={closeWarning} /> : null}
      </>
    );
  };
}

/** Registers the source edit toolbar entry in `slots`; returns the function that removes it. */
export function registerSourceEdit(slots: Slots = appSlots, options: SourceEditRegistration = {}): () => void {
  return slots.toolbar.register({ id: 'source-edit', order: 50, Component: makeSourceEditTools(slots, options) });
}

registerSourceEdit();
