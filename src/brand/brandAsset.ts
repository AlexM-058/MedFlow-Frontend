import { brand } from './brand.config';

/** Resolves a /public brand asset against Vite's BASE_URL (also works in the Capacitor build). */
export function brandAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

/** File-name-safe form of the product name, e.g. for downloads. */
export const brandSlug = brand.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

/** Standard support sentence used by error messages. */
export const supportContact = `Please contact ${brand.productName} support at ${brand.support.email}.`;
