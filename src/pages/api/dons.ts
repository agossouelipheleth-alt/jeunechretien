import type { APIRoute } from "astro";
import { getSupabaseClient, insertDon, type DonInsertPayload } from "../../lib/supabase";
import { isRateLimited } from "../../lib/rate-limit";
import {
  MOBILE_MONEY_OPERATORS,
  MIN_AMOUNT,
  MAX_AMOUNT,
  isMobileMoneyConfigured,
} from "../../lib/dons-config";

const VALID_OPERATORS = MOBILE_MONEY_OPERATORS.map((o) => o.key);

const MAX_EMAIL_LENGTH = 320;
const MAX_PHONE_LENGTH = 30;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Contrôle raisonnable du numéro Mobile Money béninois : accepte avec ou
// sans indicatif +229, espaces/tirets tolérés, 8 chiffres locaux attendus
// (format Bénin) après un éventuel indicatif.
function isPlausibleBeninPhone(value: string): boolean {
  const digitsOnly = value.replace(/[^\d]/g, "");
  if (!/^[0-9+()\-.\s]+$/.test(value)) return false;
  // Avec indicatif 229 : 11 chiffres (229 + 8). Sans indicatif : 8 chiffres
  // (ou 10 si l'ancien format à 2 chiffres de préfixe local est utilisé).
  return digitsOnly.length === 8 || digitsOnly.length === 10 || digitsOnly.length === 11;
}

function generateReference(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const timePart = Date.now().toString(36).toUpperCase();
  return `JC-DON-${timePart}-${random}`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return json({ ok: false, error: "invalid_body" }, 400);
  }

  const data = body as Record<string, unknown>;

  // Piège anti-bot — même principe que /api/parle-nous et /api/rejoignez-nous.
  if (typeof data.website === "string" && data.website.trim().length > 0) {
    return json({ ok: true, reference: "ok" });
  }

  let rateLimitKey = "unknown";
  try {
    rateLimitKey = `dons:${context.clientAddress ?? "unknown"}`;
  } catch {
    rateLimitKey = "dons:unknown";
  }
  if (isRateLimited(rateLimitKey)) {
    return json(
      {
        ok: false,
        error: "rate_limited",
        message: "Trop de tentatives récentes. Merci de réessayer un peu plus tard.",
      },
      429
    );
  }

  // --- Montant --------------------------------------------------------
  const montantRaw = data.montant;
  const montant = typeof montantRaw === "number" ? montantRaw : Number(montantRaw);
  if (
    typeof montant !== "number" ||
    !Number.isFinite(montant) ||
    !Number.isInteger(montant) ||
    montant < MIN_AMOUNT ||
    montant > MAX_AMOUNT
  ) {
    return json(
      {
        ok: false,
        error: "invalid_amount",
        message: `Le montant indiqué n'est pas valide (entre ${MIN_AMOUNT} et ${MAX_AMOUNT} FCFA).`,
      },
      400
    );
  }

  // --- E-mail -----------------------------------------------------------
  const email = str(data.email);
  if (!email || !isPlausibleEmail(email) || email.length > MAX_EMAIL_LENGTH) {
    return json(
      { ok: false, error: "invalid_email", message: "L'adresse e-mail n'est pas valide." },
      400
    );
  }

  // --- Opérateur Mobile Money --------------------------------------------
  const operateur = str(data.operateur);
  if (!VALID_OPERATORS.includes(operateur)) {
    return json(
      { ok: false, error: "invalid_operator", message: "Merci de sélectionner un opérateur Mobile Money." },
      400
    );
  }

  // --- Téléphone ----------------------------------------------------------
  const telephone = str(data.telephone);
  if (!telephone || !isPlausibleBeninPhone(telephone) || telephone.length > MAX_PHONE_LENGTH) {
    return json(
      {
        ok: false,
        error: "invalid_phone",
        message: "Le numéro Mobile Money n'est pas valide.",
      },
      400
    );
  }

  // --- Confirmation --------------------------------------------------------
  if (data.confirme !== true) {
    return json(
      {
        ok: false,
        error: "confirmation_required",
        message: "Merci de confirmer ton don avant de continuer.",
      },
      400
    );
  }

  const reference = generateReference();

  // Tant qu'aucun prestataire Mobile Money n'est configuré, on ne lance
  // jamais de paiement réel — voir src/lib/dons-config.ts. On se contente
  // d'enregistrer l'intention de don si Supabase est disponible, pour que
  // l'équipe puisse recontacter le donateur manuellement.
  if (!isMobileMoneyConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const payload: DonInsertPayload = {
        reference,
        montant,
        email,
        operateur,
        telephone,
        statut: "en_attente_configuration",
      };
      const { error } = await insertDon(supabase, payload);
      if (error) {
        console.error("[dons] Échec de l'enregistrement de l'intention de don :", error.message);
      }
    } else {
      console.warn(
        "[dons] Supabase non configuré — l'intention de don n'a pas pu être enregistrée (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants)."
      );
    }

    return json({
      ok: true,
      configured: false,
      reference,
      message:
        "Le paiement Mobile Money en ligne n'est pas encore activé sur le site. Ton intention de don a bien été enregistrée : notre équipe te contactera pour convenir des modalités. Tu peux aussi nous écrire directement.",
    });
  }

  // TODO: intégration prestataire réel — initialiser le paiement auprès du
  // prestataire configuré (MOBILE_MONEY_PROVIDER), créer la ligne "dons"
  // avec le statut "initie", puis suivre/confirmer le statut via son
  // mécanisme de notification serveur-à-serveur avant de jamais annoncer
  // un don "reussi" au client.
  return json(
    {
      ok: false,
      error: "not_implemented",
      message: "L'intégration du paiement est en cours de configuration. Merci de réessayer plus tard.",
    },
    503
  );
};
