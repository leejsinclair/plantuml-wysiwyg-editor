// Registers the screen commands (T131; US5): "Add screen" in the project panel header, the per-block commands
// beside each block, and the open screen's name in the properties panel when nothing is selected.
import { slots } from '../app/slots.ts';
import { AddScreenCommand, BlockCommands, ScreenNameSection } from './screen-commands.tsx';

slots.projectPanel.register({ id: 'screens.add', placement: 'header', order: 0, Component: AddScreenCommand });
slots.projectPanel.register({ id: 'screens.commands', placement: 'block', order: 0, Component: BlockCommands });
slots.propertySections.register({
  id: 'screens.name',
  order: 0,
  appliesTo: (ctx) => ctx.block?.kind === 'screen' && ctx.selection === null,
  Component: ScreenNameSection,
});
