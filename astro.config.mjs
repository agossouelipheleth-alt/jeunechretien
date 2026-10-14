// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Nom de domaine canonique — utilisé pour le sitemap, les balises
  // canonical/Open Graph (voir Layout.astro) et les URLs absolues
  // générées par Astro.
  site: 'https://jeunechretien.org',

  // Le site est majoritairement statique (pages marquées `prerender = true`),
  // mais "Parle-nous" a besoin d'un backend pour recevoir les messages et
  // servir l'espace de gestion interne — d'où le passage en sortie "server".
  // Déployé sur Vercel (fonctions serverless) : adaptateur @astrojs/vercel.
  output: 'server',

  adapter: vercel(),

  vite: {
    plugins: [tailwindcss()]
  },

  // Exclut la 404 (et, par précaution, tout ce qui passerait sous /admin/)
  // du plan de site — ces pages ne sont de toute façon pas prerendues.
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404') && !page.includes('/admin/'),
    }),
  ]
});