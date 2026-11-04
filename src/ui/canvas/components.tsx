// Salt canvas components (T077; FR-016/AC5–AC6, contracts/ui.md §13).
// Components are drawn Salt-like, never as live controls. Each element renders its visible state
// without being interactive. Interaction (selection, editing, keyboard) belongs to CellView.
import type { SeparatorKind, GridStyle } from '../../core/salt/model.ts';
import { t } from '../messages/en.ts';
import { RoughBorder } from './RoughBorder.tsx';

// ─── Separator rule ─────────────────────────────────────────────────────────────────────────────
const SEP_STYLE: Record<SeparatorKind, string> = {
  single: 'solid',
  double: 'double',
  dotted: 'dotted',
  wavy: 'wavy',
};

export function SeparatorLine({ kind }: { readonly kind: SeparatorKind }) {
  return (
    <div
      className="salt-separator"
      role="separator"
      aria-label={t(`screen.kind.${kind}`)}
      style={{ borderBottom: `2px ${SEP_STYLE[kind]} currentColor`, margin: '2px 0' }}
    />
  );
}

// ─── Text ───────────────────────────────────────────────────────────────────────────────────────
export function TextComponent({ text }: { readonly text: string }) {
  return <span className="salt-text">{text || ' '}</span>;
}

// ─── Button ─────────────────────────────────────────────────────────────────────────────────────
export function ButtonComponent({ label, rough = false }: { readonly label: string; readonly rough?: boolean }) {
  return (
    <RoughBorder rough={rough}>
      <div className="salt-button" aria-hidden="true" style={{ display: 'inline-block', border: rough ? 'none' : '1px solid currentColor', padding: '0 6px', borderRadius: 2 }}>
        {label || ' '}
      </div>
    </RoughBorder>
  );
}

// ─── TextField ──────────────────────────────────────────────────────────────────────────────────
export function TextFieldComponent({ value, width, rough = false }: { readonly value: string; readonly width: number; readonly rough?: boolean }) {
  const displayWidth = Math.max(width, 6);
  return (
    <RoughBorder rough={rough}>
      <div
        className="salt-textfield"
        aria-hidden="true"
        style={{
          display: 'inline-block',
          border: rough ? 'none' : '1px solid currentColor',
          borderRadius: 2,
          padding: '0 4px',
          minWidth: `${displayWidth}ch`,
          background: 'var(--textfield-bg, transparent)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {value || ' '}
      </div>
    </RoughBorder>
  );
}

// ─── Checkbox ───────────────────────────────────────────────────────────────────────────────────
export function CheckboxComponent({ checked, label }: { readonly checked: boolean; readonly label: string }) {
  return (
    <div className="salt-checkbox" aria-hidden="true" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <div style={{ width: 12, height: 12, border: '1px solid currentColor', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {checked ? <span style={{ fontSize: 9, lineHeight: 1 }}>✓</span> : null}
      </div>
      <span>{label || ' '}</span>
    </div>
  );
}

// ─── RadioButton ────────────────────────────────────────────────────────────────────────────────
export function RadioButtonComponent({ selected, label }: { readonly selected: boolean; readonly label: string }) {
  return (
    <div className="salt-radio" aria-hidden="true" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <div style={{ width: 12, height: 12, border: '1px solid currentColor', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {selected ? <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} /> : null}
      </div>
      <span>{label || ' '}</span>
    </div>
  );
}

// ─── DropDown ───────────────────────────────────────────────────────────────────────────────────
export function DropDownComponent({ value, open, options }: { readonly value: string; readonly open: boolean; readonly options: readonly { text: string }[] }) {
  return (
    <div className="salt-dropdown" aria-hidden="true" style={{ display: 'inline-block', border: '1px solid currentColor', borderRadius: 2, padding: '0 4px', minWidth: '8ch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ flex: 1 }}>{value || ' '}</span>
        <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && options.length > 0 && (
        <div style={{ borderTop: '1px solid currentColor', marginTop: 2 }}>
          {options.map((o, i) => (
            <div key={i} style={{ padding: '1px 0' }}>{o.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tree ───────────────────────────────────────────────────────────────────────────────────────
export function TreeComponent({ items, rough = false }: { readonly items: readonly { depth: number; text: { text: string } }[]; readonly rough?: boolean }) {
  return (
    <RoughBorder rough={rough}>
      <div className="salt-tree" aria-hidden="true" style={{ border: rough ? 'none' : '1px solid currentColor', padding: '2px 4px', minWidth: '12ch' }}>
        {items.map((item, i) => (
          <div key={i} style={{ paddingLeft: (item.depth - 1) * 12 }}>
            {'+'.repeat(item.depth)} {item.text.text}
          </div>
        ))}
      </div>
    </RoughBorder>
  );
}

// ─── TabBar ─────────────────────────────────────────────────────────────────────────────────────
export function TabBarComponent({ tabs, selectedIndex }: { readonly tabs: readonly { text: string }[]; readonly selectedIndex: number | null }) {
  return (
    <div className="salt-tabbar" aria-hidden="true" style={{ display: 'flex', borderBottom: '1px solid currentColor', gap: 0 }}>
      {tabs.map((tab, i) => (
        <div
          key={i}
          style={{
            padding: '2px 8px',
            border: '1px solid currentColor',
            borderBottom: i === selectedIndex ? '2px solid currentColor' : 'none',
            fontWeight: i === selectedIndex ? 600 : undefined,
            marginBottom: i === selectedIndex ? -1 : 0,
          }}
        >
          {tab.text}
        </div>
      ))}
    </div>
  );
}

// ─── MenuBar ────────────────────────────────────────────────────────────────────────────────────
export function MenuBarComponent({ items }: { readonly items: readonly { text: string }[] }) {
  return (
    <div className="salt-menubar" aria-hidden="true" style={{ display: 'flex', borderBottom: '1px solid currentColor', gap: 0 }}>
      {items.map((item, i) => (
        <div key={i} style={{ padding: '2px 8px', border: '1px solid currentColor', borderBottom: 'none' }}>
          {item.text}
        </div>
      ))}
    </div>
  );
}

// ─── Empty cell marker ───────────────────────────────────────────────────────────────────────────
export function EmptyCellMarker({ visible }: { readonly visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="salt-empty-marker"
      aria-hidden="true"
      style={{
        width: '100%',
        height: '100%',
        minWidth: '2em',
        minHeight: '1.5em',
        border: '1px dashed var(--empty-cell-border, #aaa)',
        borderRadius: 2,
        opacity: 0.5,
      }}
    />
  );
}

// ─── Grid container style ─────────────────────────────────────────────────────────────────────
export function containerBorderStyle(style: GridStyle): React.CSSProperties {
  switch (style) {
    case 'plain':
      return {};
    case 'border':
      return { border: '1px solid currentColor', padding: 4 };
    case 'tableLines':
      return { border: '1px solid currentColor', padding: 0 };
    case 'verticalLines':
      return { border: '1px solid currentColor', borderLeft: 'none', borderRight: 'none', padding: 2 };
    case 'horizontalLines':
      return { border: '1px solid currentColor', borderTop: 'none', borderBottom: 'none', padding: 2 };
    case 'groupBox':
      return { border: '2px groove currentColor', padding: 4 };
  }
}

// Import React for CSSProperties type.
import type React from 'react';
