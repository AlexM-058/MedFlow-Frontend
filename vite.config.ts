import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { buildPrePaintThemeScript } from './src/theme/themeContract.ts'
import { brand } from './src/brand/brand.config.ts'

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

// White-label: the HTML title and favicon come from brand.config.ts, so the first
// paint already shows the client's identity (applyBrand repeats it at runtime).
function brandDocument(): Plugin {
  let base = '/'
  const escape = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
  return {
    name: 'medflow-brand-document',
    configResolved(config) { base = config.base },
    transformIndexHtml: (html) => html
      .replace('%BRAND_PRODUCT_NAME%', escape(brand.productName))
      .replace('%BRAND_FAVICON%', escape(`${base}${brand.favicon}`))
      .replace('%BRAND_FAVICON_TYPE%', brand.favicon.endsWith('.svg') ? 'image/svg+xml' : 'image/png'),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), themePrePaint(), brandDocument()],
})
