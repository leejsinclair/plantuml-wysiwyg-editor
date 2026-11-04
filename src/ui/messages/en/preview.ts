// Preview pane strings (T039; FR-005/AC1–AC6, contracts/ui.md §9). Rendering problems are worded and
// labelled apart from source problems, which live in shared.ts and blocks.ts.
import type { MessagePart } from '../en.ts';

const preview = {
  'preview.label': 'Rendered output',
  'preview.readOnly': 'Read-only',
  'preview.diagram': 'Rendered image of {block}',
  'preview.nothingRendered': 'Nothing has been rendered yet.',
  'preview.outOfDate': 'Out of date',
  'preview.outOfDateDetail': 'This is the last successful render. It does not show your latest changes yet.',
  'preview.notCheckedByEditor':
    'Not checked by the editor: this block has a source problem, so the render may not match the source.',
  'preview.renderingProblem': 'Rendering problem',
  'preview.renderingProblemExplanation':
    'PlantUML could not draw {block}. Your wireframe and its source are unchanged. PlantUML reported:',
} as const satisfies MessagePart;

export default preview;
