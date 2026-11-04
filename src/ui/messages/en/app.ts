// App shell strings (T047; contracts/ui.md §1). The unsupported-browser message and the unknown-project notice
// are shared (shared.ts).
import type { MessagePart } from '../en.ts';

const app = {
  'app.title': 'PlantUML Wireframe Editor',
  'app.openingProject': 'Opening project…',
} as const satisfies MessagePart;

export default app;
