/* =====================================================================
   Novogarden — onglet Mon reseau — apporteur d'affaires (spec 7)
   ---------------------------------------------------------------------
   Une seule page scrollable, quatre blocs dans l'ordre :
     1. Mon code — action principale, visible sans scroller
     2. Mes filleuls — sans aucune coordonnee client
     3. Mes gains — deux nombres
     4. Comment ca marche — repliable

   Les filleuls sont lus dans la vue leads_apporteur, qui n'expose ni
   email ni telephone : meme en interrogeant l'API directement, un
   apporteur ne peut pas remonter aux coordonnees (critere 2).
   ===================================================================== */
(function (global) {
  'use strict';

  var P = null;

  function init() { P = global.NGP; return P && P.estConfigure() && P.client(); }

  function ouvrir() {
    if (!init()) return;
    if (!P.connecte()) { global.navTo('compte'); return; }
    var w = P.ecran('apporteur');
    if (!w) return;
    w.innerHTML = '<div class="ngp-wrap"><div class="ngp-chargement">Chargement…</div></div>';
    P.aller('apporteur');
    charger().then(function (d) { rendre(w, d); });
  }

  function charger() {
    var sb = P.client();
    /* Un taux unique remplace le barème par pack : la commission ne
       dépend plus de la formule, mais du montant de la prestation. */
    return Promise.all([
      sb.from('leads_apporteur').select('*').order('created_at', { ascending: false }),
      sb.from('reglages').select('valeur').eq('cle', 'taux_commission').maybeSingle()
    ]).then(function (r) {
      var t = (r[1] && r[1].data && r[1].data.valeur);
      return { filleuls: (r[0] && r[0].data) || [], taux: t == null ? null : Number(t) };
    });
  }

  function rendre(w, d) {
    var p = P.profil || {};
    var code = p.code_apporteur || '';

    var h = '<div class="ngp-wrap">';
    h += '<div class="ngp-head"><div class="ngp-titre">Mon réseau</div></div>';

    /* ---- 1. Mon code ---- */
    h += '<div class="ngp-carte ngp-code-carte">';
    if (code) {
      h += '<p class="ngp-h3">Mon code partenaire</p>'
        + '<div class="ngp-code">' + P.esc(code) + '</div>'
        + '<button class="btn-p" id="ngp-partager">Partager mon lien</button>'
        + '<button type="button" class="ngp-lien" id="ngp-copier">Copier le code</button>';
    } else {
      h += '<p class="ngp-h3">Mon code partenaire</p>'
        + '<p class="ngp-note">Votre code est en cours d’activation. '
        + 'Il apparaîtra ici dès que Novogarden l’aura généré.</p>';
    }
    h += '</div>';

    /* ---- 2. Mon reseau ---- */
    h += '<p class="sect">Mon réseau</p>';
    if (!d.filleuls.length) {
      h += '<div class="ngp-carte"><p class="ngp-note" style="margin:0">'
        + 'Personne dans votre réseau pour le moment. Partagez votre lien pour commencer.</p></div>';
    } else {
      h += '<div class="ngp-carte">';
      d.filleuls.forEach(function (f, i) {
        h += '<div class="ngp-filleul' + (i ? ' ngp-sep' : '') + '">'
          + '<div><div class="ngp-filleul-nom">' + P.esc(f.filleul || '—') + '</div>'
          + '<div class="ngp-note" style="margin:2px 0 0">'
          + P.esc(f.commune || '—') + ' · ' + P.esc(f.service_libelle || SERVICES[f.service] || '—') + '</div></div>'
          + '<span class="ngp-badge ' + classeStatut(f.statut) + '">'
          + P.esc(f.statut_affiche) + '</span></div>';
      });
      h += '</div>';
    }

    /* ---- 3. Mes gains ---- */
    var aVenir = 0, verse = 0;
    d.filleuls.forEach(function (f) {
      var m = Number(f.commission_montant) || 0;
      if (f.statut === 'confirme' || f.statut === 'encaisse') aVenir += m;
      if (f.statut === 'commission_versee') verse += m;
    });
    h += '<p class="sect">Mes gains</p>'
      + '<div class="ngp-gains">'
      + '<div class="ngp-gain"><div class="ngp-gain-v">' + P.eur(aVenir) + '</div>'
      + '<div class="ngp-gain-l">À venir</div></div>'
      + '<div class="ngp-gain"><div class="ngp-gain-v">' + P.eur(verse) + '</div>'
      + '<div class="ngp-gain-l">Versé</div></div></div>';

    /* ---- 4. Comment ca marche ---- */
    h += '<details class="ngp-details"><summary>Comment ça marche</summary>'
      + '<div class="ngp-carte" style="margin-top:10px">';
    h += '<div class="ngp-ligne"><span class="ngp-k">Toutes prestations</span>'
      + '<span class="ngp-v">' + P.esc(tauxTexte(d.taux)) + ' du montant TTC</span></div>';
    h += '<p class="ngp-note" style="margin-top:12px">'
      + '<strong>Versement après encaissement.</strong> La commission est calculée dès que '
      + 'la commande est confirmée, et vous est versée une fois le client réglé.</p>'
      + '<p class="ngp-note"><strong>Première commande uniquement.</strong> Un renouvellement '
      + 'chez un client déjà connu ne génère pas de nouvelle commission.</p>'
      + '<p class="ngp-note"><strong>Fenêtre de ' + (P.CFG.FENETRE_ATTRIBUTION_JOURS || 30)
      + ' jours.</strong> Votre code reste attribué à un client pendant '
      + (P.CFG.FENETRE_ATTRIBUTION_JOURS || 30) + ' jours après sa première saisie.</p>'
      + '</div></details>';

    h += '</div>';
    w.innerHTML = h;
    brancher(w, code);
  }

  function brancher(w, code) {
    var lien = (P.CFG.LIEN_PARTAGE || location.origin + location.pathname)
      + (code ? '?code=' + encodeURIComponent(code) : '');
    var message = 'Je te recommande Novogarden pour la tonte. '
      + 'Utilise mon code ' + code + ' à la réservation : ' + lien;

    var bp = w.querySelector('#ngp-partager');
    if (bp) bp.addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: 'Novogarden', text: message, url: lien })
          .catch(function () { /* partage annule : rien a signaler */ });
      } else {
        copier(message);
      }
    });
    var bc = w.querySelector('#ngp-copier');
    if (bc) bc.addEventListener('click', function () { copier(code); });
  }

  function copier(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt)
        .then(function () { P.toast('Copié !'); })
        .catch(function () { copieRepli(txt); });
    } else { copieRepli(txt); }
  }

  /* Repli pour les navigateurs sans presse-papier (contexte non securise). */
  function copieRepli(txt) {
    try {
      var z = document.createElement('textarea');
      z.value = txt; z.style.position = 'fixed'; z.style.opacity = '0';
      document.body.appendChild(z); z.select();
      document.execCommand('copy');
      document.body.removeChild(z);
      P.toast('Copié !');
    } catch (e) { P.toast('Copie impossible : ' + txt); }
  }

  var SERVICES = {
    'tonte':        'Tonte robotisée',
    'topographie':  'Topographie 3D',
    'modelisation': 'Modélisation 3D',
    'impression':   'Impression prototype',
    'drone':        'Prestation drone',
    'etude-flux':   'Étude de flux'
  };

  /* Le taux vient de la base, jamais du code : le modifier ne demande
     aucun déploiement. */
  function tauxTexte(t) {
    if (t == null) return '—';
    return String(Math.round(t * 1000) / 10).replace('.', ',') + ' %';
  }

  function classeStatut(s) {
    if (s === 'commission_versee') return 'ngp-badge-verse';
    if (s === 'encaisse') return 'ngp-badge-averser';
    if (s === 'confirme') return 'ngp-badge-confirme';
    if (s === 'perdu') return 'ngp-badge-perdu';
    return 'ngp-badge-encours';
  }

  function installer() {
    P = global.NGP;
    if (!P) return;
    P.onglets.apporteur = ouvrir;
  }

  global.NGP_APPORTEUR = { ouvrir: ouvrir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installer);
  else installer();
})(window);
