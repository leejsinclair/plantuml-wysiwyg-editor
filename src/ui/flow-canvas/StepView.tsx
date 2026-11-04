// StepView: a single flow element on the canvas (FR-013/AC2, AC4, FR-009/AC13).
// Shows the element's label, lane marker, link badge and notes beside it.
import type { ReactNode } from 'react';
import type { Path } from '../../core/types.ts';
import type { FlowElement, Note } from '../../core/activity/model.ts';
import { t } from '../messages/en.ts';

export interface StepViewProps {
  readonly element: FlowElement;
  readonly path: Path;
  readonly selected: boolean;
  readonly readOnly: boolean;
  readonly notes: readonly Note[];
  readonly laneChange: string | null; // lane name when a switch precedes this element
  readonly linkStatus?: 'linked' | 'broken' | 'caseOnly' | 'ambiguous' | null;
  readonly linkScreen?: string;
  onSelect(path: Path): void;
  onKeyDown?(event: React.KeyboardEvent<HTMLElement>): void;
  readonly tabIndex?: number;
  readonly 'aria-selected'?: boolean;
  readonly 'aria-level'?: number;
  readonly 'aria-setsize'?: number;
  readonly 'aria-posinset'?: number;
  readonly id?: string;
}

function linkBadge(status: StepViewProps['linkStatus'], screen: string | undefined): ReactNode {
  if (!status || !screen) return null;
  const key = `flow.link.${status}` as const;
  return (
    <span
      className={`step-view__link step-view__link--${status}`}
      aria-label={t(key, { screen })}
      title={t(key, { screen })}
    />
  );
}

function noteMarkers(notes: readonly Note[]): ReactNode {
  if (notes.length === 0) return null;
  const lefts = notes.filter((n) => n.side === 'left');
  const rights = notes.filter((n) => n.side === 'right');
  return (
    <>
      {lefts.length > 0 && (
        <span className="step-view__note step-view__note--left" aria-label={t('flow.note.leftMarker')}>
          {lefts.map((n) => n.text.text).join(', ')}
        </span>
      )}
      {rights.length > 0 && (
        <span className="step-view__note step-view__note--right" aria-label={t('flow.note.rightMarker')}>
          {rights.map((n) => n.text.text).join(', ')}
        </span>
      )}
    </>
  );
}

function elementLabel(element: FlowElement): string {
  switch (element.kind) {
    case 'start': return t('flow.item.start');
    case 'stop': return t('flow.item.stop');
    case 'step': return t('flow.item.step', { text: element.label.text });
    case 'decision': return t('flow.item.decision', { text: element.branches[0]?.condition?.text ?? '' });
    case 'loop': return t('flow.item.loop', { text: element.labels.is?.text ?? '' });
    case 'locked': return t('flow.item.locked');
  }
}

export function StepView({
  element,
  path,
  selected,
  readOnly: _readOnly,
  notes,
  laneChange,
  linkStatus,
  linkScreen,
  onSelect,
  onKeyDown,
  tabIndex,
  id,
  ...aria
}: StepViewProps) {
  const label = elementLabel(element);
  const laneNotes = notes.length > 0 ? t('flow.item.withNotes', { count: notes.length, item: label }) : label;
  const fullLabel = laneChange ? t('flow.item.inLane', { item: laneNotes, lane: laneChange }) : laneNotes;

  return (
    <div className="step-view__wrapper">
      {laneChange && (
        <div className="step-view__lane-marker" aria-hidden="true">
          {t('flow.lane.marker', { lane: laneChange })}
        </div>
      )}
      <div className="step-view__row">
        {noteMarkers(notes.filter((n) => n.side === 'left'))}
        <div
          {...aria}
          id={id}
          role="treeitem"
          tabIndex={tabIndex ?? -1}
          aria-selected={selected}
          aria-label={fullLabel}
          className={`step-view__item step-view__item--${element.kind}${selected ? ' step-view__item--selected' : ''}`}
          onClick={() => onSelect(path)}
          onKeyDown={onKeyDown}
        >
          <span className="step-view__label">{label}</span>
          {linkBadge(linkStatus ?? null, linkScreen)}
        </div>
        {noteMarkers(notes.filter((n) => n.side === 'right'))}
      </div>
    </div>
  );
}
