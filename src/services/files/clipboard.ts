// Copying text to the clipboard (T171; FR-014/AC4, R-9). Uses `navigator.clipboard.writeText` and never
// throws: the result says whether the copy happened, so the interface can confirm it or explain why not.

/** The part of the Clipboard API this needs. */
export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

export type CopyResult =
  | { readonly ok: true }
  /** `unavailable`: no clipboard (insecure context); `denied`: the browser refused; `failed`: anything else. */
  | { readonly ok: false; readonly reason: 'unavailable' | 'denied' | 'failed' };

function browserClipboard(): ClipboardWriter | null {
  return typeof navigator !== 'undefined' && navigator.clipboard ? navigator.clipboard : null;
}

/** Writes `text` to the clipboard. `clipboard` defaults to the browser's; `null` means there is none. */
export async function copyText(text: string, clipboard: ClipboardWriter | null = browserClipboard()): Promise<CopyResult> {
  if (!clipboard) return { ok: false, reason: 'unavailable' };
  try {
    await clipboard.writeText(text);
    return { ok: true };
  } catch (error) {
    const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
    return { ok: false, reason: denied ? 'denied' : 'failed' };
  }
}
