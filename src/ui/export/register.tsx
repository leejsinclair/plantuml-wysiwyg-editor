// Registers the export and copy commands in the toolbar (T173; FR-014, contracts/ui.md §3). They follow the
// toolbar's Import and Download controls. The application binds its render queue with `bindExportRenders`.
import { slots, type SlotProps } from '../app/slots.ts';
import { ExportCommands } from './ExportCommands.tsx';

export { bindExportRenders } from './ExportCommands.tsx';

function ExportToolbarItem({ ctx }: SlotProps) {
  return <ExportCommands ctx={ctx} />;
}

slots.toolbar.register({ id: 'export', order: 50, Component: ExportToolbarItem });
