# Document scanner (local only)

Independent UI to capture printed medical documents and return a typed `ScannedDocument`.

**Does not** upload to Supabase, call MedGemma/Ollama, or hit Backend APIs.

## Capture

HTML file input with `capture="environment"` (camera) or without it (files / gallery).
Works in the browser and in the Capacitor Android WebView. Dismissing the picker
resolves to `null` (`cancel` event), so the UI returns to idle.

The object URL of a confirmed document stays valid after **Use Document**; the
consumer owns it and should call `revokeScannedDocumentUri` once it is uploaded
or discarded.

## Demo

Open `#/demo/scan` or use **Scan document** in the header.
