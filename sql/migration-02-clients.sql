-- =====================================================================
--  NOVOGARDEN — Migration 02 : packs clients, passages, messages
--  ---------------------------------------------------------------------
--  Compteur de tontes par client + notifications dans les deux sens.
--  A executer d'un bloc dans Supabase > SQL Editor (idempotent).
--
--  Regles :
--   - seul l'admin cree les packs et enregistre les passages ;
--   - chaque client ne lit que SES packs, passages et messages ;
--   - un client ne peut ecrire qu'un message "client -> Novogarden" ;
--   - un client ne peut que marquer comme lus les messages recus.
-- =====================================================================

create table if not exists public.client_packs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  libelle     text not null,
  total       integer not null check (total > 0 and total <= 100),
  actif       boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists client_packs_client on public.client_packs(client_id);

create table if not exists public.client_passages (
  id          uuid primary key default gen_random_uuid(),
  pack_id     uuid not null references public.client_packs(id) on delete cascade,
  client_id   uuid not null references public.profiles(id) on delete cascade,
  date        date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists client_passages_pack on public.client_passages(pack_id);

create table if not exists public.client_messages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  de_admin    boolean not null,
  titre       text,
  corps       text not null check (char_length(corps) between 1 and 2000),
  lu          boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists client_messages_client on public.client_messages(client_id, created_at desc);

alter table public.client_packs    enable row level security;
alter table public.client_passages enable row level security;
alter table public.client_messages enable row level security;

grant select, insert, update, delete on public.client_packs, public.client_passages, public.client_messages to authenticated;

-- Packs et passages : lecture par le client concerne, tout pour l'admin.
drop policy if exists packs_lecture on public.client_packs;
drop policy if exists packs_admin   on public.client_packs;
create policy packs_lecture on public.client_packs
  for select using (client_id = auth.uid() or public.est_admin());
create policy packs_admin on public.client_packs
  for all using (public.est_admin()) with check (public.est_admin());

drop policy if exists passages_lecture on public.client_passages;
drop policy if exists passages_admin   on public.client_passages;
create policy passages_lecture on public.client_passages
  for select using (client_id = auth.uid() or public.est_admin());
create policy passages_admin on public.client_passages
  for all using (public.est_admin()) with check (public.est_admin());

-- Messages : lecture des siens ; le client n'ecrit qu'en son nom et
-- jamais un message "de l'admin" ; l'admin fait tout.
drop policy if exists msg_lecture      on public.client_messages;
drop policy if exists msg_client_envoi on public.client_messages;
drop policy if exists msg_admin        on public.client_messages;
create policy msg_lecture on public.client_messages
  for select using (client_id = auth.uid() or public.est_admin());
create policy msg_client_envoi on public.client_messages
  for insert with check (client_id = auth.uid() and de_admin = false and lu = false);
create policy msg_admin on public.client_messages
  for all using (public.est_admin()) with check (public.est_admin());

-- Le client marque comme lus les messages recus de Novogarden.
create or replace function public.marquer_messages_lus()
returns void
language sql security definer set search_path = public
as $$
  update public.client_messages set lu = true
  where client_id = auth.uid() and de_admin = true and lu = false;
$$;
grant execute on function public.marquer_messages_lus() to authenticated;

-- Temps reel : les ecrans se mettent a jour sans recharger.
do $$
begin
  begin alter publication supabase_realtime add table public.client_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.client_passages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.client_packs;    exception when others then null; end;
end $$;
