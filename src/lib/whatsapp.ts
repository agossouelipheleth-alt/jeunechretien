// Source unique pour l'URL de la chaîne WhatsApp officielle de Jeune
// Chrétien — voir brief "Intégration de la chaîne WhatsApp" section 12.
// Un seul endroit à modifier quand le lien officiel sera disponible ;
// tous les CTA du site (SuivreChaineWhatsApp.astro) le lisent d'ici.
//
// Ne jamais inventer d'URL : tant que la vraie chaîne n'est pas
// communiquée, cette constante reste `null` et chaque CTA affiche un état
// "à renseigner" clairement identifié plutôt qu'un lien mort ou fictif.
export const WHATSAPP_CHANNEL_URL: string | null =
  "https://whatsapp.com/channel/0029VbD8HS9JENxsHUJFx31Z";
