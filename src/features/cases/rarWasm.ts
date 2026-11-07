// Loads the unrar WebAssembly module (a static asset bundled by Vite). Kept apart from archive.ts, which stays free
// of bundler-specific imports so it can be tested in Node.
import wasmUrl from 'node-unrar-js/esm/js/unrar.wasm?url';

export async function loadRarWasm(): Promise<ArrayBuffer> {
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error('Modulul de dezarhivare nu a putut fi încărcat.');
  return response.arrayBuffer();
}
