import type { APIRoute } from "astro";
import { getSupabaseClient, updateDonByReference, type DonStatut } from "../../../lib/supabase";
import { verifyNyoleWebhookSignature, type NyoleWebhookPayload } from "../../../lib/nyole";

// Reçoit les webhooks signés de nyole (paiements Mobile Money/carte de
// "Soutenez-nous") — voir https://nyole.com/docs/webhooks/. C'est la SEULE
// source fiable pour marquer un don comme réellement reçu : on ne se fie
// jamais à la redirection success_url du navigateur (voir /api/dons.ts).
export const prerender = false;

function mapEventToStatut(event: string, nyoleStatus: string): DonStatut | null {
  if (event === "payment.completed") return "reussi";
  if (event === "payment.failed") return "echoue";
  if (event === "payment.cancelled") return "annule";
  if (event === "payment.updated") {
    if (nyoleStatus === "REFUNDED") return "rembourse";
    if (nyoleStatus === "PENDING") return "en_attente";
    if (nyoleStatus === "SUCCESS") return "reussi";
    if (nyoleStatus === "FAILED") return "echoue";
    if (nyoleStatus === "CANCELLED") return "annule";
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  // Le corps DOIT rester brut pour la vérification de signature — jamais
  // request.json() avant d'avoir vérifié la signature sur la chaîne reçue.
  const rawBody = await request.text();

  const timestamp = request.headers.get("x-afriflow-timestamp");
  const signature = request.headers.get("x-afriflow-signature");

  if (!verifyNyoleWebhookSignature(rawBody, timestamp, signature)) {
    console.warn("[webhooks/nyole] Signature invalide ou absente — requête rejetée.");
    return new Response("signature invalide", { status: 400 });
  }

  let payload: NyoleWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("JSON invalide", { status: 400 });
  }

  // Notre référence interne (JC-DON-...) a été transmise en metadata.order_id
  // à la création de la session (voir /api/dons.ts).
  const reference = payload.data?.metadata?.order_id;
  if (!reference) {
    console.warn("[webhooks/nyole] Événement sans référence interne (metadata.order_id manquant) :", payload.event);
    return new Response("ok", { status: 200 });
  }

  const statut = mapEventToStatut(payload.event, payload.data?.status);
  if (!statut) {
    // Événement reçu mais sans changement de statut à appliquer (ex.
    // payment.updated vers un statut qu'on ne suit pas) — on répond 200
    // pour éviter des réessais inutiles côté nyole.
    return new Response("ok", { status: 200 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("[webhooks/nyole] Supabase non configuré — impossible d'enregistrer la confirmation de paiement.");
    // 200 quand même : ce n'est pas nyole qui est en tort, et un retry ne
    // changera rien tant que Supabase n'est pas configuré.
    return new Response("ok", { status: 200 });
  }

  const { error } = await updateDonByReference(supabase, reference, {
    statut,
    reference_prestataire: payload.data?.provider_reference ?? null,
    nyole_session_id: payload.data?.id ?? null,
  });

  if (error) {
    console.error("[webhooks/nyole] Échec de la mise à jour du don :", error.message);
    // On répond quand même 200 : l'erreur est de notre côté (Supabase), pas
    // un problème que nyole peut résoudre en réessayant le même événement.
  }

  return new Response("ok", { status: 200 });
};
