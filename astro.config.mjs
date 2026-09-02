// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // Le site est majoritairement statique (pages marquées `prerender = true`),
  // mais "Parle-nous" a besoin d'un backend pour recevoir les messages et
  // servir l'espace de gestion interne — d'où le passage en sortie "server".
  // Déployé sur Vercel (fonctions serverless) : adaptateur @astrojs/vercel.
  output: 'server',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()]
  }
});
