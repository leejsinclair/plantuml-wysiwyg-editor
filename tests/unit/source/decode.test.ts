import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { decode, encode } from '../../../src/core/source/decode.ts';

const bytes = (...b: number[]) => new Uint8Array(b);
const utf8 = (s: string) => new TextEncoder().encode(s);
const BOM = [0xef, 0xbb, 0xbf];

function roundTrip(input: Uint8Array): Uint8Array {
  const r = decode(input);
  if (!r.ok) throw new Error(`decode failed: ${r.reason}`);
  return encode(r.text, r.bom);
}

describe('decode', () => {
  it('decodes plain UTF-8 without a byte-order mark', () => {
    expect(decode(utf8('@startsalt\n{\n}\n@endsalt\n'))).toEqual({ ok: true, text: '@startsalt\n{\n}\n@endsalt\n', bom: false });
  });

  it('detects and strips a byte-order mark', () => {
    expect(decode(bytes(...BOM, 0x61))).toEqual({ ok: true, text: 'a', bom: true });
  });

  it('keeps a second byte-order mark as text so the bytes round-trip', () => {
    const r = decode(bytes(...BOM, ...BOM, 0x61));
    expect(r).toEqual({ ok: true, text: '﻿a', bom: true });
  });

  it('decodes non-English text', () => {
    expect(decode(utf8('Anmeldung – Größe 名前 😀'))).toEqual({ ok: true, text: 'Anmeldung – Größe 名前 😀', bom: false });
  });

  it('decodes an empty file', () => {
    expect(decode(new Uint8Array())).toEqual({ ok: true, text: '', bom: false });
    expect(decode(bytes(...BOM))).toEqual({ ok: true, text: '', bom: true });
  });

  it('refuses invalid UTF-8 (FR-006/AC13)', () => {
    expect(decode(bytes(0x61, 0xff, 0x62))).toEqual({ ok: false, reason: 'not-utf8' });
    // Latin-1 "é" on its own
    expect(decode(bytes(0x63, 0x61, 0x66, 0xe9))).toEqual({ ok: false, reason: 'not-utf8' });
    // Truncated multi-byte sequence
    expect(decode(bytes(0xe2, 0x82))).toEqual({ ok: false, reason: 'not-utf8' });
    // Overlong encoding of "/"
    expect(decode(bytes(0xc0, 0xaf))).toEqual({ ok: false, reason: 'not-utf8' });
    // Encoded surrogate
    expect(decode(bytes(0xed, 0xa0, 0x80))).toEqual({ ok: false, reason: 'not-utf8' });
  });

  it('refuses UTF-16 with its byte-order mark', () => {
    const r = decode(bytes(0xff, 0xfe, 0x61, 0x00));
    expect(r.ok).toBe(false);
  });

  it('treats a NUL byte as binary (FR-006/AC13)', () => {
    expect(decode(bytes(0x61, 0x00, 0x62))).toEqual({ ok: false, reason: 'binary' });
    expect(decode(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00))).toEqual({ ok: false, reason: 'binary' });
    expect(decode(bytes(...BOM, 0x00))).toEqual({ ok: false, reason: 'binary' });
  });
});

describe('encode', () => {
  it('writes UTF-8 and a byte-order mark only when asked', () => {
    expect([...encode('a', false)]).toEqual([0x61]);
    expect([...encode('a', true)]).toEqual([...BOM, 0x61]);
    expect([...encode('', true)]).toEqual(BOM);
  });

  it('round-trips byte-identically (FR-020/AC2)', () => {
    const cases = [
      utf8('@startsalt A\r\n{\r\n}\r\n@endsalt\r\n'),
      utf8('no final newline'),
      utf8('mixed\r\nendings\nand\rcarriage returns'),
      bytes(...BOM, ...utf8("' comment\n@startsalt Größe\n{\n}\n@endsalt")),
      bytes(...BOM, ...BOM),
      utf8('\t trailing spaces   \n\n\n'),
      utf8('emoji 😀 and combining é'),
      new Uint8Array(),
    ];
    for (const input of cases) expect([...roundTrip(input)]).toEqual([...input]);
  });

  it('round-trips every corpus file byte-identically', () => {
    const root = resolve(import.meta.dirname, '../../corpus');
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.puml'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const input = new Uint8Array(readFileSync(resolve(root, f)));
      const decoded = decode(input);
      if (!decoded.ok) continue; // binary corpus files are skipped
      expect([...encode(decoded.text, decoded.bom)], f).toEqual([...input]);
    }
  });
});
