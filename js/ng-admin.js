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
  var TYPES = {
    'tonte':        'Tonte robotisée',
    'topographie':  'Topographie 3D',
    'modelisation': 'Modélisation 3D',
    'impression':   'Impression prototype',
    'drone':        'Prestation drone',
    'etude-flux':   'Étude de flux'
  };
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
      + tab('couverture', 'Couverture')
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
    else if (onglet === 'cr') sectionCR();
    else sectionCouverture();
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
            + '<div class="ngp-note">Partenaire : '
            + P.esc(d.apporteur ? (d.apporteur.prenom + ' ' + d.apporteur.nom
                + ' (' + (d.apporteur.code_apporteur || '—') + ')') : 'aucun')
            + (d.code_apporteur && !d.apporteur ? ' — code saisi : ' + P.esc(d.code_apporteur) : '')
            + '</div>'
            + '<div class="ngp-note">Prestation : '
            + P.esc(TYPES[d.service] || d.service || '—') + '</div>'
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

  /* ---------- Creation d'une mission ---------- */

  /* Tout ce qui decrit la prestation vient de la grille tarifaire. On ne
     tape plus « tonte 2000 m² » a la main : on choisit une tranche qui
     existe, et le titre comme la description s'en deduisent. Une mission
     ne peut donc pas decrire une prestation que Novogarden ne vend pas. */
  function GR() { return global.NGPricing; }

  function formulaireMission() {
    return '<details class="ngp-details" open><summary>Créer une mission</summary>'
      + '<div class="ngp-carte" style="margin-top:10px">'
      + '<label class="flabel">Prestation</label>'
      + '<select class="finput" id="mi-type">'
      + ORDRE_SVC.map(function (id) {
          return '<option value="' + id + '">' + P.esc(TYPES[id] || id) + '</option>';
        }).join('')
      + '</select>'
      + '<div id="mi-zone"></div>'
      + '<div class="ngp-grille2">'
      + '<div><label class="flabel">Commune</label><input class="finput" id="mi-commune" type="text"></div>'
      + '<div><label class="flabel">Code postal</label><input class="finput" id="mi-cp" type="text" maxlength="5"></div>'
      + '</div>'
      + '<label class="flabel">Date souhaitée</label><input class="finput" id="mi-date" type="date">'
      + '<label class="flabel">Précisions pour le prestataire (optionnel)</label>'
      + '<textarea class="finput" id="mi-desc" rows="2" style="resize:none"></textarea>'
      + '<div class="err-msg" id="mi-err"></div>'
      + '<button class="btn-p" id="mi-creer">Créer la mission</button>'
      + '</div></details>';
  }

  /* Les champs qui dependent de la prestation choisie sont reconstruits a
     chaque changement : formule, tranche et options n'ont pas le meme sens
     d'un metier a l'autre. */
  function majZoneMission(z) {
    var zone = z.querySelector('#mi-zone'); if (!zone) return;
    var id = z.querySelector('#mi-type').value;
    var G = GR();
    if (!G || !G.isReady()) { zone.innerHTML = '<p class="ngp-note">Grille tarifaire indisponible.</p>'; return; }
    var s = G.getService(id) || {};
    var tranches = G.getTranches(id) || [];
    var h = '';

    if (G.hasPaliers(id)) {
      h += '<label class="flabel">Formule</label><select class="finput" id="mi-palier">'
        + G.getPaliers().map(function (p) {
            return '<option value="' + p.id + '">' + P.esc(p.nom) + '</option>';
          }).join('') + '</select>';
    }

    if (tranches.length) {
      h += '<label class="flabel">' + P.esc(G.labelCritere(id)) + '</label>'
        + '<select class="finput" id="mi-tranche">'
        + tranches.map(function (t, k) {
            return '<option value="' + k + '">' + P.esc(t.label) + '</option>';
          }).join('') + '</select>';
    }

    if ((s.options || []).length) {
      h += '<label class="flabel">Options</label><div style="margin:2px 0 10px">';
      s.options.forEach(function (o, k) {
        h += '<label class="ngp-check" style="margin:0 0 4px"><input type="checkbox" data-mi-opt="' + k + '">'
          + ' <span style="font-size:13px">' + P.esc(o.label) + '</span></label>';
      });
      h += '</div>';
    }

    h += '<div class="ngp-ligne" style="margin:6px 0 2px">'
      + '<span class="ngp-k">Prix client indicatif</span>'
      + '<span class="ngp-v" id="mi-prix">—</span></div>'
      + '<label class="flabel">Rémunération du prestataire (€)</label>'
      + '<input class="finput" id="mi-remu" type="number" step="0.01" min="0">'
      + '<p class="ngp-note" style="margin:4px 0 0">Le prix client vient de la grille. '
      + 'La rémunération se fixe librement : c\'est votre marge.</p>';

    zone.innerHTML = h;
    zone.querySelectorAll('select, [data-mi-opt]').forEach(function (e) {
      e.addEventListener('change', function () { majPrixMission(z); });
    });
    majPrixMission(z);
  }

  function lectureMission(z) {
    var id = z.querySelector('#mi-type').value;
    var G = GR();
    var pal = z.querySelector('#mi-palier');
    var tr = z.querySelector('#mi-tranche');
    var opts = [];
    z.querySelectorAll('[data-mi-opt]').forEach(function (c) {
      if (c.checked) opts.push(parseInt(c.getAttribute('data-mi-opt'), 10));
    });
    return {
      id: id,
      palier: pal ? pal.value : 'solo',
      trancheIndex: tr ? parseInt(tr.value, 10) : null,
      tranche: tr ? (G.getTranches(id)[parseInt(tr.value, 10)] || null) : null,
      options: opts,
      service: G.getService(id) || {}
    };
  }

  function majPrixMission(z) {
    var e = z.querySelector('#mi-prix'); if (!e) return;
    var d = lectureMission(z);
    var r = GR().computePrice({ serviceId: d.id, trancheIndex: d.trancheIndex,
                                palier: d.palier, options: d.options });
    e.textContent = r.devis ? 'Sur devis' : GR().formatEUR(r.total);
  }

  function brancherFormulaireMission(z) {
    var sel = z.querySelector('#mi-type');
    if (sel) sel.addEventListener('change', function () { majZoneMission(z); });
    majZoneMission(z);

    var b = z.querySelector('#mi-creer');
    if (!b) return;
    b.addEventListener('click', function () {
      var err = z.querySelector('#mi-err');
      var d = lectureMission(z);
      var remuChamp = z.querySelector('#mi-remu');
      var remu = remuChamp ? parseFloat(remuChamp.value) : NaN;
      if (isNaN(remu) || remu < 0) {
        if (err) err.textContent = 'Indiquez la rémunération du prestataire.';
        return;
      }
      if (err) err.textContent = '';

      /* Le titre reprend la prestation et la tranche : un prestataire doit
         comprendre ce qu'on lui propose sans ouvrir la fiche. */
      var titre = (TYPES[d.id] || d.id) + (d.tranche ? ' — ' + d.tranche.label : '');
      var detail = [];
      if (GR().hasPaliers(d.id)) detail.push('Formule : ' + d.palier);
      if (d.tranche) detail.push(GR().labelCritere(d.id) + ' : ' + d.tranche.label);
      d.options.forEach(function (k) {
        var o = (d.service.options || [])[k];
        if (o) detail.push('Option : ' + o.label);
      });
      var saisie = z.querySelector('#mi-desc').value.trim();
      if (saisie) detail.push(saisie);

      /* surface_m2 n'a de sens que si le critere est une surface. */
      var surface = null;
      if (d.tranche && /surface/i.test(GR().labelCritere(d.id) || '')) {
        surface = d.tranche.max || d.tranche.min || null;
      }

      P.client().from('missions').insert({
        titre: titre,
        type_prestation: d.id,
        commune: z.querySelector('#mi-commune').value.trim() || null,
        code_postal: z.querySelector('#mi-cp').value.trim() || null,
        surface_m2: surface,
        remuneration_prestataire: remu,
        date_souhaitee: z.querySelector('#mi-date').value || null,
        description: detail.join(' · ') || null,
        statut: 'ouverte'
      }).then(function (r) {
        if (r.error) { if (err) err.textContent = r.error.message; return; }
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
            + (p.is_apporteur ? ' checked' : '') + '> <span>Partenaire du réseau</span></label>'
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


  /* ---------- Couverture geographique ---------- */

  /* Un apporteur ne voit que les prestations desservies chez lui. La tonte
     et le drone demandent un deplacement ; la modelisation et l'impression
     se traitent a distance, donc partout. */
  var ORDRE_SVC = ['tonte', 'topographie', 'modelisation', 'impression', 'drone', 'etude-flux'];

  function sectionCouverture() {
    var c = corps(); if (!c) return;
    c.innerHTML = '<p class="ngp-note">Chargement…</p>';
    P.client().from('couverture').select('*').order('service').order('departement')
      .then(function (r) {
        if (r.error) { c.innerHTML = '<p class="ngp-note">' + P.esc(r.error.message) + '</p>'; return; }
        var par = {};
        ORDRE_SVC.forEach(function (s) { par[s] = []; });
        (r.data || []).forEach(function (l) { if (par[l.service]) par[l.service].push(l); });

        var h = '<p class="ngp-note" style="margin:0 0 12px">Un apporteur ne peut proposer que les '
              + 'prestations desservies dans son département. « Partout » couvre la France entière.</p>';
        ORDRE_SVC.forEach(function (s) {
          var lignes = par[s];
          var partout = lignes.some(function (l) { return l.departement === 'FR' && l.actif; });
          var deps = lignes.filter(function (l) { return l.actif && l.departement !== 'FR'; })
                           .map(function (l) { return l.departement; });
          h += '<div class="ngp-carte" style="margin-bottom:10px">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">'
            + '<span style="font-weight:800;font-size:14px">' + P.esc(TYPES[s] || s) + '</span>'
            + '<label class="ngp-check" style="margin:0;font-size:12px">'
            + '<input type="checkbox" data-cv-fr="' + s + '"' + (partout ? ' checked' : '') + '>'
            + ' <span>Partout en France</span></label></div>';
          if (!partout) {
            h += '<div style="margin-top:9px;display:flex;flex-wrap:wrap;gap:6px">';
            if (deps.length) {
              deps.forEach(function (d) {
                h += '<button type="button" data-cv-off="' + s + '|' + d + '"'
                  + ' style="border:1px solid #D6E5C4;background:#EDF4E5;color:#2C5F2D;'
                  + 'border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer">'
                  + d + ' ✕</button>';
              });
            } else {
              h += '<span class="ngp-note">Aucun département : cette prestation n’est proposée nulle part.</span>';
            }
            h += '</div><div style="display:flex;gap:8px;margin-top:10px">'
              + '<input class="finput" style="max-width:92px" maxlength="3" inputmode="numeric"'
              + ' placeholder="51" data-cv-in="' + s + '">'
              + '<button type="button" class="ngp-lien" data-cv-add="' + s + '">Ajouter</button></div>';
          }
          h += '</div>';
        });
        c.innerHTML = h;
        brancherCouverture();
      });
  }

  function brancherCouverture() {
    var c = corps(); if (!c) return;

    c.querySelectorAll('[data-cv-fr]').forEach(function (b) {
      b.addEventListener('change', function () {
        var s = b.getAttribute('data-cv-fr');
        majZone(s, 'FR', b.checked);
      });
    });

    c.querySelectorAll('[data-cv-off]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-cv-off').split('|');
        majZone(p[0], p[1], false);
      });
    });

    c.querySelectorAll('[data-cv-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-cv-add');
        var champ = c.querySelector('[data-cv-in="' + s + '"]');
        var d = (champ.value || '').toUpperCase().trim();
        if (!/^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(d)) {
          P.toast('Département invalide : deux chiffres, ou 2A / 2B.');
          return;
        }
        majZone(s, d, true);
      });
    });
  }

  /* Une zone se cree ou se reactive ; la desactiver conserve la ligne,
     ce qui evite de perdre l'historique des reglages. */
  function majZone(service, departement, actif) {
    P.client().from('couverture')
      .upsert({ service: service, departement: departement, actif: actif, maj: new Date().toISOString() },
              { onConflict: 'service,departement' })
      .then(function (r) {
        if (r.error) { P.toast('Refusé : ' + r.error.message); return; }
        P.toast(actif ? 'Zone activée.' : 'Zone retirée.');
        sectionCouverture();
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
