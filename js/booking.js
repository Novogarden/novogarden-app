/* =====================================================================
   Novogarden — tunnel de réservation générique + grille consultable
   ---------------------------------------------------------------------
   Généralise le parcours de réservation aux 6 services de la grille.
   Tous les prix affichés proviennent de window.NGPricing, donc de
   data/pricing.json : aucun montant n'est écrit en dur dans ce fichier.

   Cas particulier assumé : le service « tonte » conserve son tunnel
   historique (#booking), qui gère le calendrier récurrent, l'écran
   « Mes services » et le solde. Le sélecteur d'étape 0 y redirige.
   Les 5 autres services utilisent le tunnel générique ci-dessous.

   API publique (window.NGBooking) :
     open(serviceId)   -> ouvre le tunnel (étape 0 si serviceId omis)
     grille(serviceId) -> affiche la grille tarifaire du service
     badgeFor(id)      -> badge de tuile issu du JSON
     ficheExtras(id)   -> bloc délai / livrables / grille pour la fiche
   ===================================================================== */
(function (global) {
  'use strict';

  var P = null;                       /* raccourci vers NGPricing        */
  var MAIL = 'https://formsubmit.co/contact@novogardenhub.com';

  /* Services nécessitant une adresse d'intervention. */
  var AVEC_ADRESSE = { 'tonte': 1, 'topographie': 1 };
  /* Services nécessitant une date et un créneau (prestations sur site). */
  var AVEC_DATE = { 'tonte': 1, 'topographie': 1, 'drone': 1 };

  /* État du parcours en cours. */
  var etat = null;
  var etapes = [];
  var courante = 0;

  /* ---------- utilitaires ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function eur(n) { return P ? P.formatEUR(n) : '—'; }

  /* Crée à la volée un écran plein format, comme le fait le module
     volets/services, pour ne pas alourdir le HTML statique. */
  function ecran(id) {
    var ex = $(id);
    if (ex) return ex;
    var ref = $('home');
    if (!ref || !ref.parentNode) return null;
    var d = document.createElement('div');
    d.id = id; d.className = 'screen';
    ref.parentNode.insertBefore(d, ref);
    return d;
  }

  function aller(id) {
    if (typeof global.navTo === 'function') global.navTo(id);
    var c = document.querySelector('#' + id + ' .bcontent, #' + id + ' .ngv-wrap');
    if (c) c.scrollTop = 0;
    global.scrollTo(0, 0);
  }

  /* ---------- badges de tuiles ---------- */

  function badgeFor(id) {
    if (!P || !P.isReady()) return null;
    var s = P.getService(id);
    return (s && s.badge) ? s.badge : null;
  }

  /* ---------- bloc « délai / livrables / grille » des fiches ---------- */

  function ficheExtras(id) {
    if (!P || !P.isReady()) return '';
    var s = P.getService(id);
    if (!s) return '';
    var h = '';

    if (s.delai) {
      h += '<div class="ngv-row"><span class="ngv-k">Délai</span>'
        + '<span class="ngv-v">' + esc(s.delai) + '</span></div>';
    }
    if (s.badge) {
      h += '<div class="ngv-row"><span class="ngv-k">À partir de</span>'
        + '<span class="ngv-v">' + esc(s.badge.replace(/^DÈS\s*/i, '')) + '</span></div>';
    }
    if (h) h = '<div class="ngv-card">' + h + '</div>';

    var inclus = s.livrables_inclus || s.inclus;
    if (inclus && inclus.length) {
      h += '<div class="ngv-card"><p class="ngb-h3">'
        + (s.livrables_inclus ? 'Livrables inclus' : 'Prestation incluse')
        + '</p><ul class="ngb-ul">';
      for (var i = 0; i < inclus.length; i++) h += '<li>' + esc(inclus[i]) + '</li>';
      h += '</ul></div>';
    }

    h += '<button type="button" class="ngb-lien" data-ngb-grille="' + esc(s.id) + '">'
      + 'Voir la grille tarifaire</button>';
    h += '<button type="button" class="ngv-cta" data-ngb-open="' + esc(s.id) + '" '
      + 'style="margin-bottom:10px">Réserver cette prestation</button>';
    return h;
  }

  /* ---------- grille tarifaire consultable ---------- */

  function grille(id) {
    if (!P || !P.isReady()) return;
    var s = P.getService(id);
    if (!s) return;
    var w = ecran('ngb-grille');
    if (!w) return;

    var avecPaliers = P.hasPaliers(s.id);
    var lignes = P.getTranches(s.id);
    var paliers = P.getPaliers();
    var h = '<div class="ngv-wrap"><div class="ngv-head">'
      + '<button type="button" class="ngv-back" id="ngb-g-back">← Retour</button>'
      + '<div style="font-size:16px;font-weight:800">' + esc(s.nom) + '</div></div>'
      + '<p class="sect">Grille tarifaire TTC</p>'
      + '<table class="price-table"><thead><tr><th>'
      + esc(avecPaliers ? P.labelCritere(s.id) : 'Prestation') + '</th>';

    if (avecPaliers) {
      for (var p = 0; p < paliers.length; p++) {
        h += '<th>' + esc(paliers[p].nom) + '</th>';
      }
    } else {
      h += '<th>Tarif</th>';
    }
    h += '</tr></thead><tbody>';

    for (var i = 0; i < lignes.length; i++) {
      var t = lignes[i];
      h += '<tr><td>' + esc(t.label) + '</td>';
      if (avecPaliers) {
        for (var k = 0; k < paliers.length; k++) {
          var v = t[paliers[k].id];
          h += '<td>' + (t.devis || v == null ? 'Devis' : eur(v)) + '</td>';
        }
      } else {
        h += '<td>' + (t.devis || t.prix == null ? 'Devis' : eur(t.prix)) + '</td>';
      }
      h += '</tr>';
    }
    h += '</tbody></table>';

    /* Notes propres au service, telles qu'écrites dans la grille. */
    ['note_packs', 'note_surfaces', 'note_fichier'].forEach(function (cle) {
      if (s[cle]) h += '<p class="ngb-note">' + esc(s[cle]) + '</p>';
    });

    /* Catalogues secondaires : prestations unitaires, usages types. */
    h += blocListePrix('Prestations à l’unité', s.prestations_unitaires);
    h += blocListePrix('Usages courants', s.catalogue_usages);
    h += blocListePrix('Options', s.options);

    h += mentionsHTML(s, true);
    h += '<p class="ngb-note">' + esc(tvaTexte()) + '</p></div>';

    w.innerHTML = h;
    $('ngb-g-back').addEventListener('click', function () {
      if (typeof global.navTo === 'function') global.navTo('volets');
    });
    aller('ngb-grille');
  }

  function blocListePrix(titre, liste) {
    if (!liste || !liste.length) return '';
    var h = '<p class="sect">' + esc(titre) + '</p><div class="ngv-card">';
    for (var i = 0; i < liste.length; i++) {
      var o = liste[i];
      var val;
      if (o.devis) val = 'Sur devis';
      else if (typeof o.majoration === 'number') val = '+' + Math.round(o.majoration * 100) + ' %';
      else if (typeof o.prix === 'number') val = eur(o.prix) + (o.unite ? ' / ' + esc(o.unite) : '');
      else val = '—';
      h += '<div class="ngv-row"><span class="ngv-k">' + esc(o.label) + '</span>'
        + '<span class="ngv-v">' + val + '</span></div>';
    }
    return h + '</div>';
  }

  function tvaTexte() {
    var d = P.getData();
    return 'TTC — TVA non applicable, art. 293 B du CGI'
      + (d && d.regles_globales
          ? ' · Devis valable ' + d.regles_globales.devis_valide_jours + ' jours'
          : '');
  }

  /* Mentions légales spécifiques : géomètre-expert (topographie),
     contraintes de vol (drone). `lecture` = affichage informatif seul. */
  function mentionsHTML(s, lecture) {
    var h = '';
    if (s.mention_legale) {
      h += '<div class="ngb-legal"><strong>Mention légale</strong><p>'
        + esc(s.mention_legale) + '</p>';
      if (!lecture) {
        h += '<label class="ngb-check"><input type="checkbox" id="ngb-legal-ok"> '
          + 'J’ai lu et j’accepte cette mention.</label>';
      }
      h += '</div>';
    }
    if (s.contraintes_reglementaires && s.contraintes_reglementaires.length) {
      h += '<div class="ngb-legal"><strong>Contraintes réglementaires</strong><ul class="ngb-ul">';
      for (var i = 0; i < s.contraintes_reglementaires.length; i++) {
        h += '<li>' + esc(s.contraintes_reglementaires[i]) + '</li>';
      }
      h += '</ul>';
      if (!lecture) {
        h += '<label class="ngb-check"><input type="checkbox" id="ngb-legal-ok"> '
          + 'J’ai pris connaissance de ces contraintes.</label>';
      }
      h += '</div>';
    }
    return h;
  }

  /* ---------- tunnel générique ---------- */

  function open(serviceId) {
    if (!P || !P.isReady()) { alert('Grille tarifaire indisponible, réessayez.'); return; }

    /* La tonte garde son tunnel historique (calendrier récurrent,
       « Mes services », solde). On y redirige sans le modifier. */
    if (serviceId && P.normId(serviceId) === 'tonte') {
      if (typeof global.startBooking === 'function') { global.startBooking(1); return; }
    }

    etat = {
      serviceId: serviceId ? P.normId(serviceId) : null,
      palier: 'solo',
      trancheIndex: null,
      options: [],
      adresse: '', ville: '', cp: '',
      date: '', creneau: '',
      nom: '', tel: '', email: '', note: '',
      legalOk: false, cgv: false
    };
    construireEtapes();
    courante = 0;
    rendre();
    aller('ngb-resa');
  }

  /* Les étapes sont calculées à partir du service : c'est ce qui rend
     le tunnel générique plutôt que dupliqué six fois. */
  function construireEtapes() {
    etapes = [];
    if (!etat.serviceId) etapes.push('service');
    if (etat.serviceId) {
      var s = P.getService(etat.serviceId);
      if (P.hasPaliers(etat.serviceId)) etapes.push('palier');
      etapes.push('tranche');
      if (s.options && s.options.length) etapes.push('options');
      if (AVEC_DATE[etat.serviceId]) etapes.push('date');
      etapes.push('recap');
    }
  }

  function svc() { return etat.serviceId ? P.getService(etat.serviceId) : null; }

  function prix() {
    return P.computePrice({
      serviceId: etat.serviceId,
      trancheIndex: etat.trancheIndex,
      palier: etat.palier,
      options: etat.options
    });
  }

  var TITRES = {
    service: ['Votre prestation', 'Choisissez le service souhaité'],
    palier:  ['Votre formule', 'Solo, Essentiel ou Sérénité'],
    tranche: ['Votre besoin', 'Sélectionnez la tranche correspondante'],
    options: ['Options', 'Ajustez votre prestation'],
    date:    ['Date & créneau', 'Choisissez votre créneau d’intervention'],
    recap:   ['Récapitulatif', 'Vérifiez avant d’envoyer votre demande']
  };

  function rendre() {
    var w = ecran('ngb-resa');
    if (!w) return;
    var s = svc();
    var etape = etapes[courante];
    var t = TITRES[etape] || ['', ''];

    var barres = '';
    for (var i = 0; i < etapes.length; i++) {
      barres += '<div class="ps' + (i <= courante ? ' done' : '') + '"></div>';
    }

    w.innerHTML =
      '<div class="bheader">'
      + '<button class="back-btn" id="ngb-quit">←</button>'
      + '<h2>' + esc(s ? s.nom : 'Réservation') + '</h2>'
      + '<p>' + esc(t[1]) + '</p>'
      + '<div class="progress">' + barres + '</div></div>'
      + '<div class="bcontent"><div class="step active">'
      + '<div class="st">' + esc(t[0]) + '</div>'
      + corps(etape)
      + '</div></div>';

    brancherEtape(etape);
    $('ngb-quit').addEventListener('click', function () {
      if (courante > 0) { courante--; rendre(); }
      else if (typeof global.navTo === 'function') global.navTo('volets');
    });
  }

  function corps(etape) {
    var s = svc();
    switch (etape) {
      case 'service':  return corpsService();
      case 'palier':   return corpsPalier(s);
      case 'tranche':  return corpsTranche(s);
      case 'options':  return corpsOptions(s);
      case 'date':     return corpsDate(s);
      case 'recap':    return corpsRecap(s);
    }
    return '';
  }

  /* --- étape 0 : choix du service --- */
  function corpsService() {
    var l = P.getServices();
    var h = '<div class="ss">6 prestations disponibles</div><div class="opts">';
    for (var i = 0; i < l.length; i++) {
      h += '<div class="opt" data-ngb-svc="' + esc(l[i].id) + '">'
        + '<div><div class="opt-name">' + esc(l[i].nom) + '</div>'
        + '<div class="opt-price">' + esc(l[i].badge) + '</div></div>'
        + '<div class="opt-check"></div></div>';
    }
    return h + '</div>';
  }

  /* --- étape 1 : palier --- */
  function corpsPalier(s) {
    var paliers = P.getPaliers();
    var tr = P.getTranches(s.id);
    var h = '<div class="ss">' + esc(s.note_packs || 'Un pack est un crédit de prestations, pas un abonnement.')
      + '</div><div class="opts">';
    for (var i = 0; i < paliers.length; i++) {
      var p = paliers[i];
      /* Prix d'appel du palier = première tranche chiffrée. */
      var mini = null;
      for (var k = 0; k < tr.length && mini == null; k++) {
        if (!tr[k].devis && tr[k][p.id] != null) mini = tr[k][p.id];
      }
      h += '<div class="opt' + (etat.palier === p.id ? ' sel' : '') + '" data-ngb-pal="' + esc(p.id) + '">'
        + '<div><div class="opt-name">' + esc(p.nom) + ' — ' + p.quantite + ' ' + esc(s.unite)
        + (p.quantite > 1 ? 's' : '') + '</div>'
        + '<div class="opt-price">' + (mini == null ? 'Sur devis' : 'À partir de ' + eur(mini)) + '</div></div>'
        + '<div class="opt-check"></div></div>';
    }
    h += '</div>';
    var r = P.getRules();
    if (r) h += '<p class="ngb-note">Crédits valables ' + r.validite_pack_mois + ' mois.</p>';
    return h + boutons(true);
  }

  /* --- étape 2 : tranche (+ adresse si prestation sur site) --- */
  function corpsTranche(s) {
    var lignes = P.getTranches(s.id);
    var h = '<div class="ss">' + esc(P.labelCritere(s.id)) + '</div>'
      + '<label class="flabel">' + esc(P.labelCritere(s.id)) + ' <span class="req">*</span></label>'
      + '<div class="opts">';
    for (var i = 0; i < lignes.length; i++) {
      var t = lignes[i];
      var val;
      if (t.devis) val = 'Sur devis';
      else if (P.hasPaliers(s.id)) val = eur(t[etat.palier]);
      else val = eur(t.prix) + (t.unite ? ' / ' + esc(t.unite) : '');
      h += '<div class="opt' + (etat.trancheIndex === i ? ' sel' : '') + '" data-ngb-tr="' + i + '">'
        + '<div><div class="opt-name">' + esc(t.label) + '</div>'
        + '<div class="opt-price">' + val + '</div></div>'
        + '<div class="opt-check"></div></div>';
    }
    h += '</div>';

    if (AVEC_ADRESSE[s.id]) {
      h += '<label class="flabel">Adresse <span class="req">*</span></label>'
        + '<input id="ngb-adr" class="finput" type="text" placeholder="Numéro et nom de rue" value="' + esc(etat.adresse) + '">'
        + '<label class="flabel">Ville <span class="req">*</span></label>'
        + '<input id="ngb-ville" class="finput" type="text" placeholder="Alençon, Laval…" value="' + esc(etat.ville) + '">'
        + '<label class="flabel">Code postal <span class="req">*</span></label>'
        + '<input id="ngb-cp" class="finput" type="text" inputmode="numeric" maxlength="5" placeholder="61000" value="' + esc(etat.cp) + '">';
    }
    h += '<button type="button" class="ngb-lien" data-ngb-grille="' + esc(s.id) + '">Voir la grille tarifaire</button>';
    return h + boutons(true);
  }

  /* --- étape 3 : options, impact live sur le prix --- */
  function corpsOptions(s) {
    var h = '<div class="ss">Cochez ce dont vous avez besoin. Le prix se met à jour.</div>';
    var o = s.options || [];
    for (var i = 0; i < o.length; i++) {
      var val;
      if (o[i].devis) val = 'Sur devis';
      else if (typeof o[i].majoration === 'number') val = '+' + Math.round(o[i].majoration * 100) + ' %';
      else val = (o[i].prix === 0 ? 'Inclus' : '+ ' + eur(o[i].prix)) + (o[i].unite ? ' / ' + esc(o[i].unite) : '');
      h += '<label class="ngb-opt"><input type="checkbox" data-ngb-opt="' + i + '"'
        + (etat.options.indexOf(i) > -1 ? ' checked' : '') + '>'
        + '<span class="ngb-opt-l">' + esc(o[i].label) + '</span>'
        + '<span class="ngb-opt-p">' + val + '</span></label>';
    }
    h += encartPrix();
    return h + boutons(true);
  }

  /* --- étape 4 : date et créneau --- */
  function corpsDate(s) {
    var mini = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    var cr = ['8h–10h', '10h–12h', '12h–14h', '14h–16h', '16h–18h', '18h–20h'];
    var h = '<div class="ss">Délai indicatif : ' + esc(s.delai || '—') + '</div>'
      + '<label class="flabel">Date souhaitée <span class="req">*</span></label>'
      + '<input id="ngb-date" class="finput" type="date" min="' + mini + '" value="' + esc(etat.date) + '">'
      + '<label class="flabel">Créneau <span class="req">*</span></label><div class="tslots">';
    for (var i = 0; i < cr.length; i++) {
      h += '<div class="tslot' + (etat.creneau === cr[i] ? ' sel' : '') + '" data-ngb-cr="' + esc(cr[i]) + '">' + cr[i] + '</div>';
    }
    return h + '</div>' + boutons(true);
  }

  /* --- étape 5 : récapitulatif, coordonnées, envoi --- */
  function corpsRecap(s) {
    var r = prix();
    var tr = etat.trancheIndex != null ? P.getTranches(s.id)[etat.trancheIndex] : null;
    var h = '<div class="ss">Vérifiez avant d’envoyer</div><div class="recap-card">'
      + ligne('Prestation', s.nom);
    if (P.hasPaliers(s.id)) {
      var p = P.getPaliers().filter(function (x) { return x.id === etat.palier; })[0];
      h += ligne('Formule', p ? p.nom + ' (' + p.quantite + ')' : '—');
    }
    h += ligne(P.labelCritere(s.id), tr ? tr.label : '—');
    if (AVEC_ADRESSE[s.id]) h += ligne('Adresse', [etat.adresse, etat.cp, etat.ville].filter(Boolean).join(' ') || '—');
    if (AVEC_DATE[s.id]) {
      h += ligne('Date', etat.date || '—') + ligne('Créneau', etat.creneau || '—');
    }
    h += ligne('Délai', s.delai || '—') + '</div>';

    if (etat.options.length) {
      h += '<div class="recap-card">';
      for (var i = 0; i < etat.options.length; i++) {
        var o = s.options[etat.options[i]];
        h += ligne(o.label, o.devis ? 'Sur devis'
          : (typeof o.majoration === 'number' ? '+' + Math.round(o.majoration * 100) + ' %' : '+ ' + eur(o.prix)));
      }
      h += '</div>';
    }

    h += encartPrix();
    h += mentionsHTML(s, false);

    h += '<p style="font-size:13px;font-weight:800;margin-bottom:12px;">Vos coordonnées</p>'
      + '<label class="flabel">Nom complet <span class="req">*</span></label>'
      + '<input id="ngb-nom" class="finput" type="text" value="' + esc(etat.nom) + '" placeholder="Jean Dupont">'
      + '<label class="flabel">Téléphone <span class="req">*</span></label>'
      + '<input id="ngb-tel" class="finput" type="tel" value="' + esc(etat.tel) + '" placeholder="06 12 34 56 78">'
      + '<label class="flabel">Email <span class="req">*</span></label>'
      + '<input id="ngb-mail" class="finput" type="email" value="' + esc(etat.email) + '" placeholder="vous@email.com">'
      + '<label class="flabel">Précisions (optionnel)</label>'
      + '<textarea id="ngb-note" class="finput" rows="2" style="resize:none">' + esc(etat.note) + '</textarea>'
      + '<div class="cgv-row"><input type="checkbox" id="ngb-cgv">'
      + '<label for="ngb-cgv">J’accepte que ces informations soient transmises à Novogarden pour l’établissement d’un devis</label></div>'
      + '<div class="err-msg" id="ngb-err"></div>'
      + '<button class="btn-p" id="ngb-send">Envoyer ma demande de devis</button>'
      + '<button class="btn-s" id="ngb-prev">← Retour</button>';
    return h;
  }

  function ligne(k, v) {
    return '<div class="rrow"><span class="rk">' + esc(k) + '</span><span class="rv">' + esc(v) + '</span></div>';
  }

  /* Encart de prix, recalculé à chaque rendu — jamais mémorisé. */
  function encartPrix() {
    var r = prix();
    var s = svc();
    if (r.devis) {
      return '<div class="price-hl"><span class="lbl">Estimation</span>'
        + '<span class="amt">Sur devis</span></div>'
        + '<p class="ngb-note">Cette configuration est étudiée au cas par cas : '
        + 'votre demande part en devis libre, sans prix estimé.</p>';
    }
    var h = '<div class="price-hl"><span class="lbl">Prix estimé TTC</span>'
      + '<span class="amt">' + eur(r.total) + '</span></div>';
    if (P.hasPaliers(s.id) && etat.palier !== 'solo') {
      var p = P.getPaliers().filter(function (x) { return x.id === etat.palier; })[0];
      if (p) h += '<p class="ngb-note">Soit ' + eur(r.total / p.quantite) + ' / ' + esc(s.unite)
        + ' pour ' + p.quantite + ' ' + esc(s.unite) + 's.</p>';
    }
    h += '<p class="ngb-note">' + esc(tvaTexte()) + '. Prix estimatif, confirmé après étude.</p>';
    return h;
  }

  function boutons(avecRetour) {
    return '<button class="btn-p" id="ngb-next">Continuer</button>'
      + (avecRetour && courante > 0 ? '<button class="btn-s" id="ngb-prev">← Retour</button>' : '');
  }

  /* ---------- branchements d'événements ---------- */

  function brancherEtape(etape) {
    var w = $('ngb-resa');

    w.querySelectorAll('[data-ngb-svc]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = this.getAttribute('data-ngb-svc');
        if (P.normId(id) === 'tonte' && typeof global.startBooking === 'function') {
          global.startBooking(1); return;
        }
        etat.serviceId = id; etat.trancheIndex = null; etat.options = [];
        construireEtapes(); courante = 0; rendre();
      });
    });

    w.querySelectorAll('[data-ngb-pal]').forEach(function (el) {
      el.addEventListener('click', function () {
        etat.palier = this.getAttribute('data-ngb-pal'); rendre();
      });
    });

    w.querySelectorAll('[data-ngb-tr]').forEach(function (el) {
      el.addEventListener('click', function () {
        etat.trancheIndex = parseInt(this.getAttribute('data-ngb-tr'), 10); rendre();
      });
    });

    w.querySelectorAll('[data-ngb-opt]').forEach(function (el) {
      el.addEventListener('change', function () {
        var i = parseInt(this.getAttribute('data-ngb-opt'), 10);
        var k = etat.options.indexOf(i);
        if (this.checked && k === -1) etat.options.push(i);
        if (!this.checked && k > -1) etat.options.splice(k, 1);
        rendre();                       /* impact live sur le prix */
      });
    });

    w.querySelectorAll('[data-ngb-cr]').forEach(function (el) {
      el.addEventListener('click', function () {
        etat.creneau = this.getAttribute('data-ngb-cr'); rendre();
      });
    });

    w.querySelectorAll('[data-ngb-grille]').forEach(function (el) {
      el.addEventListener('click', function () { grille(this.getAttribute('data-ngb-grille')); });
    });

    memoriser('ngb-adr', 'adresse'); memoriser('ngb-ville', 'ville'); memoriser('ngb-cp', 'cp');
    memoriser('ngb-date', 'date');
    memoriser('ngb-nom', 'nom'); memoriser('ngb-tel', 'tel');
    memoriser('ngb-mail', 'email'); memoriser('ngb-note', 'note');

    var next = $('ngb-next');
    if (next) next.addEventListener('click', suivant);
    var prev = $('ngb-prev');
    if (prev) prev.addEventListener('click', function () { if (courante > 0) { courante--; rendre(); } });
    var send = $('ngb-send');
    if (send) send.addEventListener('click', envoyer);
  }

  /* Sauvegarde la saisie sans re-rendre, pour ne pas perdre le focus. */
  function memoriser(id, cle) {
    var el = $(id);
    if (el) el.addEventListener('input', function () { etat[cle] = this.value; });
  }

  function suivant() {
    var etape = etapes[courante];
    var s = svc();
    if (etape === 'tranche') {
      if (etat.trancheIndex == null) { toast('Sélectionnez une option.'); return; }
      if (AVEC_ADRESSE[s.id]) {
        etat.adresse = ($('ngb-adr') || {}).value || '';
        etat.ville = ($('ngb-ville') || {}).value || '';
        etat.cp = ($('ngb-cp') || {}).value || '';
        if (!etat.adresse.trim() || !etat.ville.trim() || !/^\d{5}$/.test(etat.cp.trim())) {
          toast('Adresse, ville et code postal (5 chiffres) requis.'); return;
        }
      }
    }
    if (etape === 'date') {
      if (!etat.date || !etat.creneau) { toast('Choisissez une date et un créneau.'); return; }
    }
    if (courante < etapes.length - 1) { courante++; rendre(); }
  }

  function toast(m) {
    if (typeof global.showToast === 'function') global.showToast(m); else alert(m);
  }

  /* ---------- envoi (réutilise l'intégration FormSubmit existante) ---------- */

  function envoyer() {
    var s = svc();
    var err = $('ngb-err');
    etat.nom = ($('ngb-nom') || {}).value || '';
    etat.tel = ($('ngb-tel') || {}).value || '';
    etat.email = ($('ngb-mail') || {}).value || '';
    etat.note = ($('ngb-note') || {}).value || '';
    var cgv = $('ngb-cgv') && $('ngb-cgv').checked;
    var legal = $('ngb-legal-ok');

    err.textContent = '';
    if (etat.nom.trim().length < 2) { err.textContent = 'Nom requis.'; return; }
    if (!/^[\d\s\+\-\.]{8,15}$/.test(etat.tel.trim())) { err.textContent = 'Téléphone invalide.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(etat.email.trim())) { err.textContent = 'Email invalide.'; return; }
    if (legal && !legal.checked) { err.textContent = 'Merci d’accepter la mention légale ci-dessus.'; return; }
    if (!cgv) { err.textContent = 'Merci de cocher la case d’acceptation.'; return; }

    var r = prix();
    var tr = P.getTranches(s.id)[etat.trancheIndex];
    var btn = $('ngb-send');
    btn.disabled = true; btn.textContent = 'Envoi en cours…';

    var form = document.createElement('form');
    form.method = 'POST'; form.action = MAIL; form.style.display = 'none';
    function champ(n, v) {
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = n; i.value = v; form.appendChild(i);
    }
    champ('_subject', '[Devis Novogarden] ' + s.nom + ' — ' + etat.nom);
    champ('_captcha', 'false');
    champ('_template', 'table');
    champ('_next', location.origin + location.pathname + '?devis=ok&p=' + encodeURIComponent(s.nom));
    champ('Prestation', s.nom);
    if (P.hasPaliers(s.id)) champ('Formule', etat.palier);
    champ(P.labelCritere(s.id), tr ? tr.label : '—');
    if (etat.options.length) {
      champ('Options', etat.options.map(function (i) { return s.options[i].label; }).join(' · '));
    }
    if (AVEC_ADRESSE[s.id]) champ('Adresse', etat.adresse + ' ' + etat.cp + ' ' + etat.ville);
    if (AVEC_DATE[s.id]) { champ('Date', etat.date); champ('Creneau', etat.creneau); }
    champ('Prix_estime', r.devis ? 'Sur devis' : eur(r.total));
    champ('Nom', etat.nom); champ('Email', etat.email); champ('Telephone', etat.tel);
    champ('Precisions', etat.note || '—');
    champ('Grille_version', (P.getData() || {}).version || '—');
    document.body.appendChild(form);
    form.submit();
  }

  /* ---------- alimentation des écrans tonte existants ---------- */

  /* Les cartes, le tableau et le tunnel historique contenaient des prix
     en dur. On les réécrit depuis la grille pour qu'il n'existe qu'une
     seule source de vérité. */
  function hydraterTonte() {
    var s = P.getService('tonte');
    if (!s) return;
    var tr = s.tranches || [];
    var paliers = P.getPaliers();

    /* Tableau « Tarifs TTC par surface ». */
    var tb = document.querySelector('#tbl-tonte tbody');
    if (tb) {
      var h = '';
      for (var i = 0; i < tr.length; i++) {
        h += '<tr><td>' + esc(tr[i].label) + '</td>';
        for (var k = 0; k < paliers.length; k++) {
          var v = tr[i][paliers[k].id];
          h += '<td>' + (tr[i].devis || v == null ? 'Devis' : eur(v)) + '</td>';
        }
        h += '</tr>';
      }
      tb.innerHTML = h;
    }

    /* Cartes « Nos formules » et options du tunnel historique. */
    for (var p = 0; p < paliers.length; p++) {
      var id = paliers[p].id, mini = null, maxi = null;
      for (var j = 0; j < tr.length; j++) {
        var v2 = tr[j][id];
        if (tr[j].devis || v2 == null) continue;
        if (mini == null || v2 < mini) mini = v2;
        if (maxi == null || v2 > maxi) maxi = v2;
      }
      var q = paliers[p].quantite;
      var carte = document.querySelector('[data-ngb-prix="' + id + '"]');
      if (carte && mini != null) {
        carte.textContent = 'À partir de ' + eur(mini / q) + (q > 1 ? ' / ' + s.unite : '');
      }
      var tag = document.querySelector('[data-ngb-tag="' + id + '"]');
      if (tag && maxi != null) {
        tag.textContent = (q > 1 ? 'Paiement au prorata · ' : 'Sans abonnement · ')
          + 'Jusqu’à ' + eur(maxi / q) + ' / ' + s.unite;
      }
      var opt = document.querySelector('[data-ngb-opt-prix="' + id + '"]');
      if (opt && mini != null) opt.textContent = 'À partir de ' + eur(mini);
    }

  }

  /* ---------- démarrage ---------- */

  function demarrer() {
    P = global.NGPricing;
    if (!P) { console.error('[NGBooking] NGPricing absent'); return; }
    P.load().then(function () {
      if (!P.isReady()) return;
      hydraterTonte();
      /* Le module volets/services relit les badges au prochain rendu. */
      if (typeof global.__ngvRefresh === 'function') global.__ngvRefresh();
    });
    /* Délégation globale : les liens « grille » et « réserver » posés
       par les fiches services fonctionnent sans re-brancher à chaque rendu. */
    document.addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('[data-ngb-grille]') : null;
      if (g && !g.closest('#ngb-resa')) { e.preventDefault(); grille(g.getAttribute('data-ngb-grille')); return; }
      var o = e.target.closest ? e.target.closest('[data-ngb-open]') : null;
      if (o) { e.preventDefault(); open(o.getAttribute('data-ngb-open')); }
    });
  }

  global.NGBooking = {
    open: open, grille: grille,
    badgeFor: badgeFor, ficheExtras: ficheExtras
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(window);
