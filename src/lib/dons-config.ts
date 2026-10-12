// Configuration centrale du module de don Mobile Money — "Soutenez-nous".
// Un seul endroit à modifier pour faire évoluer les opérateurs proposés,
// les montants suggérés et les limites, ou pour activer un vrai
// prestataire de paiement une fois celui-ci choisi et intégré.
//
// État actuel : AUCUN prestataire de paiement n'est connecté. isMobileMoneyConfigured()
// renvoie donc toujours `false`, et /api/dons ne fait jamais qu'enregistrer
// une intention de don (voir ce fichier et supabase/schema.sql, table
// "dons") — jamais un paiement réellement effectué. Pour activer un
// paiement réel :
//   1. Choisir un agrégateur compatible Bénin/Mobile Money (ex. FedaPay,
//      Kkiapay, CinetPay, PayDunya — à valider selon les opérateurs et
//      frais réels).
//   2. Renseigner les variables d'environnement MOBILE_MONEY_PROVIDER et
//      les clés API associées (voir .env.example).
//   3. Implémenter l'appel réel à ce prestataire dans /api/dons.ts, à
//      l'endroit marqué "TODO: intégration prestataire réel".
//   4. Mettre à jour MOBILE_MONEY_OPERATORS si les opérateurs pris en
//      charge diffèrent de la liste ci-dessous.

export interface MobileMoneyOperator {
  key: string;
  label: string;
}

// Les deux opérateurs Mobile Money dominants au Bénin. Liste à ajuster
// selon ce que le prestataire choisi prend effectivement en charge.
export const MOBILE_MONEY_OPERATORS: MobileMoneyOperator[] = [
  { key: "mtn", label: "MTN Mobile Money" },
  { key: "moov", label: "Moov Money" },
];

export const SUGGESTED_AMOUNTS = [5000, 10000, 50000, 100000] as const;

// Bornes de sécurité génériques (évitent un montant nul, négatif ou
// absurde) — PAS les limites réelles d'un prestataire, qui ne sont pas
// connues tant qu'aucun n'est configuré. À remplacer par les limites
// exactes du prestataire retenu au moment de l'intégration.
export const MIN_AMOUNT = 500;
export const MAX_AMOUNT = 2_000_000;

export const CURRENCY = "FCFA";

/**
 * `true` seulement lorsqu'un vrai prestataire de paiement Mobile Money est
 * configuré (variable d'environnement MOBILE_MONEY_PROVIDER renseignée).
 * Tant que ce n'est pas le cas, l'API ne doit jamais prétendre qu'un
 * paiement a été initié ou réussi.
 */
export function isMobileMoneyConfigured(): boolean {
  return Boolean(import.meta.env.MOBILE_MONEY_PROVIDER);
}
