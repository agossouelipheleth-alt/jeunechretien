import type { APIRoute } from "astro";
import {
  getSupabaseClient,
  insertCandidature,
  type CandidatureDisponibilite,
  type CandidatureInsertPayload,
} from "../../lib/supabase";
import { isRateLimited } from "../../lib/rate-limit";

// Domaines de compétence acceptés — alignés sur les statuts (art. 9) et le
// règlement intérieur (art. 6) : "rédaction web SEO, community management,
// création de contenus, conception graphique, montage vidéo, photographie,
// motion design, voix-off, événementiel, animation de scène ou tout
// domaine connexe". "autre" correspond à "tout domaine connexe".
const VALID_SKILLS = [
  "redaction-seo",
  "journalisme",
  "community-management",
  "creation-contenus",
  "conception-graphique",
  "montage-video",
  "photographie",
  "motion-design",
  "voix-off",
  "evenementiel",
  "animation-scene",
  "autre",
] as const;

const VALID_DISPONIBILITES: CandidatureDisponibilite[] = [
  "quelques_heures_semaine",
  "quelques_heures_mois",
  "selon_besoins",
];

// Longueurs minimales "raisonnables" (brief section 6, parties C et D) —
// volontairement modestes : on filtre les réponses vides ou d'un mot, pas
// un essai trop court mais sincère.
const MIN_EXPERIENCE_LENGTH = 20;
const MIN_LONG_TEXT_LENGTH = 30;

const MAX_SHORT_FIELD = 200;
const MAX_TEXT_FIELD = 4000;
const MAX_EMAIL_LENGTH = 320;
const MAX_URL_LENGTH = 500;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Contrôle "raisonnable" du téléphone : chiffres, espaces et séparateurs
// usuels, sans imposer un indicatif national précis (brief section 6,
// partie A) — au moins 8 chiffres au total.
function isPlausiblePhone(value: string): boolean {
  const digitCount = (value.match(/\d/g) ?? []).length;
  return digitCount >= 8 && /^[0-9+()\-.\s]+$/.test(value);
}

function isPlausibleUrl(value: string): boolean {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

  const data = body as Record<string, unknown>;

  // Piège anti-bot — même principe que /api/parle-nous.
  if (typeof data.website === "string" && data.website.trim().length > 0) {
    return json({ ok: true, id: "ok" });
  }

  let rateLimitKey = "unknown";
  try {
    rateLimitKey = `rejoignez-nous:${context.clientAddress ?? "unknown"}`;
  } catch {
    rateLimitKey = "rejoignez-nous:unknown";
  }
  if (isRateLimited(rateLimitKey)) {
    return json(
      {
        ok: false,
        error: "rate_limited",
        message: "Trop de candidatures envoyées récemment. Merci de réessayer un peu plus tard.",
      },
      429
    );
  }

  // --- Partie A — informations personnelles -------------------------------
  const nom = str(data.nom);
  const prenoms = str(data.prenoms);
  const dateNaissance = str(data.dateNaissance);
  const ville = str(data.ville);
  const pays = str(data.pays);
  const telephone = str(data.telephone);
  const email = str(data.email);

  if (!nom || !prenoms || !dateNaissance || !ville || !pays || !telephone || !email) {
    return json(
      { ok: false, error: "missing_fields", message: "Merci de renseigner tous les champs obligatoires." },
      400
    );
  }
  if (nom.length > MAX_SHORT_FIELD || prenoms.length > MAX_SHORT_FIELD) {
    return json({ ok: false, error: "field_too_long" }, 400);
  }
  if (!isPlausibleEmail(email) || email.length > MAX_EMAIL_LENGTH) {
    return json({ ok: false, error: "invalid_email", message: "L'adresse e-mail n'est pas valide." }, 400);
  }
  if (!isPlausiblePhone(telephone)) {
    return json(
      { ok: false, error: "invalid_phone", message: "Le numéro de téléphone n'est pas valide." },
      400
    );
  }

  const birthDate = new Date(dateNaissance);
  const today = new Date();
  if (Number.isNaN(birthDate.getTime())) {
    return json({ ok: false, error: "invalid_birth_date" }, 400);
  }
  if (birthDate.getTime() > today.getTime()) {
    return json(
      { ok: false, error: "future_birth_date", message: "La date de naissance ne peut pas être future." },
      400
    );
  }
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  if (age < 18) {
    // Conforme aux statuts (art. 9) et au règlement intérieur (art. 6) :
    // être une personne physique majeure. On s'arrête ici sans exiger ni
    // valider le reste du formulaire.
    return json(
      {
        ok: false,
        error: "minor",
        message:
          "L'admission comme membre actif de Jeune Chrétien est réservée aux personnes majeures. Tu ne remplis pas ce critère pour le moment, mais tu peux suivre nos contenus et participer aux initiatives ouvertes à tous.",
      },
      422
    );
  }

  // --- Partie B — parcours chrétien ---------------------------------------
  const professionDeFoi = data.professionDeFoi === true;
  const egliseNom = str(data.egliseNom);
  const egliseVille = str(data.egliseVille);
  const participeEglise = data.participeEglise === true;

  if (typeof data.professionDeFoi !== "boolean" || typeof data.participeEglise !== "boolean") {
    return json({ ok: false, error: "missing_fields" }, 400);
  }
  if (!egliseNom || !egliseVille) {
    return json(
      { ok: false, error: "missing_fields", message: "Merci de renseigner tous les champs obligatoires." },
      400
    );
  }
  if (!professionDeFoi || !participeEglise) {
    // Statuts art. 9 / règl. art. 6 : être chrétien(ne) converti(e) et
    // professer sa foi en Jésus-Christ, être membre d'une église locale et
    // participer à sa vie — conditions cumulatives.
    return json(
      {
        ok: false,
        error: "faith_criteria_not_met",
        message:
          "Selon les critères d'admission de Jeune Chrétien, il n'est pas possible de candidater comme membre actif pour le moment. Tu restes bienvenu·e pour suivre nos contenus et participer à nos initiatives ouvertes à tous.",
      },
      422
    );
  }

  // --- Partie C — compétences et expérience -------------------------------
  const competencesRaw = Array.isArray(data.competences) ? data.competences : [];
  const competences = competencesRaw.filter(
    (c): c is string => typeof c === "string" && (VALID_SKILLS as readonly string[]).includes(c)
  );
  const experience = str(data.experience);
  const portfolioUrlRaw = str(data.portfolioUrl);

  if (competences.length === 0) {
    return json(
      {
        ok: false,
        error: "no_skill_selected",
        message: "Merci de sélectionner au moins un domaine de compétence.",
      },
      400
    );
  }
  if (experience.length < MIN_EXPERIENCE_LENGTH) {
    return json(
      {
        ok: false,
        error: "experience_too_short",
        message: "Merci de présenter ton expérience un peu plus en détail.",
      },
      400
    );
  }
  if (experience.length > MAX_TEXT_FIELD) {
    return json({ ok: false, error: "field_too_long" }, 400);
  }
  let portfolioUrl: string | null = null;
  if (portfolioUrlRaw) {
    if (portfolioUrlRaw.length > MAX_URL_LENGTH || !isPlausibleUrl(portfolioUrlRaw)) {
      return json(
        { ok: false, error: "invalid_portfolio_url", message: "Le lien indiqué n'est pas valide." },
        400
      );
    }
    portfolioUrl = portfolioUrlRaw.includes("://") ? portfolioUrlRaw : `https://${portfolioUrlRaw}`;
  }

  // --- Partie D — motivation et engagement --------------------------------
  const motivation = str(data.motivation);
  const contribution = str(data.contribution);
  const disponibilite = str(data.disponibilite) as CandidatureDisponibilite;

  if (motivation.length < MIN_LONG_TEXT_LENGTH || contribution.length < MIN_LONG_TEXT_LENGTH) {
    return json(
      {
        ok: false,
        error: "motivation_too_short",
        message: "Merci de développer un peu plus tes réponses sur ta motivation et ta contribution.",
      },
      400
    );
  }
  if (motivation.length > MAX_TEXT_FIELD || contribution.length > MAX_TEXT_FIELD) {
    return json({ ok: false, error: "field_too_long" }, 400);
  }
  if (!VALID_DISPONIBILITES.includes(disponibilite)) {
    return json({ ok: false, error: "invalid_availability" }, 400);
  }

  // --- Partie E — lecture des textes et consentements ---------------------
  const aAccepteStatuts = data.aAccepteStatuts === true;
  const aAccepteReglement = data.aAccepteReglement === true;
  const certifieExactitude = data.certifieExactitude === true;
  const aAccepteConfidentialite = data.aAccepteConfidentialite === true;

  if (!aAccepteStatuts || !aAccepteReglement || !certifieExactitude || !aAccepteConfidentialite) {
    return json(
      {
        ok: false,
        error: "consents_required",
        message: "Merci de cocher les quatre cases de confirmation avant d'envoyer ta candidature.",
      },
      400
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error(
      "[rejoignez-nous] Supabase non configuré — définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env"
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

  const payload: CandidatureInsertPayload = {
    nom: nom.slice(0, MAX_SHORT_FIELD),
    prenoms: prenoms.slice(0, MAX_SHORT_FIELD),
    date_naissance: dateNaissance,
    ville: ville.slice(0, MAX_SHORT_FIELD),
    pays: pays.slice(0, MAX_SHORT_FIELD),
    telephone: telephone.slice(0, MAX_SHORT_FIELD),
    email,
    profession_de_foi: professionDeFoi,
    eglise_nom: egliseNom.slice(0, MAX_SHORT_FIELD),
    eglise_ville: egliseVille.slice(0, MAX_SHORT_FIELD),
    participe_eglise: participeEglise,
    competences,
    experience,
    portfolio_url: portfolioUrl,
    motivation,
    contribution,
    disponibilite,
    a_accepte_statuts: aAccepteStatuts,
    a_accepte_reglement: aAccepteReglement,
    certifie_exactitude: certifieExactitude,
    a_accepte_confidentialite: aAccepteConfidentialite,
  };

  const { data: inserted, error } = await insertCandidature(supabase, payload);

  if (error || !inserted) {
    console.error("[rejoignez-nous] Échec de l'insertion Supabase :", error?.message);
    return json(
      {
        ok: false,
        error: "insert_failed",
        message: "Nous n'avons pas pu transmettre ta candidature. Merci de réessayer.",
      },
      500
    );
  }

  return json({ ok: true, id: inserted.id as string });
};
