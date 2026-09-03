/* =====================================================================
   Novogarden — attribution du code apporteur (spec 10)
   ---------------------------------------------------------------------
   Trois entrees possibles pour un code :
     1. le parametre d'URL ?code=XXX
     2. le champ facultatif ajoute a l'etape coordonnees du tunnel
     3. un code deja memorise lors d'une visite precedente

   Le code capture par l'URL est memorise 30 jours (fenetre d'attribution
   de la spec 6) puis pre-rempli automatiquement. La reservation n'est
   jamais bloquee : un code inconnu enregistre simplement un lead sans
   apporteur.
   ===================================================================== */
(function (global) {
  'use strict';

  var CLE = 'ng_code_apporteur';
  var P = null;

  function cfg() { return global.NG_CONFIG || {}; }
  function jours() { return (cfg().FENETRE_ATTRIBUTION_JOURS || 30); }

  /* ---------- memorisation ---------- */

  function memoriser(code) {
    if (!code) return;
    try {
      localStorage.setItem(CLE, JSON.stringify({
        code: String(code).toUpperCase().trim(),
        le: Date.now()
      }));
    } catch (e) {}
  }

  /* Renvoie le code memorise s'il est encore dans la fenetre, sinon le purge. */
  function memorise() {
    try {
      var b = JSON.parse(localStorage.getItem(CLE) || 'null');
      if (!b || !b.code) return '';
      if (Date.now() - b.le > jours() * 86400000) {
        localStorage.removeItem(CLE);
        return '';
      }
      return b.code;
    } catch (e) { return ''; }
  }

  function oublier() { try { localStorage.removeItem(CLE); } catch (e) {} }

  /* ---------- capture depuis l'URL ---------- */

  function capturerURL() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var c = q.get('code') || q.get('parrain');
    if (!c) return;
    memoriser(c);
    /* On retire le parametre pour ne pas le laisser trainer dans l'URL
       partagee ensuite par le client. */
    try {
      q.delete('code'); q.delete('parrain');
      var reste = q.toString();
      history.replaceState(null, '', location.pathname + (reste ? '?' + reste : ''));
    } catch (e) {}
  }

  /* ---------- champ dans le tunnel ---------- */

  /* Le champ est insere juste avant la case d'acceptation de l'etape 4
     du tunnel tonte, et dans le recapitulatif du tunnel generique. */
  function insererChamp() {
    if (document.getElementById('ng-code-apporteur')) return true;
    var ancre = document.querySelector('#s4 .cgv-row');
    if (!ancre || !ancre.parentNode) return false;

    var bloc = document.createElement('div');
    bloc.innerHTML =
      '<label class="flabel">Code partenaire (optionnel)</label>'
      + '<input id="ng-code-apporteur" class="finput" type="text" autocomplete="off"'
      + ' placeholder="Ex. ROMAIN-4K2" style="text-transform:uppercase">'
      + '<div class="ngp-note" id="ng-code-info" style="margin-top:-6px">'
      + 'Si un partenaire vous a recommandé Novogarden, indiquez son code.</div>';
    ancre.parentNode.insertBefore(bloc, ancre);

    var champ = document.getElementById('ng-code-apporteur');
    var c = memorise();
    if (c) {
      champ.value = c;
      document.getElementById('ng-code-info').textContent =
        'Code enregistré lors de votre visite. Vous pouvez le modifier.';
    }
    champ.addEventListener('input', function () {
      this.value = this.value.toUpperCase();
      memoriser(this.value);
    });
    return true;
  }

  function codeSaisi() {
    var e = document.getElementById('ng-code-apporteur');
    return e ? e.value.toUpperCase().trim() : memorise();
  }

  /* ---------- creation du lead ---------- */

  /* Appelee apres l'envoi du devis. On passe par la fonction
     creer_lead cote base : le client n'a aucun droit d'ecriture
     direct sur la table leads. */
  function enregistrerLead(infos) {
    P = global.NGP;
    if (!P || !P.estConfigure() || !P.client()) return Promise.resolve(null);
    return P.client().rpc('creer_lead', {
      p_code:      infos.code || null,
      p_prenom:    infos.prenom || '',
      p_nom:       infos.nom || '',
      p_email:     infos.email || null,
      p_telephone: infos.telephone || null,
      p_commune:   infos.commune || null,
      p_surface:   infos.surface || null,
      p_pack:      infos.pack || 'autre',
      p_montant:   infos.montant == null ? null : infos.montant,
      p_service:   infos.service || 'tonte'
    }).then(function (r) {
      if (r.error) { console.warn('[NGP] lead non enregistré :', r.error.message); return null; }
      /* Une fois le lead cree, le code a joue son role. */
      if (r.data && r.data.attribue) oublier();
      return r.data;
    }).catch(function (e) {
      console.warn('[NGP] lead non enregistré :', e);
      return null;
    });
  }

  /* Traduit l'index de formule du tunnel tonte en identifiant de pack. */
  var PACKS = { 1: 'solo', 2: 'essentiel', 3: 'serenite' };

  /* Extrait un montant numerique d'un libelle du type "232 €". */
  function montantDe(txt) {
    if (!txt) return null;
    var m = String(txt).replace(/\s/g, '').match(/(\d+(?:[.,]\d+)?)/);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }

  /* ---------- accroche sur le tunnel tonte existant ---------- */

  function brancher() {
    /* Le champ n'existe qu'une fois l'etape 4 rendue : on tente a chaque
       changement d'etape, sans jamais bloquer si le DOM differe. */
    if (typeof global.showStep === 'function' && !global.showStep.__ngp) {
      var origine = global.showStep;
      var enrobe = function (n) {
        var r = origine.apply(this, arguments);
        if (n === 4) { try { insererChamp(); } catch (e) {} }
        return r;
      };
      enrobe.__ngp = true;
      global.showStep = enrobe;
    }

    /* doConfirm envoie le devis par FormSubmit. On enregistre le lead
       juste avant, sans jamais empecher l'envoi si la base repond mal. */
    if (typeof global.doConfirm === 'function' && !global.doConfirm.__ngp) {
      var conf = global.doConfirm;
      var enrobe2 = function () {
        try {
          var bk = global.bk || {};
          enregistrerLead({
            code:      codeSaisi(),
            prenom:    (document.getElementById('bk-name') || {}).value || '',
            nom:       '',
            email:     (document.getElementById('bk-email') || {}).value || '',
            telephone: (document.getElementById('bk-phone') || {}).value || '',
            commune:   (document.getElementById('city') || {}).value || '',
            surface:   surfaceDe(bk.surf),
            pack:      PACKS[bk.svc] || 'autre',
            montant:   montantDe(typeof global.getPrice === 'function' ? global.getPrice() : null)
          });
        } catch (e) {}
        return conf.apply(this, arguments);
      };
      enrobe2.__ngp = true;
      global.doConfirm = enrobe2;
    }
  }

  /* "500-1500" -> 1500 (borne haute, suffisante pour qualifier le lead) */
  function surfaceDe(s) {
    if (!s) return null;
    var m = String(s).split('-');
    var v = parseInt(m[m.length - 1], 10);
    return isNaN(v) ? null : v;
  }

  function demarrer() {
    capturerURL();
    brancher();
    /* Le tunnel generique construit ses etapes plus tard : on retente
       brievement pour poser le champ des qu'il est disponible. */
    var n = 0;
    var t = setInterval(function () {
      brancher();
      if (++n > 20) clearInterval(t);
    }, 500);
  }

  global.NGP_PARRAINAGE = {
    memorise: memorise, memoriser: memoriser, oublier: oublier,
    codeSaisi: codeSaisi, enregistrerLead: enregistrerLead,
    insererChamp: insererChamp
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(window);
