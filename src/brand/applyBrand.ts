import type { BrandConfig } from './brand.config';

/** Writes brand colors onto :root so CSS uses the configured client values. */
export function applyBrand(config: BrandConfig, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--brand-primary', config.colors.primary);
  root.style.setProperty('--brand-on-primary', config.colors.onPrimary);
  document.title = config.productName;
}
