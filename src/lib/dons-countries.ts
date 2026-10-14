// Pays couverts par nyole pour le Mobile Money (voir https://nyole.com/pays)
// et longueur du numéro national (hors indicatif) pour chacun — sert à la
// fois à préremplir l'exemple affiché dans le champ téléphone de DonModal
// et à valider/normaliser le numéro côté serveur (/api/dons).
//
// `nsnLength` = nombre de chiffres du numéro national significatif (NSN),
// indicatif exclu. Vérifié pays par pays (Wikipédia, régulateurs
// nationaux, ITU) le 14/10/2026 — certains pays ont changé de format
// récemment (Côte d'Ivoire et Bénin en 2021, Gabon en 2024) : à ajuster si
// un pays modifie à nouveau son plan de numérotation.
export interface DonCountry {
  code: string;
  label: string;
  dialCode: string;
  nsnLength: number;
  flag: string;
}

export const DON_COUNTRIES: DonCountry[] = [
  { code: "bj", label: "Bénin", dialCode: "229", nsnLength: 10, flag: "🇧🇯" },
  { code: "ci", label: "Côte d'Ivoire", dialCode: "225", nsnLength: 10, flag: "🇨🇮" },
  { code: "sn", label: "Sénégal", dialCode: "221", nsnLength: 9, flag: "🇸🇳" },
  { code: "bf", label: "Burkina Faso", dialCode: "226", nsnLength: 8, flag: "🇧🇫" },
  { code: "ml", label: "Mali", dialCode: "223", nsnLength: 8, flag: "🇲🇱" },
  { code: "tg", label: "Togo", dialCode: "228", nsnLength: 8, flag: "🇹🇬" },
  { code: "cm", label: "Cameroun", dialCode: "237", nsnLength: 9, flag: "🇨🇲" },
  { code: "ga", label: "Gabon", dialCode: "241", nsnLength: 9, flag: "🇬🇦" },
  { code: "cg", label: "Congo", dialCode: "242", nsnLength: 9, flag: "🇨🇬" },
  { code: "cd", label: "RD Congo", dialCode: "243", nsnLength: 9, flag: "🇨🇩" },
  { code: "ng", label: "Nigeria", dialCode: "234", nsnLength: 10, flag: "🇳🇬" },
  { code: "gh", label: "Ghana", dialCode: "233", nsnLength: 9, flag: "🇬🇭" },
  { code: "ke", label: "Kenya", dialCode: "254", nsnLength: 9, flag: "🇰🇪" },
  { code: "tz", label: "Tanzanie", dialCode: "255", nsnLength: 9, flag: "🇹🇿" },
  { code: "ug", label: "Ouganda", dialCode: "256", nsnLength: 9, flag: "🇺🇬" },
  { code: "rw", label: "Rwanda", dialCode: "250", nsnLength: 9, flag: "🇷🇼" },
  { code: "zm", label: "Zambie", dialCode: "260", nsnLength: 9, flag: "🇿🇲" },
  { code: "mw", label: "Malawi", dialCode: "265", nsnLength: 9, flag: "🇲🇼" },
  { code: "mz", label: "Mozambique", dialCode: "258", nsnLength: 9, flag: "🇲🇿" },
  { code: "ls", label: "Lesotho", dialCode: "266", nsnLength: 8, flag: "🇱🇸" },
  { code: "sl", label: "Sierra Leone", dialCode: "232", nsnLength: 8, flag: "🇸🇱" },
  { code: "et", label: "Éthiopie", dialCode: "251", nsnLength: 9, flag: "🇪🇹" },
];

export const DEFAULT_DON_COUNTRY_CODE = "bj";

/**
 * Exemple de regroupement de chiffres pour le placeholder (ex.
 * "XX XX XX XX XX") — sans l'indicatif, déjà porté par le sélecteur de
 * pays à côté du champ.
 */
export function formatDonPhoneExample(country: DonCountry): string {
  const groups: string[] = [];
  let remaining = country.nsnLength;
  if (remaining % 2 === 1) {
    groups.push("X");
    remaining -= 1;
  }
  while (remaining > 0) {
    groups.push("XX");
    remaining -= 2;
  }
  return groups.join(" ");
}

/**
 * Normalise un numéro de téléphone saisi (avec ou sans indicatif, espaces,
 * tirets...) vers un format international `+<indicatif><numéro national>`,
 * ou renvoie `null` s'il ne correspond pas à la longueur attendue pour le
 * pays sélectionné.
 */
export function normalizeDonPhone(raw: string, countryCode: string): string | null {
  const country = DON_COUNTRIES.find((c) => c.code === countryCode);
  if (!country) return null;

  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith(country.dialCode) && digits.length === country.dialCode.length + country.nsnLength) {
    digits = digits.slice(country.dialCode.length);
  }
  if (digits.length !== country.nsnLength) return null;

  return `+${country.dialCode}${digits}`;
}
