// Inline text editor for cells (T077; FR-009/AC3, VO-057).
// Opens when the user presses F2, Enter (on a leaf element) or double-clicks a cell.
// Commits on Enter or blur; discards on Escape.
import { useEffect, useRef, useState } from 'react';
import type { Path } from '../../core/types.ts';
import type { BlockView } from '../../core/project/project.ts';
import { useStore } from '../app/store.ts';
import { screenDoc } from '../../core/salt/destinations.ts';
import { setProperty } from '../../core/salt/ops/properties.ts';
import { shiftEdits } from './canvas-keys.ts';
import type { OpResult } from '../../core/types.ts';

export interface InlineEditProps {
  /** The current text shown in the field. */
  readonly initialValue: string;
  /** The property to write ('text' | 'label' | 'value'). */
  readonly property: 'text' | 'label' | 'value';
  readonly blockKey: string;
  readonly view: BlockView;
  readonly path: Path;
  onCommit(): void;
  onCancel(): void;
}

export function InlineEdit({ initialValue, property, blockKey, view, path, onCommit, onCancel }: InlineEditProps) {
  const store = useStore();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
    inputRef.current?.focus();
  }, []);

  const commit = (): void => {
    if (value === initialValue) { onCommit(); return; }
    const state = store.getState();
    if (!state) { onCommit(); return; }
    const text = state.source.slice(view.start, view.end);
    const doc = screenDoc(text);
    if (!doc) { onCommit(); return; }
    const op: OpResult = setProperty(doc, path, property, value);
    if (op.ok) {
      const shifted = { ...op, edits: shiftEdits(op.edits, view.start) };
      store.applyOp(shifted, { blockKey });
    } else {
      store.applyOp(op); // announce refusal
    }
    onCommit();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="salt-inline-edit"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      style={{ fontSize: 'inherit', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
    />
  );
}

import type React from 'react';
