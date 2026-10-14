import type { APIRoute } from "astro";
import { getSupabaseClient } from "../../../lib/supabase";
import { isRateLimited } from "../../../lib/rate-limit";

// Permet à la page de retour de "Soutenez-nous" (?don=succes|annule&ref=...)
// de vérifier le statut réel d'un don après redirection depuis nyole — on
// ne se fie jamais au seul paramètre d'URL (voir le commentaire dans
// /api/dons.ts et la documentation nyole : "Fiez-vous au serveur").
// Ne renvoie que le strict nécessaire à l'affichage (aucune donnée
// personnelle : ni e-mail, ni téléphone, ni opérateur).
export const prerender = false;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async (context) => {
  const reference = context.url.searchParams.get("ref")?.trim() ?? "";

  // Format attendu : JC-DON-XXXX-XXXX — rejette d'emblée tout ce qui n'y
  // ressemble pas, avant même d'interroger la base.
  if (!/^JC-DON-[A-Z0-9]+-[A-Z0-9]+$/.test(reference)) {
    return json({ ok: false, error: "invalid_reference" }, 400);
  }

  let rateLimitKey = "unknown";
  try {
    rateLimitKey = `dons-statut:${context.clientAddress ?? "unknown"}`;
  } catch {
    rateLimitKey = "dons-statut:unknown";
  }
  if (isRateLimited(rateLimitKey)) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return json({ ok: false, error: "not_configured" }, 503);
  }

  const result = await supabase.from("dons").select("statut, montant").eq("reference", reference).maybeSingle();
  const { data, error } = result as {
    data: { statut: string; montant: number } | null;
    error: { message: string } | null;
  };

  if (error) {
    console.error("[dons/statut] Échec de la lecture du don :", error.message);
    return json({ ok: false, error: "lookup_failed" }, 500);
  }
  if (!data) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  return json({ ok: true, statut: data.statut, montant: data.montant });
};
