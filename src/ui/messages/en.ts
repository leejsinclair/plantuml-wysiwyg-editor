// The English message catalogue (R-11, FR-016/AC8). Every interface string lives in a part file
// under ./en/; this module merges them eagerly and refuses a key defined twice. Look strings up
// with t(key, params). Diagram content passed as a parameter is inserted unchanged.
import type { MessageParams } from '../../core/types.ts';

/** A message whose wording depends on `params.count`, chosen with Intl.PluralRules. */
export type PluralMessage = { readonly other: string } & Readonly<Partial<Record<Intl.LDMLPluralRule, string>>>;
export type Message = string | PluralMessage;
export type MessagePart = Readonly<Record<string, Message>>;

/** Merge part files into one catalogue. Throws when two parts define the same key. */
export function mergeParts(parts: Readonly<Record<string, MessagePart>>): Record<string, Message> {
  const merged: Record<string, Message> = {};
  const ownerOf = new Map<string, string>();
  const files = Object.keys(parts).sort();
  for (const file of files) {
    for (const [key, message] of Object.entries(parts[file] ?? {})) {
      const owner = ownerOf.get(key);
      if (owner !== undefined) {
        throw new Error(`Message key "${key}" is defined in both ${owner} and ${file}`);
      }
      ownerOf.set(key, file);
      merged[key] = message;
    }
  }
  return merged;
}

const parts = import.meta.glob<MessagePart>('./en/*.ts', { eager: true, import: 'default' });

export const catalogue: Readonly<Record<string, Message>> = Object.freeze(mergeParts(parts));

const pluralRules = new Intl.PluralRules('en');

/** Substitute `{name}` placeholders in one pass; unknown placeholders stay as written. */
export function format(message: Message, params: MessageParams = {}): string {
  let template: string;
  if (typeof message === 'string') {
    template = message;
  } else {
    const count = params['count'];
    if (typeof count !== 'number') throw new Error('A plural message needs a numeric "count" parameter');
    template = message[pluralRules.select(count)] ?? message.other;
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

export function has(key: string): boolean {
  return Object.hasOwn(catalogue, key);
}

/** The English text for `key`. An unknown key throws in development and tests, so it is caught
 *  early; in production the key itself is shown rather than breaking the interface. */
export function t(key: string, params?: MessageParams): string {
  const message = has(key) ? catalogue[key] : undefined;
  if (message === undefined) {
    if (import.meta.env.DEV) throw new Error(`Unknown message key "${key}"`);
    return key;
  }
  return format(message, params);
}
