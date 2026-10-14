-- Schéma pour la fonctionnalité "Parle-nous".
-- À exécuter dans l'éditeur SQL du projet Supabase (Database → SQL Editor).

create extension if not exists "pgcrypto";

do $$ begin
  create type message_category as enum ('question', 'preoccupation', 'priere', 'autre');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type message_status as enum ('nouveau', 'en_cours', 'traite', 'archive');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  category message_category not null,
  content text not null,
  -- Collecte minimale : nom/e-mail toujours nullable, même quand
  -- l'utilisateur choisit de ne pas rester anonyme (ces champs restent
  -- facultatifs dans tous les cas — voir le formulaire "Parle-nous").
  is_anonymous boolean not null default true,
  name text,
  email text,
  status message_status not null default 'nouveau',
  is_priority boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_status_idx on public.messages (status);
create index if not exists messages_category_idx on public.messages (category);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- Row Level Security activée, SANS policy définie pour les rôles publics
-- (anon / authenticated) : personne ne peut lire ni écrire directement
-- depuis le navigateur. Seule la clé service_role (utilisée uniquement
-- côté serveur, jamais exposée au client) peut accéder à cette table —
-- elle contourne RLS par conception. C'est le seul chemin d'accès.
alter table public.messages enable row level security;

-- Schéma pour la fonctionnalité "Rejoignez-nous" (candidatures au statut
-- de membre actif — voir /rejoignez-nous, /api/rejoignez-nous et
-- /admin/candidatures). Réutilise le même projet/client Supabase que
-- "Parle-nous" ci-dessus, dans une table distincte.

do $$ begin
  create type candidature_statut as enum ('a_examiner', 'en_cours', 'admis', 'refuse');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type candidature_disponibilite as enum (
    'quelques_heures_semaine',
    'quelques_heures_mois',
    'selon_besoins'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.candidatures (
  id uuid primary key default gen_random_uuid(),

  -- Partie A — informations personnelles (statuts art. 9, règl. art. 6 :
  -- personne physique majeure).
  nom text not null,
  prenoms text not null,
  date_naissance date not null,
  ville text not null,
  pays text not null,
  telephone text not null,
  email text not null,

  -- Partie B — parcours chrétien (statuts art. 9, règl. art. 6 : conditions
  -- de conversion, profession de foi et participation à une église locale).
  profession_de_foi boolean not null,
  eglise_nom text not null,
  eglise_ville text not null,
  participe_eglise boolean not null,

  -- Partie C — compétences et expérience (règl. art. 6 et 7 : au moins un
  -- domaine de compétence, justifiable par tout moyen approprié).
  competences text[] not null,
  experience text not null,
  portfolio_url text,

  -- Partie D — motivation et engagement.
  motivation text not null,
  contribution text not null,
  disponibilite candidature_disponibilite not null,

  -- Partie E — consentements obligatoires au moment de la soumission
  -- (conservés comme preuve, indépendamment du texte en vigueur au moment
  -- d'une lecture ultérieure).
  a_accepte_statuts boolean not null,
  a_accepte_reglement boolean not null,
  certifie_exactitude boolean not null,
  a_accepte_confidentialite boolean not null,

  -- Suivi interne (règl. art. 7 : examen par le Bureau Exécutif).
  statut candidature_statut not null default 'a_examiner',
  notes_internes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidatures_statut_idx on public.candidatures (statut);
create index if not exists candidatures_created_at_idx on public.candidatures (created_at desc);

drop trigger if exists candidatures_set_updated_at on public.candidatures;
create trigger candidatures_set_updated_at
  before update on public.candidatures
  for each row execute function public.set_updated_at();

-- Même principe que pour "messages" : RLS activée sans policy publique,
-- seule la clé service_role (serveur uniquement) peut lire/écrire. Cette
-- table contient des données plus sensibles (coordonnées, parcours
-- chrétien) que "messages" : à ne jamais exposer via une policy anon.
alter table public.candidatures enable row level security;

-- Schéma pour la fonctionnalité "Soutenez-nous" (dons Mobile Money et
-- carte, prestataire nyole — voir /soutenez-nous, /api/dons,
-- /api/webhooks/nyole et /admin/dons). Réutilise le même projet Supabase
-- que les tables ci-dessus, dans une table distincte.
--
-- IMPORTANT : tant que NYOLE_SECRET_KEY n'est pas renseignée (voir
-- src/lib/dons-config.ts et .env.example), chaque ligne de cette table
-- représente une INTENTION de don que l'équipe peut utiliser pour
-- recontacter le donateur manuellement — jamais un paiement réellement
-- effectué. Le statut par défaut 'en_attente_configuration' reflète
-- précisément cela. Une fois nyole configuré : 'initie' (session de
-- paiement créée, donateur redirigé), puis 'reussi'/'echoue'/'annule'/
-- 'rembourse' selon la confirmation reçue par webhook signé.

do $$ begin
  create type don_statut as enum (
    'en_attente_configuration',
    'initie',
    'en_attente',
    'reussi',
    'echoue'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.dons (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  montant integer not null,
  devise text not null default 'XOF',
  email text not null,
  operateur text not null,
  telephone text not null,
  statut don_statut not null default 'en_attente_configuration',
  -- Référence renvoyée par le prestataire une fois une intégration réelle
  -- branchée — toujours nulle tant que don_statut reste à sa valeur par
  -- défaut.
  reference_prestataire text,
  notes_internes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dons_statut_idx on public.dons (statut);
create index if not exists dons_created_at_idx on public.dons (created_at desc);

drop trigger if exists dons_set_updated_at on public.dons;
create trigger dons_set_updated_at
  before update on public.dons
  for each row execute function public.set_updated_at();

alter table public.dons enable row level security;

-- Migration additive — prestataire de paiement retenu : nyole
-- (https://nyole.com). Le donateur choisit son opérateur Mobile Money ou
-- sa carte bancaire sur la page de paiement hébergée par nyole : nos
-- propres champs "operateur"/"telephone" ne sont donc plus obligatoires
-- (le téléphone reste collecté, en option, pour préremplir cette page).
-- "annule" (paiement abandonné/annulé) et "rembourse" (remboursement fait
-- par l'équipe nyole) complètent les statuts déjà prévus.
alter table public.dons alter column operateur drop not null;
alter table public.dons alter column telephone drop not null;
alter table public.dons add column if not exists nyole_session_id text;

alter type don_statut add value if not exists 'annule';
alter type don_statut add value if not exists 'rembourse';
