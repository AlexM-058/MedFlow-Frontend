import { ArchiveError, cleanName, detectType, extractRar, isRarFile } from './archive.ts';

const failures: string[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else failures.push(name);
}

// Node's fs, loaded dynamically (the app's tsconfig has no Node types): only this test reads the wasm from disk.
const { readFileSync } = await import('node:' + 'fs') as { readFileSync(path: URL): Uint8Array };
const wasm = readFileSync(new URL('../../../node_modules/node-unrar-js/esm/js/unrar.wasm', import.meta.url));
const wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer;

// ---------- a tiny RAR 4 writer (method "store"), enough to build real archives, including hostile ones ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const concat = (parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
const u32 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
function block(body: Uint8Array): Uint8Array { // body = everything after the 2-byte header CRC
  return concat([u16(crc32(body) & 0xffff), body]);
}
interface Entry { name: string; data: Uint8Array; directory?: boolean; encrypted?: boolean }
function buildRar(entries: Entry[], mainFlags = 0): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])];
  parts.push(block(concat([new Uint8Array([0x73]), u16(mainFlags), u16(13), u16(0), u32(0)])));
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const flags = 0x8000 | (entry.directory ? 0xe0 : 0) | (entry.encrypted ? 0x04 : 0);
    const data = entry.directory ? new Uint8Array(0) : entry.data;
    parts.push(block(concat([
      new Uint8Array([0x74]), u16(flags), u16(32 + name.length), u32(data.length), u32(data.length),
      new Uint8Array([3]), u32(crc32(data)), u32(0x5a8e0000), new Uint8Array([20, 0x30]), u16(name.length), u32(entry.directory ? 0x10 : 0x20), name,
    ])), data);
  }
  parts.push(new Uint8Array([0xc4, 0x3d, 0x7b, 0x00, 0x40, 0x07, 0x00]));
  return concat(parts);
}
const toBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 50 }, (_, i) => (i + n) & 0xff)]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const pdf = () => new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const text = () => new TextEncoder().encode('Acesta nu este un document medical acceptat.');

async function main() {
  // Small helpers.
  check('detectType: jpeg, png, pdf, other', detectType(jpeg(1)) === 'image/jpeg' && detectType(png()) === 'image/png' && detectType(pdf()) === 'application/pdf' && detectType(text()) === null);
  check('isRarFile by extension and type', isRarFile({ name: 'Dosar.RAR' }) && isRarFile({ name: 'x', type: 'application/vnd.rar' }) && !isRarFile({ name: 'a.zip' }));
  check('cleanName drops path tricks', cleanName('../../etc/passwd') === 'etc/passwd' && cleanName('..\\..\\a.png') === 'a.png' && cleanName('/abs/a.png') === 'abs/a.png' && cleanName('..') === 'fisier');

  // A real archive: three documents in the order of their names, with the type from their bytes.
  const good = await extractRar(toBuffer(buildRar([
    { name: 'foaia10.jpg', data: jpeg(10) }, { name: 'foaia2.png', data: png() }, { name: 'analize/foaia1.pdf', data: pdf() },
  ])), wasmBinary);
  check('three documents extracted', good.files.length === 3 && good.skipped.length === 0);
  check('natural order by name', good.files.map((file) => file.name).join() === 'analize/foaia1.pdf,foaia2.png,foaia10.jpg');
  check('types come from the bytes', good.files.map((file) => file.type).join() === 'application/pdf,image/png,image/jpeg');
  check('content is intact', (await good.files[2]!.arrayBuffer()).byteLength === jpeg(10).length);

  // What is not a usable document is reported, never sent.
  const mixed = await extractRar(toBuffer(buildRar([
    { name: 'dir/', data: new Uint8Array(0), directory: true },
    { name: 'notite.txt', data: text() },
    { name: 'fals.jpg', data: text() }, // named like a photo, but not one
    { name: '__MACOSX/._a.png', data: png() },
    { name: 'Thumbs.db', data: text() },
    { name: 'gol.png', data: new Uint8Array(0) },
    { name: 'secret.png', data: png(), encrypted: true },
    { name: 'bun.png', data: png() },
  ])), wasmBinary);
  check('only the real document is kept', mixed.files.length === 1 && mixed.files[0]?.name === 'bun.png');
  const reasons = Object.fromEntries(mixed.skipped.map((entry) => [entry.name, entry.reason]));
  check('a fake photo is refused by its content', /nu este o imagine/.test(reasons['fals.jpg'] ?? ''));
  check('a text file is refused', /nu este o imagine/.test(reasons['notite.txt'] ?? ''));
  check('an empty file is refused', /gol/.test(reasons['gol.png'] ?? ''));
  check('an encrypted entry is refused with a reason', /parolă/.test(reasons['secret.png'] ?? ''));
  check('directories and system files are ignored silently', !('dir' in reasons) && !Object.keys(reasons).some((name) => /MACOSX|Thumbs|\._/.test(name)));

  // Hostile names: the dangerous entry is refused with a reason, the others are still read. Names are display text only.
  const traversal = await extractRar(toBuffer(buildRar([{ name: '../../../Windows/evil.png', data: png() }, { name: 'C:/evil2.png', data: png() }, { name: '..\\evil3.png', data: png() }, { name: '\\share\\evil4.png', data: png() }, { name: 'ok/bun.png', data: png() }])), wasmBinary);
  check('unsafe paths are refused, the safe file is read', traversal.files.length === 1 && traversal.files[0]?.name === 'ok/bun.png' && traversal.skipped.length === 4 && traversal.skipped.every((entry) => /nesigur/.test(entry.reason)));

  // Limits.
  const many = await extractRar(toBuffer(buildRar(Array.from({ length: 45 }, (_, i) => ({ name: `f${String(i).padStart(2, '0')}.png`, data: png() })))), wasmBinary);
  check('at most 40 entries are used', many.files.length === 40 && many.skipped.length === 5 && /Prea multe/.test(many.skipped[0]?.reason ?? ''));
  const big = await extractRar(toBuffer(buildRar([{ name: 'mare.png', data: new Uint8Array(10 * 1024 * 1024 + 1).fill(7) }, { name: 'mic.png', data: png() }])), wasmBinary);
  check('a file over 10 MB is skipped and the next one still read', big.files.length === 1 && big.files[0]?.name === 'mic.png' && /10 MB/.test(big.skipped[0]?.reason ?? ''));
  const total = await extractRar(toBuffer(buildRar([{ name: 'a.png', data: png() }, { name: 'b.png', data: png() }, { name: 'c.png', data: png() }])), wasmBinary,
    { maxArchiveBytes: 1024 * 1024, maxEntries: 40, maxFileBytes: 1024 * 1024, maxTotalBytes: 40 });
  check('the total declared size is capped', total.files.length === 2 && /prea multe date/.test(total.skipped[0]?.reason ?? ''));
  let tooBig = '';
  try { await extractRar(toBuffer(buildRar([{ name: 'a.png', data: png() }])), wasmBinary, { maxArchiveBytes: 50, maxEntries: 40, maxFileBytes: 1024, maxTotalBytes: 1024 }); } catch (error) { tooBig = error instanceof ArchiveError ? error.message : 'wrong error'; }
  check('an archive over the size limit is refused before it is opened', /depășește/.test(tooBig));

  // Not usable as a whole.
  const refuse = async (bytes: Uint8Array) => { try { await extractRar(toBuffer(bytes), wasmBinary); return 'accepted'; } catch (error) { return error instanceof ArchiveError ? error.message : 'wrong error'; } };
  check('random bytes are not an archive', /deteriorată|valid/.test(await refuse(new Uint8Array(200).fill(9))));
  check('a ZIP renamed .rar is not an archive', /deteriorată|valid/.test(await refuse(new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(60).fill(0)]))));
  check('an empty file is refused', /goală/.test(await refuse(new Uint8Array(0))));
  check('a truncated archive gives a clear message, not a crash', /deteriorată|valid|nu conține/.test(await refuse(buildRar([{ name: 'a.png', data: png() }]).slice(0, 40))));
  check('an archive with only folders says it has no documents', /nu conține/.test(await refuse(buildRar([{ name: 'dir/', data: new Uint8Array(0), directory: true }]))));
  check('a multi-part archive is refused', /mai multe părți|deteriorată|valid/.test(await refuse(buildRar([{ name: 'a.png', data: png() }], 0x0001))));

  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) throw new Error(`Failed: ${failures.join('; ')}`);
}

await main();
