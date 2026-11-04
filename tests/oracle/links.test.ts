// T158: an escaped linked label renders and keeps its link in the command-line oracle (VO-041).
import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../src/core/source/edits.ts';
import { flowDoc, walk } from '../../src/core/activity/destinations.ts';
import { setLink } from '../../src/core/activity/ops/links.ts';
import { parseActivity } from '../../src/core/activity/parser.ts';
import type { Step } from '../../src/core/activity/model.ts';
import { renderBlocks, svgHasText } from './runner.ts';

const LABELS = ['Enter credentials', 'Pick [x] or ]] later', 'a | b', 'Café ~ 5 * 3'];

function linked(label: string): string {
  const text = `@startuml Screen-flow\nstart\n:${label};\nstop\n@enduml\n`;
  const path = walk(parseActivity(text).model!).find((r) => r.element.kind === 'step' && (r.element as Step).label.text === label)!.path;
  const op = setLink(flowDoc(text, 0)!, path, 'Sign-in');
  if (!op.ok) throw new Error(`refused: ${op.messageKey}`);
  return applyEdits(text, op.edits);
}

describe('linked step labels in the oracle render (VO-041)', () => {
  it('renders each escaped linked label as text with an anchor to the screen', async () => {
    const texts = LABELS.map(linked);
    const results = await renderBlocks(texts);
    results.forEach((r, i) => {
      expect(r.ok, `${texts[i]}\n${r.message}`).toBe(true);
      expect(svgHasText(r.svg, LABELS[i]!), texts[i]).toBe(true);
      expect(r.svg, texts[i]).toMatch(/href="#Sign-in"/);
    });
  });
});
