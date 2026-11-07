import { brand } from '../brand/brand.config';
import { brandAsset } from '../brand/brandAsset';
import { useTheme } from '../theme/themeContext';

/** Full logo from 640 px up, symbol only below (visibility handled in CSS). */
export function BrandMark() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="brand-mark">
      <img
        className="brand-mark__logo"
        src={brandAsset(brand.logo[resolvedTheme])}
        alt={brand.productName}
        width={79}
        height={48}
      />
      <img
        className="brand-mark__symbol"
        src={brandAsset(brand.symbol)}
        alt={brand.productName}
        width={44}
        height={36}
      />
    </div>
  );
}
