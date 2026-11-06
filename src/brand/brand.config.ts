// Client branding: the ONLY place to change product name, assistant name, logos,
// favicon, brand colors, support contact and legal links (white-label rule 02).
// Plain data with no runtime imports, so vite.config.ts can also read it to set
// the HTML title and favicon at build time. Asset paths are relative to /public;
// resolve them with brandAsset() from ./brandAsset.ts.
//
// Placeholders currently in use (replace with the client's artwork):
//   public/brand/medflow-logo-placeholder-light.svg  -> full logo for Light theme
//   public/brand/medflow-logo-placeholder-dark.svg   -> full logo for Dark theme
//   public/brand/medflow-symbol-placeholder.svg      -> symbol / favicon (original: Medflow_No_Logo.svg)

export interface BrandConfig {
  /** Shown in titles, texts and alt attributes. */
  productName: string;
  /** Name of the patient-facing assistant in the chat. */
  assistantName: string;
  /** Full logo (symbol + wordmark), shown from 640 px up. One file per theme; transparent background. */
  logo: { light: string; dark: string };
  /** Symbol-only mark, shown below 640 px. Must be legible on both themes. */
  symbol: string;
  /** Browser tab icon (SVG or PNG). */
  favicon: string;
  colors: {
    /** Brand primary: primary buttons, patient bubbles. Change together with onPrimary. */
    primary: string;
    /** Text and icons on top of `primary`, used in both themes. Must keep 4.5:1 contrast. */
    onPrimary: string;
  };
  /** Support contact shown in error and help messages. */
  support: { email: string };
  /** Optional legal links; a link is shown only when its URL is set. */
  legal: { privacyUrl?: string; termsUrl?: string };
}

export const brand: BrandConfig = {
  productName: 'MedFlow',
  assistantName: 'Asistentul MedFlow',
  logo: {
    light: 'brand/medflow-logo-placeholder-light.svg',
    dark: 'brand/medflow-logo-placeholder-dark.svg',
  },
  symbol: 'brand/medflow-symbol-placeholder.svg',
  favicon: 'brand/medflow-symbol-placeholder.svg',
  colors: {
    primary: '#90AD9B',
    onPrimary: '#172033',
  },
  // Synthetic placeholder: set the client's real support address before release.
  support: { email: 'support@medflow.example' },
  legal: {},
};
