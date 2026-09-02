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
