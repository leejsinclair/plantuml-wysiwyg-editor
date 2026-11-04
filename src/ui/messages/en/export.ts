// Export and copy strings (T169; FR-014/AC2–AC5, contracts/ui.md §11). Explanations for refused image
// export name the block and say that downloading and copying the source still work. None of these use the
// words the autosave status uses ("saved", "failed"), so they never read as a save state.
import type { MessagePart } from '../en.ts';

const exportPart = {
  'export.group': 'Export and copy',
  'export.svg': 'Export SVG',
  'export.png': 'Export PNG',
  'export.copySource': 'Copy source',
  'export.copyProjectSource': 'Copy project source',
  'export.copied': 'Source of {block} copied to the clipboard.',
  'export.projectCopied': 'Project source copied to the clipboard.',
  'export.copyFailed':
    'Could not copy: the browser did not allow access to the clipboard. You can still download the project.',
  'export.pngProblem': 'Could not draw the PNG image of {block}. Export SVG still works.',
  'export.refused.invalid':
    '{block} cannot be exported as an image because its source has a problem. Fix it in the source view first. You can still download or copy the source.',
  'export.refused.olderFormat':
    '{block} cannot be exported as an image because it is in the older format. Convert it to the current format first. You can still download or copy the source.',
  'export.refused.include':
    '{block} cannot be exported as an image because it depends on !include or another file, which the editor never loads. You can still download or copy the source.',
  'export.refused.renderProblem':
    '{block} cannot be exported as an image because PlantUML could not draw it. See the preview for the reason. You can still download or copy the source.',
  'export.refused.notRendered':
    '{block} has not been rendered yet. Wait until the preview shows the current image, then export. You can still download or copy the source.',
} as const satisfies MessagePart;

export default exportPart;
