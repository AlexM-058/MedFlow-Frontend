// Client branding: the only place to change product name, logos and brand colors.
// Asset paths are relative to /public and resolved against Vite's BASE_URL so they
// also work inside the Capacitor build.
//
// Placeholders currently in use (replace with the original assets when available):
//   public/brand/medflow-logo-placeholder-light.svg  -> full logo for Light theme
//   public/brand/medflow-logo-placeholder-dark.svg   -> full logo for Dark theme
//   public/brand/medflow-symbol-placeholder.svg      -> expected original: public/brand/Medflow_No_Logo.svg

export interface BrandConfig {
  productName: string;
  /** Full logo (symbol + wordmark), shown from 640 px up. One file per theme. */
  logo: { light: string; dark: string };
  /** Symbol-only mark, shown below 640 px. Must be legible on both themes. */
  symbol: string;
  colors: {
    /** Brand primary: Send button, patient bubbles. */
    primary: string;
    /** Text and icons on top of `primary`, used in both themes. */
    onPrimary: string;
  };
}

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export const brand: BrandConfig = {
  productName: 'MedFlow',
  logo: {
    light: asset('brand/medflow-logo-placeholder-light.svg'),
    dark: asset('brand/medflow-logo-placeholder-dark.svg'),
  },
  symbol: asset('brand/medflow-symbol-placeholder.svg'),
  colors: {
    primary: '#90AD9B',
    onPrimary: '#172033',
  },
};
