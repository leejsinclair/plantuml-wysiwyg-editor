// The locked placeholder (spec section 4.1, FR-010/AC2, data-model §5.2 and §5.3 LockedPart), shared by the
// screen canvas and the flow canvas. Valid content the visual editor does not support is shown as one
// labelled, locked item at the smallest unit that can be isolated, stating the reason and showing a source
// excerpt. Its text is changed only in the source view.
//
// The placeholder only presents. Each canvas owns selection, focus, moving and deleting the part as a unit,
// and passes its own role, `tabIndex`, ARIA state and handlers, which are spread onto the item. Without a
// role it is a `group`. It is a wireframe item, never a live form control (contracts/ui.md §13).

import { useId, type HTMLAttributes } from 'react';
import type { MessageParams } from '../../core/types.ts';
import { t } from '../messages/en.ts';

/** Lines of excerpt shown before the rest is summarised as "… n more lines". */
export const EXCERPT_LINES = 4;

export interface LockedPlaceholderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The locked part's reason: a message-catalogue key (`LockedPart.reason`). */
  readonly reasonKey: string;
  readonly reasonParams?: MessageParams;
  /** The part's source, shown exactly as written (`LockedPart.excerpt`). */
  readonly excerpt: string;
  /** Shown as selected on the canvas (`data-selected`); the canvas sets any ARIA selection state itself. */
  readonly selected?: boolean;
  /** Excerpt lines shown; the default is `EXCERPT_LINES`. */
  readonly maxLines?: number;
}

const LockIcon = () => (
  <svg className="locked-placeholder__icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <rect x="2" y="5" width="8" height="6" rx="1" fill="currentColor" />
    <path d="M4 5V3.5a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export function LockedPlaceholder({
  reasonKey,
  reasonParams,
  excerpt,
  selected = false,
  maxLines = EXCERPT_LINES,
  className,
  style,
  ...itemProps
}: LockedPlaceholderProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const reasonId = `${id}-reason`;
  const excerptId = `${id}-excerpt`;
  const hintId = `${id}-hint`;

  const lines = excerpt.split(/\r\n|\r|\n/);
  const shown = lines.slice(0, Math.max(1, maxLines));
  const hidden = lines.length - shown.length;

  return (
    <div
      role="group"
      aria-roledescription={t('lockedPlaceholder.roleDescription')}
      aria-labelledby={`${titleId} ${reasonId}`}
      aria-describedby={`${excerptId} ${hintId}`}
      {...itemProps}
      className={className ? `locked-placeholder ${className}` : 'locked-placeholder'}
      data-locked="true"
      data-selected={selected ? 'true' : undefined}
      style={{
        border: '1px dashed var(--locked-border, currentColor)',
        borderRadius: 4,
        padding: '4px 6px',
        background: 'var(--locked-bg, transparent)',
        outline: selected ? '2px solid var(--selection, Highlight)' : undefined,
        outlineOffset: selected ? 1 : undefined,
        minWidth: 0,
        ...style,
      }}
    >
      <div className="locked-placeholder__header" style={{ display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <LockIcon />
        <span id={titleId} className="locked-placeholder__title" style={{ fontWeight: 600 }}>
          {t('lockedPlaceholder.title')}
        </span>
        <span id={reasonId} className="locked-placeholder__reason">
          {t(reasonKey, reasonParams)}
        </span>
      </div>
      <pre
        className="locked-placeholder__excerpt"
        style={{ margin: '4px 0 0', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.85em' }}
      >
        <code id={excerptId} data-testid="locked-excerpt">
          {shown.join('\n')}
        </code>
      </pre>
      {hidden > 0 && (
        <div className="locked-placeholder__more" style={{ fontSize: '0.85em' }}>
          {t('lockedPlaceholder.moreLines', { count: hidden })}
        </div>
      )}
      <div id={hintId} className="locked-placeholder__hint" style={{ fontSize: '0.85em' }}>
        {t('lockedPlaceholder.editInSource')}
      </div>
    </div>
  );
}
