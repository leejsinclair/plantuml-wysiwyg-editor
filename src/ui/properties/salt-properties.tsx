// Salt properties panel (T080; FR-003, VO-056, VO-058, VO-059, VO-060, VO-061).
// Shows the correct property fields for the selected element. Uses PropertyField for text
// properties and custom selects/inputs for span, style, and control states.
import { useId } from 'react';
import type { BlockEditorProps } from '../app/slots.ts';
import { useStore, useSession } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { PropertyField } from './PropertyField.tsx';
import { FormattingChoice } from './FormattingChoice.tsx';
import { propertiesOf, setProperty, GRID_STYLES, SEPARATOR_KINDS } from '../../core/salt/ops/properties.ts';
import { setSpan, spanInfo } from '../../core/salt/ops/span.ts';
import { screenDoc, locate } from '../../core/salt/destinations.ts';
import { shiftEdits } from '../canvas/canvas-keys.ts';
import type { SaltScreen } from '../../core/salt/model.ts';
import type { PropertyName } from '../../core/salt/ops/properties.ts';
import type { Path } from '../../core/types.ts';
import type { BlockView } from '../../core/project/project.ts';

function getDoc(source: string, view: BlockView) {
  const text = source.slice(view.start, view.end);
  return screenDoc(text);
}


export function SaltProperties({ blockKey, model, selection, readOnly }: BlockEditorProps<SaltScreen>) {
  const store = useStore();
  const session = useSession();
  const view = session.blocks.find((b) => b.key === blockKey);
  if (!view) return null;

  const path = selection ?? [];
  const state = store.getState();
  if (!state) return null;

  const doc = getDoc(state.source, view);
  if (!doc) return null;

  const props = propertiesOf(doc.model, path);
  if (props.length === 0) return <div className="salt-properties salt-properties--empty" />;

  const makeSetter = (prop: PropertyName) => (value: string) => {
    const st = store.getState();
    if (!st) return { ok: false as const, messageKey: 'screen.refuse.notFound' };
    const d = getDoc(st.source, view);
    if (!d) return { ok: false as const, messageKey: 'screen.refuse.notFound' };
    const op = setProperty(d, path, prop, value);
    if (!op.ok) return op;
    return { ...op, edits: shiftEdits(op.edits, view.start) };
  };

  // Get current element for rendering property values.
  const at = locate(doc.model, path);
  const content = at?.kind === 'cell' ? at.cell.content : null;

  return (
    <div className="salt-properties">
      {props.map((prop) => (
        <PropField
          key={prop}
          prop={prop}
          content={content}
          model={model}
          path={path}
          blockKey={blockKey}
          view={view}
          readOnly={readOnly}
          makeSetter={makeSetter}
          store={store}
        />
      ))}
    </div>
  );
}

interface PropFieldProps {
  readonly prop: PropertyName;
  readonly content: import('../../core/salt/model.ts').CellContent | null;
  readonly model: SaltScreen;
  readonly path: Path;
  readonly blockKey: string;
  readonly view: BlockView;
  readonly readOnly: boolean;
  readonly makeSetter: (prop: PropertyName) => (value: string) => import('../../core/types.ts').OpResult;
  readonly store: import('../app/store.ts').Store;
}

function PropField({ prop, content, model, path, blockKey, view, readOnly, makeSetter, store }: PropFieldProps) {
  const id = useId();

  // Get current value for the property.
  const getValue = (): string => {
    if (!content) return '';
    switch (prop) {
      case 'text': return content.type === 'text' ? content.text.text : '';
      case 'label':
        if (content.type === 'button') return content.label.text;
        if (content.type === 'checkbox') return content.label.text;
        if (content.type === 'radioButton') return content.label.text;
        return '';
      case 'value':
        if (content.type === 'textField') return content.value.text;
        if (content.type === 'dropDown') return content.value.text;
        return '';
      case 'width':
        return content.type === 'textField' ? String(content.width) : '';
      case 'checked':
        return content.type === 'checkbox' ? String(content.checked) : '';
      case 'selected':
        return content.type === 'radioButton' ? String(content.selected) : '';
      case 'options':
        return content.type === 'dropDown' ? content.options.map((o) => o.text).join('\n') : '';
      case 'open':
        return content.type === 'dropDown' ? String(content.open) : '';
      case 'items':
        if (content.type === 'tree') return content.items.map((i) => '+'.repeat(i.depth) + ' ' + i.text.text).join('\n');
        if (content.type === 'menuBar') return content.items.map((i) => i.text).join('\n');
        return '';
      case 'tabs':
        return content.type === 'tabBar' ? content.tabs.map((t) => t.text).join('\n') : '';
      case 'selectedTab':
        return content.type === 'tabBar' ? String(content.selectedIndex ?? '') : '';
      default:
        return '';
    }
  };

  // Check if this element's text has formatting (imported creole).
  const hasFormatting = (): boolean => {
    if (!content) return false;
    switch (prop) {
      case 'text': return content.type === 'text' && content.text.formatted;
      case 'label':
        if (content.type === 'button') return content.label.formatted;
        if (content.type === 'checkbox') return content.label.formatted;
        if (content.type === 'radioButton') return content.label.formatted;
        return false;
      case 'value':
        if (content.type === 'textField') return content.value.formatted;
        if (content.type === 'dropDown') return content.value.formatted;
        return false;
      default: return false;
    }
  };

  const label = t(`screen.property.${prop}`);
  const setter = makeSetter(prop);

  // Text properties.
  if (prop === 'text' || prop === 'label' || prop === 'value' || prop === 'options' || prop === 'items' || prop === 'tabs') {
    if (hasFormatting()) {
      return (
        <FormattingChoice
          blockKey={blockKey}
          view={view}
          path={path}
          property={prop}
          currentText={getValue()}
        />
      );
    }
    return (
      <PropertyField
        label={label}
        value={getValue()}
        onCommit={setter}
        blockKey={blockKey}
        readOnly={readOnly}
      />
    );
  }

  // Width (numeric).
  if (prop === 'width') {
    return (
      <PropertyField
        label={label}
        value={getValue()}
        onCommit={setter}
        blockKey={blockKey}
        readOnly={readOnly}
        description={t('screen.type.textField')}
      />
    );
  }

  // Boolean properties (checked, selected, open).
  if (prop === 'checked' || prop === 'selected' || prop === 'open') {
    const current = getValue() === 'true';
    return (
      <div className="salt-property">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type="checkbox"
          checked={current}
          disabled={readOnly}
          onChange={(e) => {
            const op = setter(String(e.target.checked));
            if (op.ok) store.applyOp(op, { blockKey });
            else store.applyOp(op);
          }}
        />
      </div>
    );
  }

  // Selected tab (numeric index).
  if (prop === 'selectedTab') {
    return (
      <PropertyField
        label={label}
        value={getValue()}
        onCommit={setter}
        blockKey={blockKey}
        readOnly={readOnly}
      />
    );
  }

  // Style (select).
  if (prop === 'style') {
    return (
      <StyleSelect blockKey={blockKey} view={view} path={path} readOnly={readOnly} model={model} store={store} />
    );
  }

  // Separator kind (select).
  if (prop === 'kind') {
    return (
      <KindSelect blockKey={blockKey} view={view} path={path} readOnly={readOnly} store={store} />
    );
  }

  // Title.
  if (prop === 'title') {
    return (
      <PropertyField
        label={label}
        value={getValue()}
        onCommit={setter}
        blockKey={blockKey}
        readOnly={readOnly}
      />
    );
  }

  // Span.
  if (prop === 'span') {
    return (
      <SpanField blockKey={blockKey} view={view} path={path} readOnly={readOnly} model={model} store={store} />
    );
  }

  return null;
}

// ─── StyleSelect ─────────────────────────────────────────────────────────────────────────────────
interface StyleSelectProps {
  blockKey: string; view: BlockView; path: Path; readOnly: boolean;
  model: SaltScreen; store: import('../app/store.ts').Store;
}

function StyleSelect({ blockKey, view, path, readOnly, store }: StyleSelectProps) {
  const id = useId();
  const state = store.getState();
  const doc = state ? getDoc(state.source, view) : null;
  const at = doc ? locate(doc.model, path) : null;
  const current = (at?.kind === 'container' && at.container.type === 'grid') ? at.container.style : 'plain';

  const handleChange = (val: string): void => {
    const st = store.getState();
    if (!st) return;
    const d = getDoc(st.source, view);
    if (!d) return;
    const op = setProperty(d, path, 'style', val);
    if (op.ok) store.applyOp({ ...op, edits: shiftEdits(op.edits, view.start) }, { blockKey });
    else store.applyOp(op);
  };

  return (
    <div className="salt-property">
      <label htmlFor={id}>{t('screen.property.style')}</label>
      <select id={id} value={current} disabled={readOnly} onChange={(e) => handleChange(e.target.value)}>
        {GRID_STYLES.map((s) => (
          <option key={s} value={s}>{t(`screen.style.${s}`)}</option>
        ))}
      </select>
    </div>
  );
}

// ─── KindSelect ──────────────────────────────────────────────────────────────────────────────────
interface KindSelectProps {
  blockKey: string; view: BlockView; path: Path; readOnly: boolean;
  store: import('../app/store.ts').Store;
}

function KindSelect({ blockKey, view, path, readOnly, store }: KindSelectProps) {
  const id = useId();
  const state = store.getState();
  const doc = state ? getDoc(state.source, view) : null;
  const at = doc ? locate(doc.model, path) : null;
  const current = at?.kind === 'separator' ? at.row.separatorKind : 'single';

  const handleChange = (val: string): void => {
    const st = store.getState();
    if (!st) return;
    const d = getDoc(st.source, view);
    if (!d) return;
    const op = setProperty(d, path, 'kind', val);
    if (op.ok) store.applyOp({ ...op, edits: shiftEdits(op.edits, view.start) }, { blockKey });
    else store.applyOp(op);
  };

  return (
    <div className="salt-property">
      <label htmlFor={id}>{t('screen.property.kind')}</label>
      <select id={id} value={current} disabled={readOnly} onChange={(e) => handleChange(e.target.value)}>
        {SEPARATOR_KINDS.map((k) => (
          <option key={k} value={k}>{t(`screen.kind.${k}`)}</option>
        ))}
      </select>
    </div>
  );
}

// ─── SpanField ───────────────────────────────────────────────────────────────────────────────────
interface SpanFieldProps {
  blockKey: string; view: BlockView; path: Path; readOnly: boolean;
  model: SaltScreen; store: import('../app/store.ts').Store;
}

function SpanField({ blockKey, view, path, readOnly, model, store }: SpanFieldProps) {
  const id = useId();
  const info = spanInfo(model, path);
  const limitText = info.limit
    ? (info.limit.kind === 'rowEnd'
        ? t('screen.span.limitedByRowEnd')
        : info.limit.kind === 'element'
          ? (info.limit.name
              ? t('screen.span.limitedByName', { name: info.limit.name, column: info.limit.column })
              : t('screen.span.limitedNoName', { column: info.limit.column }))
          : undefined)
    : undefined;

  const handleChange = (val: string): void => {
    const n = parseInt(val, 10);
    if (isNaN(n)) return;
    const st = store.getState();
    if (!st) return;
    const d = getDoc(st.source, view);
    if (!d) return;
    const op = setSpan(d, path, n);
    if (op.ok) store.applyOp({ ...op, edits: shiftEdits(op.edits, view.start) }, { blockKey });
    else store.applyOp(op);
  };

  if (!info.offered) return null;

  return (
    <div className="salt-property">
      <label htmlFor={id}>{t('screen.span.label')}</label>
      <input
        id={id}
        type="number"
        min={1}
        max={info.max}
        value={info.current}
        disabled={readOnly}
        onChange={(e) => handleChange(e.target.value)}
        aria-describedby={limitText ? `${id}-limit` : undefined}
      />
      {limitText && <p id={`${id}-limit`} className="property-description">{limitText}</p>}
    </div>
  );
}
