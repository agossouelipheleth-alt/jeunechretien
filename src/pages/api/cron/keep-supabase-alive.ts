import type { APIRoute } from "astro";
import { getSupabaseClient } from "../../../lib/supabase";

// Tâche planifiée (voir vercel.json → "crons") : le plan gratuit Supabase
// met un projet en pause après 7 jours sans la moindre requête. Une simple
// lecture, deux fois par semaine, suffit à le maintenir actif — bien en
// dessous du seuil de 7 jours.
//
// Déclenchée uniquement par le planificateur de Vercel, qui envoie
// automatiquement `Authorization: Bearer ${CRON_SECRET}` — on vérifie ce
// jeton pour qu'un tiers ne puisse pas appeler cette route à volonté.
export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return new Response("Supabase non configuré", { status: 503 });
  }

  const { error } = await supabase.from("messages").select("id").limit(1);
  if (error) {
    console.error("[cron/keep-supabase-alive] Échec de la requête de ping :", error.message);
    return new Response("Échec", { status: 500 });
  }

  return new Response("ok", { status: 200 });
};
