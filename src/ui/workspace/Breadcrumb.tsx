// The breadcrumb (FR-002/AC12, contracts/ui.md §7): the selection's path labels from the block down to the selected
// element, as a `navigation` landmark with parts separated by " › ". Every part is selectable.
//
// Labels come from `blockEditors[kind].pathLabels(model, path)`, block first. Each label names one path prefix,
// aligned from the selected element: the last label is the whole path, the one before it one level up, and so on,
// with the block itself at the root (an empty path). An editor may name fewer levels than the path has.
import type { Path } from '../../core/types.ts';
import { t } from '../messages/en.ts';

export interface BreadcrumbPart {
  readonly label: string;
  readonly path: Path;
}

export function breadcrumbParts(labels: readonly string[], path: Path): BreadcrumbPart[] {
  const last = labels.length - 1;
  return labels.map((label, i) => ({ label, path: i === 0 ? [] : path.slice(0, Math.max(0, path.length - (last - i))) }));
}

export interface BreadcrumbProps {
  /** Path labels, block first. */
  readonly labels: readonly string[];
  /** The selected path, or `null` when nothing is selected (the labels then name only the block). */
  readonly path: Path | null;
  onSelect(path: Path): void;
}

export function Breadcrumb({ labels, path, onSelect }: BreadcrumbProps) {
  const parts = breadcrumbParts(labels, path ?? []);
  const separator = t('breadcrumb.separator');
  return (
    <nav aria-label={t('breadcrumb.label')} className="breadcrumb">
      <ol>
        {parts.map((part, i) => (
          <li key={i}>
            {i > 0 ? <span aria-hidden="true">{separator}</span> : null}
            <button
              type="button"
              aria-current={path !== null && i === parts.length - 1 ? 'location' : undefined}
              onClick={() => onSelect(part.path)}
            >
              {part.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
