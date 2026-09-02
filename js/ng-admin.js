/* =====================================================================
   Novogarden — espace Admin partenaires (spec 9)
   ---------------------------------------------------------------------
   Sans cet ecran, aucun statut ne bouge et le dispositif est mort :
   c'est ici que les leads avancent, que les missions naissent et que
   les roles s'activent.

   Quatre sections : Leads · Missions · Partenaires · Comptes-rendus.
   Ecran distinct de l'admin du journal client, qui vit sur #admin.
   ===================================================================== */
(function (global) {
  'use strict';

  var P = null;
  var onglet = 'leads';

  var STATUTS = ['nouveau','contacte','devis_envoye','confirme','encaisse','commission_versee','perdu'];
  var LIB = {
    nouveau: 'Nouveau', contacte: 'Contacté', devis_envoye: 'Devis envoyé',
    confirme: 'Confirmé', encaisse: 'Encaissé',
    commission_versee: 'Commission versée', perdu: 'Perdu'
  };
  var TYPES = { tonte: 'Tonte', drone: 'Drone', impression_3d: 'Impression 3D', modelisation: 'Modélisation' };
  var PACKS = ['solo','essentiel','serenite','autre'];

  function init() { P = global.NGP; return P && P.estConfigure() && P.client(); }

  function ouvrir() {
    if (!init()) return;
    if (!P.role('is_admin')) { P.toast('Réservé à l’administrateur.'); return; }
    var w = P.ecran('partadmin');
    if (!w) return;
    w.innerHTML = '<div class="ngp-wrap"><div class="ngp-chargement">Chargement…</div></div>';
    P.aller('partadmin');
    rendre();
  }

  function rendre() {
    var w = document.getElementById('partadmin');
    if (!w) return;
    var h = '<div class="ngp-wrap"><div class="ngp-head">'
      + '<div class="ngp-titre">Administration</div></div>'
      + '<div class="ngp-tabs">'
      + tab('leads', 'Leads') + tab('missions', 'Missions')
      + tab('partenaires', 'Partenaires') + tab('cr', 'Comptes-rendus')
      + '</div><div id="adm-corps"><div class="ngp-chargement">Chargement…</div></div></div>';
    w.innerHTML = h;
    w.querySelectorAll('[data-adm-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        onglet = this.getAttribute('data-adm-tab');
        rendre();
      });
    });
    if (onglet === 'leads') sectionLeads();
    else if (onglet === 'missions') sectionMissions();
    else if (onglet === 'partenaires') sectionPartenaires();
    else sectionCR();
  }

  function tab(id, libelle) {
    return '<button type="button" class="ngp-tab' + (onglet === id ? ' actif' : '')
      + '" data-adm-tab="' + id + '">' + libelle + '</button>';
  }

  function corps() { return document.getElementById('adm-corps'); }

  /* ---------- Leads ---------- */

  function sectionLeads() {
    P.client().from('leads').select('*, apporteur:profiles!leads_apporteur_id_fkey(prenom,nom,code_apporteur)')
      .order('created_at', { ascending: false }).limit(200)
      .then(function (r) {
        var z = corps(); if (!z) return;
        if (r.error) { z.innerHTML = erreur(r.error.message); return; }
        var l = r.data || [];
        if (!l.length) { z.innerHTML = '<div class="ngp-carte"><p class="ngp-note" style="margin:0">Aucun lead.</p></div>'; return; }
        var h = '';
        l.forEach(function (d) {
          h += '<div class="ngp-carte">'
            + '<div class="ngp-mission-h"><div>'
            + '<div class="ngp-mission-t">' + P.esc(d.client_prenom + ' ' + d.client_nom) + '</div>'
            + '<div class="ngp-note" style="margin:2px 0 0">'
            + P.esc(d.client_email || '—') + ' · ' + P.esc(d.client_telephone || '—') + '<br>'
            + P.esc(d.commune || '—') + (d.surface_m2 ? ' · ' + d.surface_m2 + ' m²' : '')
            + ' · ' + P.dateFr(d.created_at) + '</div></div>'
            + '<div class="ngp-remu">' + P.eur(d.commission_montant) + '</div></div>'
            + '<div class="ngp-note">Apporteur : '
            + P.esc(d.apporteur ? (d.apporteur.prenom + ' ' + d.apporteur.nom
                + ' (' + (d.apporteur.code_apporteur || '—') + ')') : 'aucun')
            + (d.code_apporteur && !d.apporteur ? ' — code saisi : ' + P.esc(d.code_apporteur) : '')
            + '</div>'
            + '<div class="ngp-grille2">'
            + '<div><label class="flabel">Pack</label>' + selectPack(d) + '</div>'
            + '<div><label class="flabel">Montant TTC</label>'
            + '<input class="finput" type="number" step="0.01" value="' + (d.montant_ttc == null ? '' : d.montant_ttc)
            + '" data-adm-montant="' + d.id + '"></div></div>'
            + '<label class="flabel">Statut</label>' + selectStatut(d)
            + '<button type="button" class="ngp-lien" data-adm-lead="' + d.id + '">Enregistrer</button>'
            + '</div>';
        });
        z.innerHTML = h;
        z.querySelectorAll('[data-adm-lead]').forEach(function (b) {
          b.addEventListener('click', function () { majLead(this.getAttribute('data-adm-lead')); });
        });
      });
  }

  function selectPack(d) {
    var h = '<select class="ngp-select" data-adm-pack="' + d.id + '">';
    PACKS.forEach(function (p) {
      h += '<option value="' + p + '"' + (d.pack === p ? ' selected' : '') + '>' + p + '</option>';
    });
    return h + '</select>';
  }

  function selectStatut(d) {
    var h = '<select class="ngp-select" data-adm-statut="' + d.id + '">';
    STATUTS.forEach(function (s) {
      h += '<option value="' + s + '"' + (d.statut === s ? ' selected' : '') + '>' + LIB[s] + '</option>';
    });
    return h + '</select>';
  }

  function majLead(id) {
    var pack = document.querySelector('[data-adm-pack="' + id + '"]').value;
    var statut = document.querySelector('[data-adm-statut="' + id + '"]').value;
    var montant = document.querySelector('[data-adm-montant="' + id + '"]').value;
    P.client().from('leads').update({
      pack: pack, statut: statut,
      montant_ttc: montant === '' ? null : Number(montant)
    }).eq('id', id).then(function (r) {
      if (r.error) { P.toast('Erreur : ' + r.error.message); return; }
      P.toast('Lead mis à jour.');
      sectionLeads();
    });
  }

  /* ---------- Missions ---------- */

  function sectionMissions() {
    P.client().from('missions').select('*, prestataire:profiles!missions_prestataire_id_fkey(prenom,nom)')
      .order('created_at', { ascending: false }).limit(200)
      .then(function (r) {
        var z = corps(); if (!z) return;
        if (r.error) { z.innerHTML = erreur(r.error.message); return; }
        var h = formulaireMission();
        (r.data || []).forEach(function (m) {
          h += '<div class="ngp-carte">'
            + '<div class="ngp-mission-h"><div>'
            + '<div class="ngp-mission-t">' + P.esc(m.titre || TYPES[m.type_prestation]) + '</div>'
            + '<div class="ngp-note" style="margin:2px 0 0">'
            + P.esc(TYPES[m.type_prestation] || m.type_prestation) + ' · '
            + P.esc([m.commune, m.code_postal].filter(Boolean).join(' ') || '—')
            + ' · ' + P.dateFr(m.date_souhaitee) + '<br>Statut : <strong>' + P.esc(m.statut) + '</strong>'
            + (m.prestataire ? ' — ' + P.esc(m.prestataire.prenom + ' ' + m.prestataire.nom) : '')
            + '</div></div><div class="ngp-remu">' + P.eur(m.remuneration_prestataire) + '</div></div>'
            + (m.statut !== 'annulee' && m.statut !== 'terminee'
               ? '<button type="button" class="ngp-lien ngp-danger" data-adm-annuler="' + m.id + '">Annuler la mission</button>'
               : '')
            + '</div>';
        });
        z.innerHTML = h;
        brancherFormulaireMission(z);
        z.querySelectorAll('[data-adm-annuler]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (!confirm('Annuler cette mission ?')) return;
            P.client().from('missions').update({ statut: 'annulee' })
              .eq('id', this.getAttribute('data-adm-annuler'))
              .then(function () { sectionMissions(); });
          });
        });
      });
  }

  function formulaireMission() {
    var h = '<details class="ngp-details" open><summary>Créer une mission</summary>'
      + '<div class="ngp-carte" style="margin-top:10px">'
      + '<label class="flabel">Titre</label><input class="finput" id="mi-titre" type="text">'
      + '<label class="flabel">Type</label><select class="ngp-select" id="mi-type">';
    Object.keys(TYPES).forEach(function (t) { h += '<option value="' + t + '">' + TYPES[t] + '</option>'; });
    h += '</select>'
      + '<div class="ngp-grille2">'
      + '<div><label class="flabel">Commune</label><input class="finput" id="mi-commune" type="text"></div>'
      + '<div><label class="flabel">Code postal</label><input class="finput" id="mi-cp" type="text" maxlength="5"></div>'
      + '</div>'
      + '<div class="ngp-grille2">'
      + '<div><label class="flabel">Surface (m²)</label><input class="finput" id="mi-surface" type="number"></div>'
      + '<div><label class="flabel">Rémunération (€)</label><input class="finput" id="mi-remu" type="number" step="0.01"></div>'
      + '</div>'
      + '<label class="flabel">Date souhaitée</label><input class="finput" id="mi-date" type="date">'
      + '<label class="flabel">Description</label><textarea class="finput" id="mi-desc" rows="3" style="resize:none"></textarea>'
      + '<div class="err-msg" id="mi-err"></div>'
      + '<button class="btn-p" id="mi-creer">Créer la mission</button>'
      + '</div></details>';
    return h;
  }

  function brancherFormulaireMission(z) {
    var b = z.querySelector('#mi-creer');
    if (!b) return;
    b.addEventListener('click', function () {
      var err = z.querySelector('#mi-err');
      var remu = parseFloat(z.querySelector('#mi-remu').value);
      if (isNaN(remu)) { err.textContent = 'La rémunération est obligatoire.'; return; }
      err.textContent = '';
      P.client().from('missions').insert({
        titre: z.querySelector('#mi-titre').value.trim(),
        type_prestation: z.querySelector('#mi-type').value,
        commune: z.querySelector('#mi-commune').value.trim() || null,
        code_postal: z.querySelector('#mi-cp').value.trim() || null,
        surface_m2: parseInt(z.querySelector('#mi-surface').value, 10) || null,
        remuneration_prestataire: remu,
        date_souhaitee: z.querySelector('#mi-date').value || null,
        description: z.querySelector('#mi-desc').value.trim() || null,
        statut: 'ouverte'
      }).then(function (r) {
        if (r.error) { err.textContent = r.error.message; return; }
        P.toast('Mission créée.');
        sectionMissions();
      });
    });
  }

  /* ---------- Partenaires ---------- */

  function sectionPartenaires() {
    P.client().from('profiles').select('*').order('created_at', { ascending: false }).limit(200)
      .then(function (r) {
        var z = corps(); if (!z) return;
        if (r.error) { z.innerHTML = erreur(r.error.message); return; }
        var h = '';
        (r.data || []).forEach(function (p) {
          h += '<div class="ngp-carte">'
            + '<div class="ngp-mission-t">' + P.esc(p.prenom + ' ' + p.nom)
            + (p.is_admin ? ' <span class="ngp-badge ngp-badge-confirme">admin</span>' : '') + '</div>'
            + '<div class="ngp-note" style="margin:2px 0 8px">' + P.esc(p.email)
            + (p.telephone ? ' · ' + P.esc(p.telephone) : '')
            + (p.code_apporteur ? '<br>Code : <strong>' + P.esc(p.code_apporteur) + '</strong>' : '')
            + '</div>'
            + '<label class="ngp-check"><input type="checkbox" data-adm-app="' + p.id + '"'
            + (p.is_apporteur ? ' checked' : '') + '> <span>Apporteur d’affaires</span></label>'
            + '<label class="ngp-check"><input type="checkbox" data-adm-pre="' + p.id + '"'
            + (p.is_prestataire ? ' checked' : '') + '> <span>Prestataire</span></label>'
            + '<label class="ngp-check"><input type="checkbox" data-adm-val="' + p.id + '"'
            + (p.prestataire_valide ? ' checked' : '') + '> <span>Prestataire <strong>validé</strong> '
            + '(donne accès aux missions)</span></label>'
            + '<button type="button" class="ngp-lien" data-adm-roles="' + p.id + '">Enregistrer</button>'
            + '</div>';
        });
        z.innerHTML = h || '<div class="ngp-carte"><p class="ngp-note" style="margin:0">Aucun profil.</p></div>';
        z.querySelectorAll('[data-adm-roles]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = this.getAttribute('data-adm-roles');
            P.client().rpc('definir_roles', {
              p_profil: id,
              p_apporteur: document.querySelector('[data-adm-app="' + id + '"]').checked,
              p_prestataire: document.querySelector('[data-adm-pre="' + id + '"]').checked,
              p_valide: document.querySelector('[data-adm-val="' + id + '"]').checked
            }).then(function (r) {
              if (r.error) { P.toast('Erreur : ' + r.error.message); return; }
              P.toast('Rôles enregistrés' + (r.data && r.data.code_apporteur
                ? ' — code ' + r.data.code_apporteur : '') + '.');
              sectionPartenaires();
            });
          });
        });
      });
  }

  /* ---------- Comptes-rendus ---------- */

  function sectionCR() {
    P.client().from('comptes_rendus')
      .select('*, mission:missions(titre,type_prestation,commune), photos:cr_photos(*)')
      .order('created_at', { ascending: false }).limit(100)
      .then(function (r) {
        var z = corps(); if (!z) return;
        if (r.error) { z.innerHTML = erreur(r.error.message); return; }
        var l = r.data || [];
        if (!l.length) {
          z.innerHTML = '<div class="ngp-carte"><p class="ngp-note" style="margin:0">Aucun compte-rendu.</p></div>';
          return;
        }
        var h = '';
        l.forEach(function (c) {
          h += '<div class="ngp-carte" id="cr-' + c.id + '">'
            + '<div class="ngp-mission-t">'
            + P.esc((c.mission && (c.mission.titre || TYPES[c.mission.type_prestation])) || 'Mission')
            + '</div>'
            + '<div class="ngp-note" style="margin:2px 0 8px">'
            + P.esc((c.mission && c.mission.commune) || '—') + ' · ' + P.dateFr(c.created_at)
            + (c.duree_minutes ? ' · ' + c.duree_minutes + ' min' : '') + '</div>'
            + (c.commentaire ? '<p class="ngp-note">' + P.esc(c.commentaire) + '</p>' : '')
            + '<div class="ngp-vignettes" data-adm-photos="' + c.id + '"></div>'
            + '</div>';
        });
        z.innerHTML = h;
        /* Bucket prive : chaque photo passe par une URL signee courte. */
        l.forEach(function (c) { afficherPhotos(c); });
      });
  }

  function afficherPhotos(c) {
    var zone = document.querySelector('[data-adm-photos="' + c.id + '"]');
    if (!zone || !c.photos || !c.photos.length) return;
    var chemins = c.photos.map(function (p) { return p.storage_path; });
    P.client().storage.from('comptes-rendus').createSignedUrls(chemins, 3600)
      .then(function (r) {
        if (r.error || !r.data) return;
        r.data.forEach(function (u, i) {
          if (!u.signedUrl) return;
          var fig = document.createElement('figure');
          fig.className = 'ngp-fig';
          fig.innerHTML = '<img class="ngp-vignette" src="' + u.signedUrl + '" alt="">'
            + '<figcaption>' + (c.photos[i].type === 'apres' ? 'après' : 'avant') + '</figcaption>';
          zone.appendChild(fig);
        });
      });
  }

  function erreur(m) {
    return '<div class="ngp-carte"><p class="ngp-note" style="margin:0">Erreur : ' + P.esc(m) + '</p></div>';
  }

  function installer() {
    P = global.NGP;
    if (!P) return;
    P.onglets.partadmin = ouvrir;
  }

  global.NGP_ADMIN = { ouvrir: ouvrir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installer);
  else installer();
})(window);
