-- =====================================================================
--  NOVOGARDEN — Migration 01
--  Generalisation du parrainage et des missions aux 6 prestations
--  ---------------------------------------------------------------------
--  A executer d'un bloc dans Supabase > SQL Editor, apres sql/schema.sql.
--  Idempotent : rejouable sans casse.
--
--  Ce qui change :
--   1. La commission passe d'un montant fixe par pack a un POURCENTAGE
--      du montant TTC, identique pour les 6 services (15 % par defaut).
--      Le pack Solo n'est plus exclu : un petit montant donne une petite
--      commission, sans regle d'exception a maintenir.
--   2. Les leads portent le service concerne, et plus seulement un pack
--      pense pour la tonte.
--   3. Les missions acceptent les 6 prestations reelles. L'identifiant
--      "impression_3d" devient "impression", pour coller a data/pricing.json.
-- =====================================================================

-- =====================================================================
-- 1. REGLAGES — un seul endroit pour le taux
-- =====================================================================

create table if not exists public.reglages (
  cle     text primary key,
  valeur  numeric(10,4) not null,
  libelle text not null
);

insert into public.reglages (cle, valeur, libelle) values
  ('taux_commission', 0.15, 'Commission apporteur, en part du montant TTC')
on conflict (cle) do nothing;   -- ne pas ecraser un taux deja ajuste

alter table public.reglages enable row level security;

drop policy if exists reglages_lecture on public.reglages;
drop policy if exists reglages_admin   on public.reglages;

-- Le taux est affiche dans « Comment ca marche » : lisible par tous.
create policy reglages_lecture on public.reglages
  for select to anon, authenticated using (true);
create policy reglages_admin on public.reglages
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- =====================================================================
-- 2. LEADS — le service concerne
-- =====================================================================

alter table public.leads add column if not exists service text;

-- Les leads existants viennent tous du tunnel tonte.
update public.leads set service = 'tonte' where service is null;

alter table public.leads alter column service set default 'tonte';

do $$ begin
  alter table public.leads add constraint leads_service_valide
    check (service in ('tonte','topographie','modelisation','impression','drone','etude-flux'));
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 3. COMMISSION — pourcentage du montant TTC
-- =====================================================================

create or replace function public.calculer_commission()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  t numeric;
begin
  -- Une commission versee est definitive : on ne la recalcule jamais,
  -- meme si l'admin corrige le montant apres coup.
  if coalesce(old.statut, '') = 'commission_versee' then
    new.commission_montant := old.commission_montant;
    return new;
  end if;

  select valeur into t from public.reglages where cle = 'taux_commission';
  t := coalesce(t, 0);

  if new.apporteur_id is null then
    new.commission_montant := 0;
  elsif new.statut in ('confirme', 'encaisse', 'commission_versee') then
    -- Recalcule a chaque mise a jour tant que ce n'est pas verse :
    -- l'admin saisit souvent le montant apres avoir passe le lead
    -- en « confirme ».
    new.commission_montant := round(coalesce(new.montant_ttc, 0) * t, 2);
  else
    new.commission_montant := 0;
  end if;

  if new.statut = 'encaisse' and coalesce(old.statut, '') <> 'encaisse'
     and new.date_encaissement is null then
    new.date_encaissement := now();
  end if;

  return new;
end;
$$;

-- L'ancienne table par pack n'a plus d'usage : le taux la remplace.
drop table if exists public.bareme_commissions;

-- =====================================================================
-- 4. CREATION DE LEAD — accepte le service
-- =====================================================================

drop function if exists public.creer_lead(text,text,text,text,text,text,integer,text,numeric);

create or replace function public.creer_lead(
  p_code       text,
  p_prenom     text,
  p_nom        text,
  p_email      text,
  p_telephone  text,
  p_commune    text,
  p_surface    integer,
  p_pack       text,
  p_montant    numeric,
  p_service    text default 'tonte'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_apporteur uuid;
  v_deja      boolean;
  v_pack      text;
  v_service   text;
begin
  v_pack := lower(coalesce(nullif(trim(p_pack), ''), 'autre'));
  if v_pack not in ('solo','essentiel','serenite','autre') then
    v_pack := 'autre';
  end if;

  v_service := lower(coalesce(nullif(trim(p_service), ''), 'tonte'));
  -- data/services.json dit « flux », la grille tarifaire « etude-flux ».
  if v_service = 'flux' then v_service := 'etude-flux'; end if;
  if v_service not in ('tonte','topographie','modelisation','impression','drone','etude-flux') then
    v_service := 'tonte';
  end if;

  -- Premiere commande uniquement : un email deja connu n'est plus attribuable.
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
    client_email, client_telephone, commune, surface_m2, pack, service,
    montant_ttc, statut, date_attribution
  ) values (
    v_apporteur, nullif(upper(trim(coalesce(p_code,''))), ''),
    coalesce(p_prenom,''), coalesce(p_nom,''),
    nullif(trim(coalesce(p_email,'')), ''), nullif(trim(coalesce(p_telephone,'')), ''),
    p_commune, p_surface, v_pack, v_service, p_montant, 'nouveau',
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

revoke all on function public.creer_lead(text,text,text,text,text,text,integer,text,numeric,text) from public;
grant execute on function public.creer_lead(text,text,text,text,text,text,integer,text,numeric,text) to anon, authenticated;

-- =====================================================================
-- 5. VUE APPORTEUR — expose le service, toujours sans coordonnees
-- =====================================================================

drop view if exists public.leads_apporteur;

create view public.leads_apporteur as
  select
    l.id,
    l.client_prenom
      || case when coalesce(l.client_nom,'') <> ''
              then ' ' || upper(left(l.client_nom, 1)) || '.' else '' end
      as filleul,
    l.commune,
    l.service,
    case l.service
      when 'tonte'        then 'Tonte robotisée'
      when 'topographie'  then 'Topographie 3D'
      when 'modelisation' then 'Modélisation 3D'
      when 'impression'   then 'Impression prototype'
      when 'drone'        then 'Prestation drone'
      when 'etude-flux'   then 'Étude de flux'
      else l.service
    end as service_libelle,
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

grant select on public.leads_apporteur to authenticated;
revoke all on public.leads_apporteur from anon;

-- =====================================================================
-- 6. MISSIONS — les 6 prestations reelles
-- =====================================================================

update public.missions set type_prestation = 'impression'
 where type_prestation = 'impression_3d';

alter table public.missions drop constraint if exists missions_type_prestation_check;

alter table public.missions add constraint missions_type_prestation_check
  check (type_prestation in ('tonte','topographie','modelisation','impression','drone','etude-flux'));

-- =====================================================================
-- CONTROLES
-- =====================================================================

select
  (select valeur from public.reglages where cle='taux_commission') as taux,
  (select count(*) from public.leads)                              as leads,
  (select count(*) from information_schema.columns
    where table_name='leads' and column_name='service')            as colonne_service,
  (select count(*) from public.missions)                           as missions;
