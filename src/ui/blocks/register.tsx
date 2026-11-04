// User Story 3 contributions (T114): the block status banner in `banners`, the per-block "Convert to current
// format" entry in `projectPanel`, and the one "Convert all" notice per import (FR-010/AC1–AC4, AC7, AC8).
import { slots, type SlotProps } from '../app/slots.ts';
import { useSession, useStore } from '../app/store.ts';
import { t } from '../messages/en.ts';
import { ConvertAllNotice } from './ConvertAllNotice.tsx';
import { convertBlock, StatusBanner } from './StatusBanner.tsx';

/** "Convert to current format" beside an older-format block in the project panel. */
function ConvertEntry({ blockKey }: SlotProps & { readonly blockKey?: string }) {
  const session = useSession();
  const store = useStore();
  const view = session.blocks.find((b) => b.key === blockKey);
  if (!view || view.status !== 'Older format') return null;
  return (
    <button type="button" onClick={() => convertBlock(store, view)}>
      {t('blocks.convert')}
    </button>
  );
}

slots.banners.register({ id: 'blocks.status', order: -100, Component: StatusBanner });
slots.banners.register({ id: 'blocks.convertAllNotice', order: 1000, Component: ConvertAllNotice });
slots.projectPanel.register({ id: 'blocks.convert', placement: 'block', order: 100, Component: ConvertEntry });
