import type { APIRoute } from "astro";
import { getSupabaseClient, insertMessage, type MessageCategory } from "../../lib/supabase";
import { isRateLimited } from "../../lib/rate-limit";

const VALID_CATEGORIES: MessageCategory[] = [
  "question",
  "preoccupation",
  "priere",
  "autre",
];

const MAX_MESSAGE_LENGTH = 4000;
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 320;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isPlausibleEmail(value: string): boolean {
  // Vérification volontairement simple — on ne bloque pas un message pour
  // un format d'e-mail inhabituel, on filtre juste les cas absurdes.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

  const {
    category,
    message,
    isAnonymous,
    name,
    email,
    // Champ piège invisible pour les visiteurs humains : un bot qui
    // remplit tous les champs d'un formulaire le remplira aussi. Si ce
    // champ arrive non-vide, on répond "succès" sans rien enregistrer,
    // pour ne pas indiquer au bot qu'il a été détecté.
    website,
  } = body as Record<string, unknown>;

  if (typeof website === "string" && website.trim().length > 0) {
    return json({ ok: true, category: "question" });
  }

  // `clientAddress` peut lever selon l'adaptateur/l'environnement — on
  // retombe sur une clé partagée plutôt que de faire échouer l'envoi.
  let rateLimitKey = "unknown";
  try {
    rateLimitKey = context.clientAddress ?? "unknown";
  } catch {
    // ignore — clé partagée par défaut
  }
  if (isRateLimited(rateLimitKey)) {
    return json(
      {
        ok: false,
        error: "rate_limited",
        message: "Trop de messages envoyés récemment. Merci de réessayer un peu plus tard.",
      },
      429
    );
  }

  if (typeof category !== "string" || !VALID_CATEGORIES.includes(category as MessageCategory)) {
    return json({ ok: false, error: "invalid_category" }, 400);
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return json({ ok: false, error: "empty_message" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json({ ok: false, error: "message_too_long" }, 400);
  }

  // L'anonymat est appliqué côté serveur, jamais uniquement côté client :
  // si isAnonymous est vrai (ou absent/mal formé), nom et e-mail sont
  // ignorés quoi qu'il arrive dans la requête.
  const wantsAnonymous = isAnonymous !== false;

  let cleanName: string | null = null;
  let cleanEmail: string | null = null;

  if (!wantsAnonymous) {
    if (typeof name === "string" && name.trim().length > 0) {
      cleanName = name.trim().slice(0, MAX_NAME_LENGTH);
    }
    if (typeof email === "string" && email.trim().length > 0) {
      const trimmedEmail = email.trim().slice(0, MAX_EMAIL_LENGTH);
      if (isPlausibleEmail(trimmedEmail)) {
        cleanEmail = trimmedEmail;
      }
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error(
      "[parle-nous] Supabase non configuré — définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env"
    );
    return json(
      {
        ok: false,
        error: "not_configured",
        message: "Le service n'est pas encore disponible. Merci de réessayer plus tard.",
      },
      503
    );
  }

  const { error } = await insertMessage(supabase, {
    category: category as MessageCategory,
    content: message.trim(),
    is_anonymous: wantsAnonymous,
    name: cleanName,
    email: cleanEmail,
  });

  if (error) {
    console.error("[parle-nous] Échec de l'insertion Supabase :", error.message);
    return json(
      {
        ok: false,
        error: "insert_failed",
        message: "Une erreur est survenue. Ton message n'a pas pu être envoyé, merci de réessayer.",
      },
      500
    );
  }

  return json({ ok: true, category });
};
