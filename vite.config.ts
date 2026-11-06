import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { buildPrePaintThemeScript } from './src/theme/themeContract.ts'

// Applies the stored theme before first paint. The script is generated from the
// same contract the ThemeProvider uses (storage key, valid values, fallback).
function themePrePaint(): Plugin {
  return {
    name: 'medflow-theme-pre-paint',
    transformIndexHtml: () => [
      { tag: 'script', children: buildPrePaintThemeScript(), injectTo: 'head-prepend' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), themePrePaint()],
})
