import { brand } from '../brand/brand.config';
import { useTheme } from '../theme/themeContext';

/** Full logo from 640 px up, symbol only below (visibility handled in CSS). */
export function BrandMark() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="brand-mark">
      <img
        className="brand-mark__logo"
        src={brand.logo[resolvedTheme]}
        alt={brand.productName}
        width={168}
        height={40}
      />
      <img
        className="brand-mark__symbol"
        src={brand.symbol}
        alt={brand.productName}
        width={36}
        height={36}
      />
    </div>
  );
}
