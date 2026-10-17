import Flags from 'country-flag-icons/react/3x2';

export function countryCode({ code, flag }) {
  const iso = (code || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(iso) && Flags[iso]) return iso;
  const chars = [...(flag || '')];
  if (chars.length >= 2) {
    const a = chars[0].codePointAt(0);
    const b = chars[1].codePointAt(0);
    if (a >= 0x1F1E6 && a <= 0x1F1FF && b >= 0x1F1E6 && b <= 0x1F1FF) {
      const derived = String.fromCharCode(a - 0x1F1E6 + 65, b - 0x1F1E6 + 65);
      if (Flags[derived]) return derived;
    }
  }
  return '';
}

export function CountryFlag({ code, flag, title, className = '' }) {
  const iso = countryCode({ code, flag });
  const Icon = iso ? Flags[iso] : null;
  if (!Icon) return <span className={`country-flag-empty ${className}`} aria-hidden="true" />;
  return <Icon className={`country-flag ${className}`} title={title || iso} />;
}
