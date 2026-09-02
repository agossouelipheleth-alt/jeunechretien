import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Collection "blog" — articles repris tels quels (texte non réécrit) de
// l'ancien blog Substack de Jeune Chrétien (jeunechretien.substack.com),
// à la demande explicite de l'utilisateur. `sourceUrl` conserve un lien
// vers l'article Substack d'origine, pour traçabilité.
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      // Étiquette affichée sur la carte (Article / Témoignage / Interview / Billet).
      type: z.enum(["Article", "Témoignage", "Interview", "Billet"]),
      // Clé de catégorie éditoriale — pilote la couleur du badge, voir
      // les tokens --color-category-* dans global.css.
      category: z.enum([
        "temoignages",
        "jeunesse",
        "carriere",
        "societe",
        "developpement",
        "foi",
      ]),
      categoryLabel: z.string(),
      excerpt: z.string(),
      date: z.coerce.date(),
      author: z.string().optional(),
      image: image().optional(),
      imageAlt: z.string().optional(),
      sourceUrl: z.string().url(),
    }),
});

export const collections = { blog };
