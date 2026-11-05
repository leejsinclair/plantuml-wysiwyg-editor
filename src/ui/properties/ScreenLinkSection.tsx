// "Link to screen" section under a button's properties: an expandable area listing the project's screens.
// Choosing one adds a step for the button to the screen flow, linked to that screen.
import type { SlotContext } from '../app/slots.ts';
import { useSession, useStore } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { screenDoc, locate } from '../../core/salt/destinations.ts';
import { useLinkToScreen } from '../canvas/link-to-screen.ts';

export function ScreenLinkSection({ ctx }: { readonly ctx: SlotContext }) {
  const session = useSession();
  const store = useStore();
  const link = useLinkToScreen();
  if (!ctx.block || ctx.block.kind !== 'screen' || ctx.selection === null || ctx.block.readOnly) return null;
  const view = session.blocks.find((b) => b.key === ctx.block!.key);
  const state = store.getState();
  if (!view || !state) return null;
  const doc = screenDoc(state.source.slice(view.start, view.end));
  const at = doc ? locate(doc.model, ctx.selection) : null;
  const content = at?.kind === 'cell' ? at.cell.content : null;
  if (!content || content.type !== 'button') return null;

  const label = content.label.text;
  const screens = session.blocks.filter((b) => b.kind === 'screen' && b.name && b.key !== view.key);

  return (
    <details className="screen-link-section">
      <summary>{t('canvas.contextMenu.linkToScreen')}</summary>
      {screens.length === 0 ? (
        <p>{t('canvas.contextMenu.noScreens')}</p>
      ) : (
        <>
          <p className="screen-link-section__hint">{t('screenLink.hint', { label })}</p>
          <ul className="screen-link-section__list">
            {screens.map((s) => (
              <li key={s.key}>
                <button type="button" onClick={() => link(label, s.name!)}>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
