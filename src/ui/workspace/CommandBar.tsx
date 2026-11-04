// The structural command bar (FR-009/AC14, contracts/ui.md §7): every structural command for the selection as a
// visible pointer-operable control showing its keyboard shortcut, so no operation needs dragging or a shortcut.
//
// Commands come from the open block's editor (`blockEditors[kind].commands`) and the `commands` slot, merged by
// `order` (editor commands first on a tie). Hidden commands are left out; disabled ones are shown but cannot run.
// `commandForKey` lets a region run the same commands from the keyboard.
import type { SlotContext, Slots, Command } from '../app/slots.ts';
import { slots as appSlots, useSlot } from '../app/slots.ts';
import { StoreContext } from '../app/store.ts';
import { useContext } from 'react';
import { chordsFor, chordId, formatChord, platformFrom, type KeyChord, type KeyEventLike, type Platform } from '../keys.ts';
import { t } from '../messages/en.ts';
import { Button } from '@mantine/core';

const defaultPlatform = platformFrom(typeof navigator === 'undefined' ? '' : navigator.userAgent);

/** The chords of a command's shortcut on a platform. */
export function shortcutChords(command: Command, platform: Platform): KeyChord[] {
  const s = command.shortcut;
  if (s === undefined) return [];
  if (typeof s === 'string') return chordsFor(s, platform);
  return s.filter((c) => !c.only || c.only.includes(platform));
}

const ARIA_KEYS: Record<string, string> = { ' ': 'Space', Esc: 'Escape' };

/** A chord in the `aria-keyshortcuts` form: `Control+Shift+Z`, `Meta+Enter`, `Alt+Shift+ArrowUp`. */
function ariaChord(c: KeyChord, platform: Platform): string {
  const mac = platform === 'mac';
  const parts: string[] = [];
  if (c.ctrl || (!mac && c.mod)) parts.push('Control');
  if (mac && c.mod) parts.push('Meta');
  if (c.alt) parts.push('Alt');
  if (c.shift) parts.push('Shift');
  parts.push(ARIA_KEYS[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key));
  return parts.join('+');
}

/** The open block's editor commands and the slot's commands, visible ones only, by `order`. */
export function collectCommands(registry: Slots, ctx: SlotContext): Command[] {
  const kind = ctx.block?.kind;
  const editor = kind && kind !== 'other' ? registry.blockEditors.get(kind) : null;
  const all = [...(editor?.commands ?? []), ...registry.commands.list()];
  return all
    .map((command, seq) => ({ command, seq }))
    .filter(({ command }) => command.isVisible?.(ctx) ?? true)
    .sort((a, b) => (a.command.order ?? 0) - (b.command.order ?? 0) || a.seq - b.seq)
    .map(({ command }) => command);
}

/** The visible, enabled command whose shortcut a key event matches, or `null`. */
export function commandForKey(event: KeyEventLike, commands: readonly Command[], ctx: SlotContext, platform: Platform): Command | null {
  if (event.metaKey && platform !== 'mac') return null;
  const pressed = chordId(
    { key: event.key, mod: platform === 'mac' ? event.metaKey : event.ctrlKey, alt: event.altKey, shift: event.shiftKey },
    platform,
  );
  for (const command of commands) {
    if (!(command.isVisible?.(ctx) ?? true) || !(command.isEnabled?.(ctx) ?? true)) continue;
    if (shortcutChords(command, platform).some((c) => chordId(c, platform) === pressed)) return command;
  }
  return null;
}

/** Insert commands are filled, wrap commands light, deletes light red, everything else plain (FR-025). */
function commandVariant(id: string): 'filled' | 'light' | 'default' {
  if (/insert/i.test(id)) return 'filled';
  if (/wrap|delete/i.test(id)) return 'light';
  return 'default';
}

export interface CommandBarProps {
  readonly ctx: SlotContext;
  /** The slot registry; defaults to the application's. */
  readonly slots?: Slots;
  readonly platform?: Platform;
}

export function CommandBar({ ctx, slots = appSlots, platform = defaultPlatform }: CommandBarProps) {
  // Re-render when either source of commands changes.
  useSlot(slots.blockEditors);
  useSlot(slots.commands);
  const store = useContext(StoreContext);
  const commands = collectCommands(slots, ctx);
  return (
    <div role="group" aria-label={t('commandBar.label')} className="command-bar">
      {commands.map((command) => {
        const chords = shortcutChords(command, platform);
        const enabled = command.isEnabled?.(ctx) ?? true;
        return (
          <Button
            key={command.id}
            variant={commandVariant(command.id)}
            color={/delete/i.test(command.id) ? 'red' : undefined}
            size="compact-sm"
            data-command={command.id}
            disabled={!enabled}
            aria-keyshortcuts={chords.length > 0 ? chords.map((c) => ariaChord(c, platform)).join(' ') : undefined}
            onClick={() => command.run(ctx, store)}
          >
            <span>{t(command.labelKey, command.labelParams)}</span>
            {chords.length > 0 ? (
              <span className="command-bar__shortcut" aria-hidden="true">
                {chords.map((c) => (
                  <kbd key={chordId(c, platform)}>{formatChord(c, platform)}</kbd>
                ))}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
