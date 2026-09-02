// Couleurs de badge par catégorie éditoriale — un seul endroit, réutilisé
// par ALaUne.astro (homepage), blog/index.astro et blog/[slug].astro.
// Les clés correspondent au schéma `category` de src/content.config.ts et
// aux tokens --color-category-* de global.css.
export const categoryColors: Record<string, string> = {
  temoignages: "var(--color-category-temoignages)",
  jeunesse: "var(--color-category-jeunesse)",
  carriere: "var(--color-category-carriere)",
  societe: "var(--color-category-societe)",
  developpement: "var(--color-category-developpement)",
  foi: "var(--color-category-foi)",
};

// Couleur de texte du badge — sombre par défaut (fixe, indépendante du
// thème, voir commentaire dans ALaUne.astro), sauf pour "foi" dont
// l'aplat (violet, alias de l'accent) est trop foncé pour un texte sombre.
export const categoryTextColors: Record<string, string> = {
  foi: "#ffffff",
};
export const defaultCategoryTextColor = "#070500";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatArticleDate(date: Date): string {
  return dateFormatter.format(date);
}

// Estimation grossière du temps de lecture (comme les autres champs
// éditoriaux "à venir" ailleurs sur le site, ce n'est pas une donnée
// mesurée précisément — juste une indication utile pour le lecteur).
export function estimateReadingTime(body: string): string {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min de lecture`;
}
