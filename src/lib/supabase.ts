// Client Supabase côté serveur UNIQUEMENT — utilise la clé service_role,
// qui contourne les règles RLS. Ne jamais importer ce fichier depuis un
// composant/script exécuté dans le navigateur.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type MessageCategory = "question" | "preoccupation" | "priere" | "autre";
export type MessageStatus = "nouveau" | "en_cours" | "traite" | "archive";

export type CandidatureStatut = "a_examiner" | "en_cours" | "admis" | "refuse";
export type CandidatureDisponibilite =
  | "quelques_heures_semaine"
  | "quelques_heures_mois"
  | "selon_besoins";

export interface ParleNousMessage {
  id: string;
  category: MessageCategory;
  content: string;
  is_anonymous: boolean;
  name: string | null;
  email: string | null;
  status: MessageStatus;
  is_priority: boolean;
  created_at: string;
  updated_at: string;
}

export interface Candidature {
  id: string;
  nom: string;
  prenoms: string;
  date_naissance: string;
  ville: string;
  pays: string;
  telephone: string;
  email: string;
  profession_de_foi: boolean;
  eglise_nom: string;
  eglise_ville: string;
  participe_eglise: boolean;
  competences: string[];
  experience: string;
  portfolio_url: string | null;
  motivation: string;
  contribution: string;
  disponibilite: CandidatureDisponibilite;
  a_accepte_statuts: boolean;
  a_accepte_reglement: boolean;
  certifie_exactitude: boolean;
  a_accepte_confidentialite: boolean;
  statut: CandidatureStatut;
  notes_internes: string | null;
  created_at: string;
  updated_at: string;
}

// Typage minimal du schéma Supabase — juste assez pour que le client
// insert()/update()/select() sur "messages" soit correctement typé (sans
// ça, supabase-js retombe sur `never` pour les colonnes en TS strict).
interface Database {
  public: {
    Tables: {
      messages: {
        Row: ParleNousMessage;
        Insert: {
          category: MessageCategory;
          content: string;
          is_anonymous: boolean;
          name?: string | null;
          email?: string | null;
          status?: MessageStatus;
          is_priority?: boolean;
        };
        Update: Partial<{
          category: MessageCategory;
          content: string;
          is_anonymous: boolean;
          name: string | null;
          email: string | null;
          status: MessageStatus;
          is_priority: boolean;
        }>;
        Relationships: [];
      };
      candidatures: {
        Row: Candidature;
        Insert: {
          nom: string;
          prenoms: string;
          date_naissance: string;
          ville: string;
          pays: string;
          telephone: string;
          email: string;
          profession_de_foi: boolean;
          eglise_nom: string;
          eglise_ville: string;
          participe_eglise: boolean;
          competences: string[];
          experience: string;
          portfolio_url?: string | null;
          motivation: string;
          contribution: string;
          disponibilite: CandidatureDisponibilite;
          a_accepte_statuts: boolean;
          a_accepte_reglement: boolean;
          certifie_exactitude: boolean;
          a_accepte_confidentialite: boolean;
          statut?: CandidatureStatut;
          notes_internes?: string | null;
        };
        Update: Partial<{
          statut: CandidatureStatut;
          notes_internes: string | null;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type MessageInsertPayload = Database["public"]["Tables"]["messages"]["Insert"];
export type MessageUpdatePayload = Database["public"]["Tables"]["messages"]["Update"];
export type CandidatureInsertPayload = Database["public"]["Tables"]["candidatures"]["Insert"];
export type CandidatureUpdatePayload = Database["public"]["Tables"]["candidatures"]["Update"];

let cachedClient: SupabaseClient<Database> | null = null;

/**
 * Renvoie le client Supabase, ou `null` si les variables d'environnement
 * ne sont pas configurées (permet au site de tourner en local en mode
 * dégradé plutôt que de planter, avec un message clair côté UI).
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (cachedClient) return cachedClient;

  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  cachedClient = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

// --- Helpers d'écriture --------------------------------------------------
// L'inférence de générique de supabase-js pour insert()/update() se
// résout à `never` dans la configuration TS de ce projet (isolatedModules
// + verbatimModuleSyntax), bien qu'un test isolé avec le même schéma
// fonctionne — un contournement ciblé (cast local) est appliqué ici, une
// seule fois, plutôt que dans chaque appelant. Le payload lui-même reste
// intégralement typé côté appelant via MessageInsertPayload/UpdatePayload.

export async function insertMessage(client: SupabaseClient<Database>, payload: MessageInsertPayload) {
  return client.from("messages").insert(payload as never);
}

export async function updateMessage(
  client: SupabaseClient<Database>,
  id: string,
  payload: MessageUpdatePayload
) {
  return client.from("messages").update(payload as never).eq("id", id);
}

export async function deleteMessage(client: SupabaseClient<Database>, id: string) {
  return client.from("messages").delete().eq("id", id);
}

export async function insertCandidature(
  client: SupabaseClient<Database>,
  payload: CandidatureInsertPayload
) {
  const result = await client.from("candidatures").insert(payload as never).select("id").single();
  return result as { data: { id: string } | null; error: { message: string } | null };
}

export async function updateCandidature(
  client: SupabaseClient<Database>,
  id: string,
  payload: CandidatureUpdatePayload
) {
  return client.from("candidatures").update(payload as never).eq("id", id);
}
