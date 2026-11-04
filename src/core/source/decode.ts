// UTF-8 decoding and encoding of project files (contracts/project-file.md section 1, FR-006/AC13, FR-020/AC2).
// Decoding is strict, so decode → encode always gives back the same bytes.

export type DecodeResult =
  | { ok: true; text: string; bom: boolean }
  | { ok: false; reason: 'not-utf8' | 'binary' };

const BOM = [0xef, 0xbb, 0xbf] as const;

function hasBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2];
}

/** Decodes a file's bytes. A NUL byte means a binary file; anything that is not valid UTF-8 is refused. */
export function decode(bytes: Uint8Array): DecodeResult {
  if (bytes.includes(0)) return { ok: false, reason: 'binary' };
  const bom = hasBom(bytes);
  // ignoreBOM keeps any further U+FEFF as text: only the first one is the file's byte-order mark.
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  try {
    return { ok: true, text: decoder.decode(bom ? bytes.subarray(3) : bytes), bom };
  } catch {
    return { ok: false, reason: 'not-utf8' };
  }
}

/** Encodes text as UTF-8, with a byte-order mark first when `bom` is true. */
export function encode(text: string, bom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set(BOM, 0);
  out.set(body, 3);
  return out;
}
