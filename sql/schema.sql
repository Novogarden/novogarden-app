-- =====================================================================
--  NOVOGARDEN — Espaces partenaires (apporteur d'affaires / prestataire)
--  Schema Supabase : tables, RLS, fonctions, triggers, stockage.
--  ---------------------------------------------------------------------
--  A executer d'un bloc dans Supabase > SQL Editor.
--  Le script est idempotent : il peut etre rejoue sans casse.
--
--  Principe de securite : le client n'ecrit JAMAIS directement dans
--  leads / missions / comptes_rendus. Il passe par des fonctions
--  SECURITY DEFINER qui valident les regles metier. Les lectures
--  passent par RLS, et l'apporteur lit une vue restreinte qui
--  n'expose ni email ni telephone de ses filleuls.
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. PROFILS
-- =====================================================================

create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  prenom             text not null default '',
  nom                text not null default '',
  email              text not null default '',
  telephone          text,
  is_apporteur       boolean not null default false,
  is_prestataire     boolean not null default false,
  -- Spec 11 : le role prestataire n'ouvre l'acces aux missions
  -- qu'apres validation par l'admin.
  prestataire_valide boolean not null default false,
  is_admin           boolean not null default false,
  code_apporteur     text unique,
  rgpd_accepte_le    timestamptz,
  compte_supprime    boolean not null default false,
  created_at         timestamptz not null default now()
);

-- Raccourci utilise par toutes les policies. STABLE + SECURITY DEFINER
-- pour eviter une recursion RLS sur profiles.
create or replace function public.est_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.est_prestataire_valide()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_prestataire and prestataire_valide
                   from public.profiles where id = auth.uid()), false);
$$;

-- Creation automatique du profil a l'inscription.
create or replace function public.gerer_nouvel_utilisateur()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, prenom, nom, email, telephone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'prenom', ''),
    coalesce(new.raw_user_meta_data->>'nom', ''),
    coalesce(new.email, ''),
    new.raw_user_meta_data->>'telephone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.gerer_nouvel_utilisateur();

-- Verrou : personne ne s'auto-promeut admin, ne se valide comme
-- prestataire, ni ne se forge un code apporteur. Seul le service_role
-- (donc l'admin via une fonction dediee) peut toucher a ces colonnes.
create or replace function public.proteger_colonnes_sensibles()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.est_admin() then
    return new;
  end if;
  new.is_admin           := old.is_admin;
  new.prestataire_valide := old.prestataire_valide;
  new.code_apporteur     := old.code_apporteur;
  new.compte_supprime    := old.compte_supprime;
  return new;
end;
$$;

drop trigger if exists proteger_profil on public.profiles;
create trigger proteger_profil
  before update on public.profiles
  for each row execute function public.proteger_colonnes_sensibles();

-- =====================================================================
-- 2. BAREME DES COMMISSIONS
--    Ecart assume a la spec 6 : le bareme est une table plutot qu'une
--    constante JS. Le calcul se fait dans un trigger cote base (il ne
--    peut donc pas lire une constante du front), et l'admin peut le
--    modifier sans redeployer. La table reste l'unique source.
-- =====================================================================

create table if not exists public.bareme_commissions (
  pack    text primary key,
  montant numeric(10,2) not null,
  libelle text not null
);

insert into public.bareme_commissions (pack, montant, libelle) values
  ('solo',      0,  'Solo (1 tonte) — hors dispositif'),
  ('essentiel', 20, 'Essentiel (5 tontes)'),
  ('serenite',  40, 'Sérénité (10 tontes)'),
  ('autre',     0,  'Autre prestation — hors dispositif')
on conflict (pack) do update
  set montant = excluded.montant, libelle = excluded.libelle;

-- =====================================================================
-- 3. LEADS
-- =====================================================================

create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  apporteur_id        uuid references public.profiles(id) on delete set null,
  code_apporteur      text,
  client_prenom       text not null default '',
  client_nom          text not null default '',
  client_email        text,
  client_telephone    text,
  commune             text,
  surface_m2          integer,
  pack                text not null default 'autre'
                      check (pack in ('solo','essentiel','serenite','autre')),
  montant_ttc         numeric(10,2),
  statut              text not null default 'nouveau'
                      check (statut in ('nouveau','contacte','devis_envoye',
                                        'confirme','encaisse','commission_versee','perdu')),
  commission_montant  numeric(10,2) not null default 0,
  date_attribution    timestamptz,
  date_encaissement   timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists leads_apporteur_idx on public.leads(apporteur_id);
create index if not exists leads_email_idx     on public.leads(lower(client_email));

-- Calcul automatique de la commission au passage en "confirme".
-- Spec 6 : premiere commande uniquement, commission versee apres encaissement.
create or replace function public.calculer_commission()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  m numeric(10,2);
begin
  if new.statut = 'confirme' and coalesce(old.statut,'') <> 'confirme' then
    if new.apporteur_id is null then
      new.commission_montant := 0;
    else
      select montant into m from public.bareme_commissions where pack = new.pack;
      new.commission_montant := coalesce(m, 0);
    end if;
  end if;

  if new.statut = 'encaisse' and coalesce(old.statut,'') <> 'encaisse'
     and new.date_encaissement is null then
    new.date_encaissement := now();
  end if;

  return new;
end;
$$;

drop trigger if exists commission_auto on public.leads;
create trigger commission_auto
  before update on public.leads
  for each row execute function public.calculer_commission();

-- Creation d'un lead depuis le tunnel public (visiteur non connecte).
-- SECURITY DEFINER : le client n'a aucun droit d'ecriture direct sur leads.
-- Retourne le statut d'attribution pour information, jamais d'erreur
-- bloquante : une reservation ne doit jamais echouer a cause du code.
create or replace function public.creer_lead(
  p_code       text,
  p_prenom     text,
  p_nom        text,
  p_email      text,
  p_telephone  text,
  p_commune    text,
  p_surface    integer,
  p_pack       text,
  p_montant    numeric
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_apporteur uuid;
  v_deja      boolean;
  v_pack      text;
begin
  v_pack := lower(coalesce(nullif(trim(p_pack), ''), 'autre'));
  if v_pack not in ('solo','essentiel','serenite','autre') then
    v_pack := 'autre';
  end if;

  -- Regle "premiere commande uniquement" : un email deja connu dans
  -- leads n'est plus attribuable a un apporteur.
  select exists(
    select 1 from public.leads
    where client_email is not null
      and lower(client_email) = lower(coalesce(p_email,''))
  ) into v_deja;

  if not v_deja and coalesce(trim(p_code),'') <> '' then
    select id into v_apporteur
    from public.profiles
    where code_apporteur = upper(trim(p_code))
      and is_apporteur = true
      and compte_supprime = false;
  end if;

  insert into public.leads (
    apporteur_id, code_apporteur, client_prenom, client_nom,
    client_email, client_telephone, commune, surface_m2, pack,
    montant_ttc, statut, date_attribution
  ) values (
    v_apporteur, nullif(upper(trim(coalesce(p_code,''))), ''),
    coalesce(p_prenom,''), coalesce(p_nom,''),
    nullif(trim(coalesce(p_email,'')), ''), nullif(trim(coalesce(p_telephone,'')), ''),
    p_commune, p_surface, v_pack, p_montant, 'nouveau',
    case when v_apporteur is not null then now() end
  );

  return jsonb_build_object(
    'enregistre', true,
    'attribue',   v_apporteur is not null,
    'raison',     case
                    when coalesce(trim(p_code),'') = '' then 'aucun_code'
                    when v_deja then 'client_deja_connu'
                    when v_apporteur is null then 'code_inconnu'
                    else 'ok'
                  end
  );
end;
$$;

-- Vue restreinte pour l'apporteur (spec 4 : ni email ni telephone).
-- security_invoker reste a false : la vue filtre elle-meme sur auth.uid(),
-- et leads n'est pas lisible directement par les utilisateurs.
create or replace view public.leads_apporteur as
  select
    l.id,
    l.client_prenom
      || case when coalesce(l.client_nom,'') <> ''
              then ' ' || upper(left(l.client_nom, 1)) || '.' else '' end
      as filleul,
    l.commune,
    l.pack,
    l.statut,
    case l.statut
      when 'nouveau'            then 'En cours'
      when 'contacte'           then 'En cours'
      when 'devis_envoye'       then 'En cours'
      when 'confirme'           then 'Confirmé'
      when 'encaisse'           then 'À verser'
      when 'commission_versee'  then 'Versé'
      when 'perdu'              then 'Non abouti'
      else 'En cours'
    end as statut_affiche,
    l.commission_montant,
    l.created_at
  from public.leads l
  where l.apporteur_id = auth.uid();

-- =====================================================================
-- 4. MISSIONS
-- =====================================================================

create table if not exists public.missions (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid references public.leads(id) on delete set null,
  titre                    text not null default '',
  type_prestation          text not null default 'tonte'
                           check (type_prestation in ('tonte','drone','impression_3d','modelisation')),
  commune                  text,
  code_postal              text,
  surface_m2               integer,
  description              text,
  date_souhaitee           date,
  remuneration_prestataire numeric(10,2) not null default 0,
  statut                   text not null default 'ouverte'
                           check (statut in ('ouverte','acceptee','en_cours','terminee','annulee')),
  prestataire_id           uuid references public.profiles(id) on delete set null,
  date_acceptation         timestamptz,
  created_at               timestamptz not null default now()
);

create index if not exists missions_statut_idx      on public.missions(statut);
create index if not exists missions_prestataire_idx on public.missions(prestataire_id);

-- Acceptation atomique (spec 8.1 et critere 5) : l'UPDATE conditionnel
-- sur statut = 'ouverte' garantit qu'un seul prestataire l'emporte.
create or replace function public.accepter_mission(p_mission uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ok integer;
begin
  if not public.est_prestataire_valide() then
    return jsonb_build_object('ok', false, 'raison', 'non_valide');
  end if;

  update public.missions
     set statut = 'acceptee',
         prestataire_id = auth.uid(),
         date_acceptation = now()
   where id = p_mission
     and statut = 'ouverte'
     and prestataire_id is null;

  get diagnostics v_ok = row_count;

  if v_ok = 0 then
    return jsonb_build_object('ok', false, 'raison', 'deja_attribuee');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Changement d'etat par le prestataire assigne (acceptee -> en_cours).
create or replace function public.demarrer_mission(p_mission uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_ok integer;
begin
  update public.missions
     set statut = 'en_cours'
   where id = p_mission and prestataire_id = auth.uid() and statut = 'acceptee';
  get diagnostics v_ok = row_count;
  return jsonb_build_object('ok', v_ok > 0);
end;
$$;

-- =====================================================================
-- 5. COMPTES RENDUS
-- =====================================================================

create table if not exists public.comptes_rendus (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null unique references public.missions(id) on delete cascade,
  prestataire_id uuid not null references public.profiles(id) on delete cascade,
  commentaire    text,
  duree_minutes  integer,
  created_at     timestamptz not null default now()
);

create table if not exists public.cr_photos (
  id               uuid primary key default gen_random_uuid(),
  compte_rendu_id  uuid not null references public.comptes_rendus(id) on delete cascade,
  storage_path     text not null,
  type             text not null check (type in ('avant','apres')),
  created_at       timestamptz not null default now()
);

-- Depot du compte-rendu : cree la ligne, rattache les photos deja
-- televersees et bascule la mission en "terminee", le tout en une
-- transaction. Le compte-rendu est ensuite non modifiable (spec 8.3) :
-- aucune policy UPDATE n'existe sur la table.
create or replace function public.deposer_compte_rendu(
  p_mission     uuid,
  p_commentaire text,
  p_duree       integer,
  p_photos      jsonb   -- [{"chemin":"...","type":"avant"}, ...]
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_cr    uuid;
  v_photo jsonb;
begin
  if not exists (select 1 from public.missions
                  where id = p_mission and prestataire_id = auth.uid()
                    and statut in ('acceptee','en_cours')) then
    return jsonb_build_object('ok', false, 'raison', 'mission_non_autorisee');
  end if;

  if exists (select 1 from public.comptes_rendus where mission_id = p_mission) then
    return jsonb_build_object('ok', false, 'raison', 'deja_depose');
  end if;

  insert into public.comptes_rendus (mission_id, prestataire_id, commentaire, duree_minutes)
  values (p_mission, auth.uid(), nullif(trim(coalesce(p_commentaire,'')), ''), p_duree)
  returning id into v_cr;

  if p_photos is not null then
    for v_photo in select * from jsonb_array_elements(p_photos) loop
      insert into public.cr_photos (compte_rendu_id, storage_path, type)
      values (v_cr, v_photo->>'chemin',
              case when v_photo->>'type' = 'apres' then 'apres' else 'avant' end);
    end loop;
  end if;

  update public.missions set statut = 'terminee' where id = p_mission;
  return jsonb_build_object('ok', true, 'compte_rendu', v_cr);
end;
$$;

-- =====================================================================
-- 6. RGPD — suppression de compte (spec 12)
--    On anonymise, on ne supprime pas : l'historique metier (commissions,
--    missions realisees) doit rester coherent. La ligne auth.users doit
--    ensuite etre supprimee par l'admin depuis le tableau de bord
--    Supabase — le client n'a pas ce droit.
-- =====================================================================

create or replace function public.supprimer_mon_compte()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid := auth.uid();
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'raison', 'non_connecte');
  end if;

  update public.leads
     set client_prenom = 'Client', client_nom = 'anonymisé',
         client_email = null, client_telephone = null
   where lower(client_email) = (select lower(email) from public.profiles where id = v_id);

  update public.profiles
     set prenom = 'Compte', nom = 'supprimé',
         email = 'supprime+' || left(v_id::text, 8) || '@novogardenhub.com',
         telephone = null, is_apporteur = false, is_prestataire = false,
         prestataire_valide = false, code_apporteur = null, compte_supprime = true
   where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- 7. ADMINISTRATION
-- =====================================================================

-- Retrait des accents sans dependre de l'extension unaccent
-- (pas toujours activable selon le plan Supabase).
create or replace function public.unaccent_simple(t text)
returns text language sql immutable as $$
  select translate(coalesce(t,''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY');
$$;

-- Generation d'un code apporteur unique : PRENOM-XXX
create or replace function public.generer_code_apporteur(p_profil uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_base   text;
  v_code   text;
  v_essais integer := 0;
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administrateur';
  end if;

  select upper(regexp_replace(unaccent_simple(prenom), '[^A-Za-z]', '', 'g'))
    into v_base from public.profiles where id = p_profil;
  v_base := nullif(left(coalesce(v_base,''), 10), '');
  if v_base is null then v_base := 'PARTENAIRE'; end if;

  loop
    v_code := v_base || '-' ||
      upper(substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=', 'XYZ'), 1, 3));
    exit when not exists (select 1 from public.profiles where code_apporteur = v_code);
    v_essais := v_essais + 1;
    if v_essais > 50 then
      raise exception 'Impossible de générer un code unique';
    end if;
  end loop;

  update public.profiles set code_apporteur = v_code where id = p_profil;
  return v_code;
end;
$$;

-- Bascule des roles par l'admin.
create or replace function public.definir_roles(
  p_profil uuid, p_apporteur boolean, p_prestataire boolean, p_valide boolean
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_code text;
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administrateur';
  end if;

  update public.profiles
     set is_apporteur = coalesce(p_apporteur, is_apporteur),
         is_prestataire = coalesce(p_prestataire, is_prestataire),
         prestataire_valide = coalesce(p_valide, prestataire_valide)
   where id = p_profil;

  select code_apporteur into v_code from public.profiles where id = p_profil;
  if p_apporteur and v_code is null then
    v_code := public.generer_code_apporteur(p_profil);
  end if;

  return jsonb_build_object('ok', true, 'code_apporteur', v_code);
end;
$$;

-- =====================================================================
-- 8. RLS
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.leads             enable row level security;
alter table public.missions          enable row level security;
alter table public.comptes_rendus    enable row level security;
alter table public.cr_photos         enable row level security;
alter table public.bareme_commissions enable row level security;

-- --- profiles ---
drop policy if exists profils_lecture       on public.profiles;
drop policy if exists profils_maj           on public.profiles;
drop policy if exists profils_admin_lecture on public.profiles;
drop policy if exists profils_admin_maj     on public.profiles;

create policy profils_lecture on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profils_maj on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profils_admin_lecture on public.profiles
  for select to authenticated using (public.est_admin());
create policy profils_admin_maj on public.profiles
  for update to authenticated using (public.est_admin());

-- --- leads : aucun acces direct hors admin. L'apporteur lit la vue. ---
drop policy if exists leads_admin on public.leads;
create policy leads_admin on public.leads
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- Attention : RLS s'applique PAR-DESSUS les GRANT. Retirer le GRANT a
-- "authenticated" bloquerait aussi l'admin, dont la policy ne suffirait
-- plus. On garde donc le GRANT et c'est la policy qui filtre : seul
-- l'admin voit des lignes, les autres en voient zero.
revoke all on public.leads from anon;
grant select, insert, update, delete on public.leads to authenticated;
grant select on public.leads_apporteur to authenticated;
revoke all on public.leads_apporteur from anon;

-- --- missions ---
drop policy if exists missions_ouvertes on public.missions;
drop policy if exists missions_miennes  on public.missions;
drop policy if exists missions_admin    on public.missions;

create policy missions_ouvertes on public.missions
  for select to authenticated
  using (statut = 'ouverte' and prestataire_id is null and public.est_prestataire_valide());
create policy missions_miennes on public.missions
  for select to authenticated using (prestataire_id = auth.uid());
create policy missions_admin on public.missions
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- --- comptes rendus ---
drop policy if exists cr_lecture on public.comptes_rendus;
drop policy if exists cr_admin   on public.comptes_rendus;
create policy cr_lecture on public.comptes_rendus
  for select to authenticated using (prestataire_id = auth.uid());
create policy cr_admin on public.comptes_rendus
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

drop policy if exists photos_lecture on public.cr_photos;
drop policy if exists photos_admin   on public.cr_photos;
create policy photos_lecture on public.cr_photos
  for select to authenticated using (
    exists (select 1 from public.comptes_rendus c
             where c.id = cr_photos.compte_rendu_id and c.prestataire_id = auth.uid()));
create policy photos_admin on public.cr_photos
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- --- bareme : lisible par tous (affiche dans "Comment ca marche") ---
drop policy if exists bareme_lecture on public.bareme_commissions;
drop policy if exists bareme_admin   on public.bareme_commissions;
create policy bareme_lecture on public.bareme_commissions
  for select to anon, authenticated using (true);
create policy bareme_admin on public.bareme_commissions
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- =====================================================================
-- 9. DROITS D'EXECUTION DES FONCTIONS
-- =====================================================================

revoke all on function public.creer_lead(text,text,text,text,text,text,integer,text,numeric) from public;
grant execute on function public.creer_lead(text,text,text,text,text,text,integer,text,numeric) to anon, authenticated;

grant execute on function public.accepter_mission(uuid)      to authenticated;
grant execute on function public.demarrer_mission(uuid)      to authenticated;
grant execute on function public.deposer_compte_rendu(uuid,text,integer,jsonb) to authenticated;
grant execute on function public.supprimer_mon_compte()      to authenticated;
grant execute on function public.definir_roles(uuid,boolean,boolean,boolean) to authenticated;
grant execute on function public.generer_code_apporteur(uuid) to authenticated;

-- =====================================================================
-- 10. STOCKAGE — bucket prive des photos de compte-rendu
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('comptes-rendus', 'comptes-rendus', false)
on conflict (id) do update set public = false;

drop policy if exists cr_upload  on storage.objects;
drop policy if exists cr_lire    on storage.objects;
drop policy if exists cr_admin_s on storage.objects;

-- Chaque prestataire televerse dans son propre dossier : <uid>/<mission>/...
create policy cr_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comptes-rendus'
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy cr_lire on storage.objects
  for select to authenticated
  using (bucket_id = 'comptes-rendus'
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy cr_admin_s on storage.objects
  for all to authenticated
  using (bucket_id = 'comptes-rendus' and public.est_admin());

-- =====================================================================
-- FIN
-- =====================================================================
