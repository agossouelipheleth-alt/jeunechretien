// Limiteur de débit très simple, en mémoire, pour dissuader les envois
// automatisés massifs sur /api/parle-nous. Limite volontairement modeste :
// l'objectif est de filtrer les scripts, pas de gêner un visiteur qui
// écrirait deux messages à quelques minutes d'intervalle.
// Limite : ne fonctionne que par instance de serveur (se réinitialise au
// redémarrage, ne partage rien entre plusieurs instances). Suffisant pour
// un déploiement mono-instance ; à remplacer par un store partagé (ex.
// Redis) si le trafic ou l'infrastructure grandissent.
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

const hits = new Map<string, number[]>();

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return false;
}
