import catalog from './countries.json';

const FRIENDLY = {
  'Bolivia, Plurinational State of': 'Bolivia',
  'Brunei Darussalam': 'Brunei',
  'Cabo Verde': 'Cape Verde',
  'Congo, Democratic Republic of the': 'DR Congo',
  'Falkland Islands (Malvinas)': 'Falkland Islands',
  'Iran, Islamic Republic of': 'Iran',
  "Korea, Democratic People's Republic of": 'North Korea',
  'Korea, Republic of': 'South Korea',
  "Lao People's Democratic Republic": 'Laos',
  'Micronesia, Federated States of': 'Micronesia',
  'Moldova, Republic of': 'Moldova',
  'Netherlands, Kingdom of the': 'Netherlands',
  'Palestine, State of': 'Palestine',
  'Russian Federation': 'Russia',
  'Syrian Arab Republic': 'Syria',
  'Taiwan, Province of China': 'Taiwan',
  'Tanzania, United Republic of': 'Tanzania',
  'Türkiye': 'Turkey',
  'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
  'United States of America': 'United States',
  'Venezuela, Bolivarian Republic of': 'Venezuela',
  'Viet Nam': 'Vietnam',
  'Virgin Islands (British)': 'British Virgin Islands',
  'Virgin Islands (U.S.)': 'U.S. Virgin Islands',
};

const ALIASES = {
  US: ['usa', 'america'],
  GB: ['uk', 'britain'],
  AE: ['uae'],
  KR: ['korea'],
  KP: ['dprk'],
  RU: ['russia'],
  VN: ['vietnam'],
  TR: ['turkey'],
};

export const COUNTRIES = catalog
  .map((item) => ({ name: FRIENDLY[item.name] || item.name, code: item.code }))
  .sort((a, b) => a.name.localeCompare(b.name));

const FEATURED = ['BD', 'IN', 'PK', 'NP', 'LK', 'US', 'GB', 'CN', 'MM', 'TH'];

export function flagEmoji(code) {
  const iso = (code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return '';
  return [...iso].map((char) => String.fromCodePoint(0x1F1E6 + char.charCodeAt(0) - 65)).join('');
}

export function searchCountries(query) {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRIES.filter((item) => FEATURED.includes(item.code));
  return COUNTRIES.filter((item) => {
    if (item.name.toLowerCase().includes(q) || item.code.toLowerCase().startsWith(q)) return true;
    return (ALIASES[item.code] || []).some((alias) => alias.startsWith(q));
  }).slice(0, 12);
}

export function matchCountry(name) {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  return COUNTRIES.find((item) => item.name.toLowerCase() === q || item.code.toLowerCase() === q) || null;
}
