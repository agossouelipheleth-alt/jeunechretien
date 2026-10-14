import type { APIRoute } from "astro";
import { getSupabaseClient, insertDon, updateDon, type DonInsertPayload } from "../../lib/supabase";
import { isRateLimited } from "../../lib/rate-limit";
import { MIN_AMOUNT, MAX_AMOUNT, isMobileMoneyConfigured } from "../../lib/dons-config";
import { createNyoleCheckoutSession } from "../../lib/nyole";
import { DON_COUNTRIES, DEFAULT_DON_COUNTRY_CODE, normalizeDonPhone } from "../../lib/dons-countries";

const MAX_EMAIL_LENGTH = 320;
const MAX_RAW_PHONE_LENGTH = 40;
const VALID_COUNTRY_CODES = DON_COUNTRIES.map((c) => c.code);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

  // --- Pays ---------------------------------------------------------------
  const pays = str(data.pays) || DEFAULT_DON_COUNTRY_CODE;
  if (!VALID_COUNTRY_CODES.includes(pays)) {
    return json({ ok: false, error: "invalid_country", message: "Pays non pris en charge." }, 400);
  }

  // --- Téléphone (facultatif — sert seulement à préremplir la page de
  //     paiement nyole pour le Mobile Money) -------------------------------
  const telephoneRaw = str(data.telephone);
  let telephone: string | null = null;
  if (telephoneRaw) {
    if (telephoneRaw.length > MAX_RAW_PHONE_LENGTH) {
      return json(
        { ok: false, error: "invalid_phone", message: "Le numéro de téléphone n'est pas valide." },
        400
      );
    }
    telephone = normalizeDonPhone(telephoneRaw, pays);
    if (!telephone) {
      return json(
        {
          ok: false,
          error: "invalid_phone",
          message: "Le numéro de téléphone ne correspond pas au format attendu pour le pays sélectionné.",
        },
        400
      );
    }
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
  const supabase = getSupabaseClient();

  // Tant qu'aucun prestataire Mobile Money n'est configuré, on ne lance
  // jamais de paiement réel — voir src/lib/dons-config.ts. On se contente
  // d'enregistrer l'intention de don si Supabase est disponible, pour que
  // l'équipe puisse recontacter le donateur manuellement.
  if (!isMobileMoneyConfigured()) {
    if (supabase) {
      const payload: DonInsertPayload = {
        reference,
        montant,
        email,
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
        "Le paiement en ligne n'est pas encore activé sur le site. Ton intention de don a bien été enregistrée : notre équipe te contactera pour convenir des modalités. Tu peux aussi nous écrire directement.",
    });
  }

  // --- Paiement réel via nyole ---------------------------------------------
  // Enregistrement best-effort AVANT la création de la session : si
  // Supabase échoue ou n'est pas configuré, on laisse quand même le
  // donateur payer (l'argent part bien vers le compte nyole de
  // l'association), mais le suivi dans /admin/dons et la confirmation
  // automatique par webhook ne pourront pas fonctionner pour ce don.
  let donId: string | null = null;
  if (supabase) {
    const payload: DonInsertPayload = {
      reference,
      montant,
      email,
      telephone,
      statut: "initie",
    };
    const { data: inserted, error } = await insertDon(supabase, payload);
    if (error) {
      console.error("[dons] Échec de l'enregistrement du don avant paiement :", error.message);
    } else {
      donId = inserted?.id ?? null;
    }
  } else {
    console.warn(
      "[dons] Supabase non configuré — ce don ne sera pas suivi dans /admin/dons ni confirmé automatiquement."
    );
  }

  const origin = context.url.origin;
  const session = await createNyoleCheckoutSession({
    amount: montant,
    currency: "XOF",
    customerEmail: email,
    customerPhone: telephone ?? undefined,
    description: "Don à Jeune Chrétien",
    successUrl: new URL(`/soutenez-nous?don=succes&ref=${encodeURIComponent(reference)}`, origin).toString(),
    cancelUrl: new URL(`/soutenez-nous?don=annule&ref=${encodeURIComponent(reference)}`, origin).toString(),
    metadata: { order_id: reference },
    idempotencyKey: reference,
  });

  if (!session.ok) {
    if (supabase && donId) {
      const { error } = await updateDon(supabase, donId, { statut: "echoue" });
      if (error) console.error("[dons] Échec de la mise à jour du statut après échec nyole :", error.message);
    }
    return json(
      {
        ok: false,
        error: session.error,
        message:
          "La création du paiement a échoué. Merci de réessayer dans un instant, ou de nous écrire directement.",
      },
      502
    );
  }

  if (supabase && donId) {
    const { error } = await updateDon(supabase, donId, { nyole_session_id: session.data.id });
    if (error) console.error("[dons] Échec de l'enregistrement de l'identifiant de session nyole :", error.message);
  }

  return json({
    ok: true,
    configured: true,
    reference,
    redirectUrl: session.data.url,
  });
};
