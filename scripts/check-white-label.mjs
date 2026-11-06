// White-label guard (Figma "White-label foundations" rules 01-03).
// Fails when code bypasses the brand config or the design tokens:
//   1. raw colors (#hex, rgb(), hsl()) outside src/styles/tokens.css and src/brand/
//   2. the product name written as text instead of brand.productName
//   3. brand asset paths outside src/brand/
// A line may opt out with the comment marker `white-label: allow` and a reason
// (for example the QR code, which must stay black on white for scanners).
// Run: node scripts/check-white-label.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src');
const PRODUCT = 'MedFlow';

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(css|ts|tsx)$/.test(entry.name)) yield path;
  }
}

const COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\(/;
const problems = [];

for (const path of files(src)) {
  const rel = relative(root, path).split(sep).join('/');
  const inBrand = rel.startsWith('src/brand/');
  const isTokens = rel === 'src/styles/tokens.css';
  const isTest = /\.test\.tsx?$/.test(rel);
  const isCode = /\.tsx?$/.test(rel);
  readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, index) => {
    if (line.includes('white-label: allow')) return;
    const trimmed = line.trim();
    const comment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
    const where = `${rel}:${index + 1}`;
    if (!inBrand && !isTokens && !comment && COLOR.test(line.replace(/['"`]#\/[^'"`]*['"`]/g, ''))) {
      problems.push(`${where}  raw color; use a token from src/styles/tokens.css`);
    }
    if (isCode && !inBrand && !isTest && !comment && line.includes(PRODUCT)) {
      problems.push(`${where}  product name in text; use brand.productName / brand.assistantName`);
    }
    if (isCode && !inBrand && !comment && /['"`/]brand\/[^'"`]*\.(svg|png|jpe?g|webp|ico)/.test(line)) {
      problems.push(`${where}  brand asset path; add it to src/brand/brand.config.ts`);
    }
  });
}

if (problems.length) {
  console.error(`White-label check failed (${problems.length}):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('White-label check passed: colors, product name and brand assets come from the brand config and tokens.');
}
