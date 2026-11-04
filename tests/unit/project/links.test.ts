import { describe, expect, it } from 'vitest';
import { linkStatus, linksTo, retargetEdits } from '../../../src/core/project/links.ts';
import { parseActivity } from '../../../src/core/activity/parser.ts';
import { applyEdits } from '../../../src/core/source/edits.ts';

const flowText = [
  '@startuml Screen-flow',
  'start',
  ':[[#Login Sign in]];',
  'if (ok?) then (yes)',
  '  :[[#Home Go home]];',
  'else (no)',
  '  repeat',
  '    :[[#Login Try again]];',
  '  repeat while (failed?)',
  'endif',
  ':[[#login Lower case]];',
  ':Plain step;',
  'stop',
  '@enduml',
  '',
].join('\n');
const flow = parseActivity(flowText).model!;

describe('links', () => {
  it('finds every step linking to a name, inside branches and loops, matching exactly after NFC', () => {
    expect(linksTo(flow, 'Login').map((s) => s.label.text)).toEqual(['Sign in', 'Try again']);
    expect(linksTo(flow, 'Home')).toHaveLength(1);
    expect(linksTo(flow, 'Nowhere')).toEqual([]);
    const decomposed = parseActivity('@startuml\nstart\n:[[#Café x]];\nstop\n@enduml\n').model!;
    expect(linksTo(decomposed, 'Café')).toHaveLength(1);
  });

  it('retargets every exact link on rename and leaves other text unchanged (FR-011/AC11)', () => {
    const prefix = '@startsalt Login\n{\n}\n@endsalt\n';
    const source = prefix + flowText;
    const edits = retargetEdits(flow, prefix.length, 'Login', 'Sign-in');
    expect(edits).toHaveLength(2);
    expect(applyEdits(source, edits)).toBe(source.replace(':[[#Login Sign in]]', ':[[#Sign-in Sign in]]').replace(':[[#Login Try again]]', ':[[#Sign-in Try again]]'));
  });

  it('derives link status (data-model §5.3 Link, EC-11)', () => {
    const screens = ['Login', 'Home', 'Home', 'Café', 'Report', 'REPORT'];
    expect(linkStatus('Login', screens)).toEqual({ status: 'valid', screen: 'Login' });
    expect(linkStatus('Café', screens)).toEqual({ status: 'valid', screen: 'Café' });
    expect(linkStatus('Missing', screens)).toEqual({ status: 'broken' });
    expect(linkStatus('login', screens)).toEqual({ status: 'brokenCaseOnly', suggestion: 'Login' });
    expect(linkStatus('Home', screens)).toEqual({ status: 'ambiguous' });
    expect(linkStatus('report', screens)).toEqual({ status: 'ambiguous' });
    expect(linkStatus('Report', screens)).toEqual({ status: 'valid', screen: 'Report' });
    expect(linkStatus('x', [null, 'Login'])).toEqual({ status: 'broken' });
  });
});
