// Configuration centrale du module de don — "Soutenez-nous".
// Prestataire de paiement : nyole (https://nyole.com), qui encaisse
// Mobile Money (Orange Money, Wave, MTN MoMo, Moov Money…) et carte
// bancaire via une page de paiement hébergée — voir src/lib/nyole.ts pour
// le client API et src/pages/api/dons.ts / src/pages/api/webhooks/nyole.ts
// pour l'intégration.
//
// Tant que NYOLE_SECRET_KEY n'est pas renseignée (voir .env.example),
// isMobileMoneyConfigured() renvoie `false` et /api/dons se contente
// d'enregistrer une intention de don (table "dons", statut
// "en_attente_configuration") — jamais un paiement réellement effectué.
import { isNyoleConfigured } from "./nyole";

export const SUGGESTED_AMOUNTS = [5000, 10000, 50000, 100000] as const;

// Bornes de sécurité génériques (évitent un montant nul, négatif ou
// absurde) — ajustables si nyole applique des limites différentes.
export const MIN_AMOUNT = 500;
export const MAX_AMOUNT = 2_000_000;

export const CURRENCY = "FCFA";

/**
 * `true` seulement lorsque le prestataire nyole est configuré (clé API
 * secrète renseignée). Tant que ce n'est pas le cas, l'API ne doit jamais
 * prétendre qu'un paiement a été initié ou réussi.
 */
export function isMobileMoneyConfigured(): boolean {
  return isNyoleConfigured();
}
