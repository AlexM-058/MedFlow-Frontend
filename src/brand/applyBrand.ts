import type { BrandConfig } from './brand.config';
import { brandAsset } from './brandAsset';

/** Writes brand colors onto :root and sets the title and favicon from the client config. */
export function applyBrand(config: BrandConfig, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--brand-primary', config.colors.primary);
  root.style.setProperty('--brand-on-primary', config.colors.onPrimary);
  document.title = config.productName;
  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.rel = 'icon';
    document.head.appendChild(icon);
  }
  icon.href = brandAsset(config.favicon);
  icon.type = config.favicon.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
}
