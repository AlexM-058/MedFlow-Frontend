# Document scanner (local only)

Independent UI to capture printed medical documents and return a typed `ScannedDocument`.

**Does not** upload to Supabase, call MedGemma/Ollama, or hit Backend APIs.

## Capture preference

1. `expo-camera` → `CameraView.scanDocumentAsync` (native crop / perspective) when available
2. `expo-image-picker` camera with editing when available
3. HTML file / camera input (current Vite + Capacitor WebView path)

## Demo

Open `#/scan` or use **Scan document** in the header.
