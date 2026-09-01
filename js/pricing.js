/* =====================================================================
   Novogarden — module de tarification
   ---------------------------------------------------------------------
   Source unique de vérité : data/pricing.json.
   Aucun prix n'est écrit en dur ici ni ailleurs dans l'application :
   ce module est le seul point de lecture de la grille tarifaire.

   API publique (window.NGPricing) :
     load(url)                      -> Promise, charge la grille
     isReady()                      -> bool
     getRules()                     -> règles globales (paliers, zone, acompte…)
     getPaliers()                   -> [{id, nom, quantite, remise, couleur}]
     getServices()                  -> [service]
     getService(id)                 -> service | null  (accepte les alias)
     getTranches(serviceId)         -> [tranche]  (ou [prestation] si pas de paliers)
     hasPaliers(serviceId)          -> bool
     computePrice({serviceId, trancheIndex, palier, options}) -> résultat
     formatEUR(n)                   -> "29,90 €"
   ===================================================================== */
(function (global) {
  'use strict';

  var URL_DEFAUT = 'data/pricing.json';

  /* Alias d'identifiants : data/services.json utilise "flux",
     la grille tarifaire utilise "etude-flux". On accepte les deux. */
  var ALIAS = {
    'flux': 'etude-flux',
    'etude_flux': 'etude-flux',
    'etudeflux': 'etude-flux'
  };

  var data = null;
  var promesse = null;

  /* ---------- utilitaires ---------- */

  function normId(id) {
    if (id == null) return '';
    var s = String(id).trim();
    return ALIAS[s] || s;
  }

  /* Arrondi monétaire au centime, sans dérive flottante. */
  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function formatEUR(n) {
    if (n == null || isNaN(n)) return 'Sur devis';
    var s = round2(n).toFixed(2).replace('.', ',');
    if (s.slice(-3) === ',00') s = s.slice(0, -3);   /* 130,00 -> 130 */
    return s + ' €';
  }

  /* ---------- chargement ---------- */

  function load(url) {
    if (promesse) return promesse;
    promesse = fetch((url || URL_DEFAUT) + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) { data = d; return d; })
      .catch(function (e) {
        /* On ne bloque pas l'application : les écrans tarifaires se
           désactivent proprement si la grille n'a pas pu être chargée. */
        console.error('[NGPricing] grille tarifaire indisponible :', e);
        data = null;
        return null;
      });
    return promesse;
  }

  function isReady() { return !!data; }
  function getData() { return data; }
  function getRules() { return (data && data.regles_globales) || null; }
  function getPaliers() {
    var r = getRules();
    return (r && r.paliers) || [];
  }
  function getServices() { return (data && data.services) || []; }

  function getService(id) {
    var cible = normId(id);
    var l = getServices();
    for (var i = 0; i < l.length; i++) {
      if (normId(l[i].id) === cible) return l[i];
    }
    return null;
  }

  /* Un service sans paliers (etude-flux) expose "prestations"
     au lieu de "tranches" : on renvoie l'un ou l'autre de façon
     transparente pour que l'interface n'ait qu'un seul cas à gérer. */
  function hasPaliers(serviceId) {
    var s = getService(serviceId);
    if (!s) return false;
    return s.paliers_applicables !== false;
  }

  function getTranches(serviceId) {
    var s = getService(serviceId);
    if (!s) return [];
    return hasPaliers(serviceId) ? (s.tranches || []) : (s.prestations || []);
  }

  /* Libellé du sélecteur de tranche, piloté par "critere_tranche". */
  var LIBELLES_CRITERE = {
    'surface':    'Surface du terrain',
    'complexité': 'Niveau de complexité',
    'complexite': 'Niveau de complexité',
    'volume':     'Volume de la pièce',
    'durée':      'Durée d’intervention',
    'duree':      'Durée d’intervention'
  };

  function labelCritere(serviceId) {
    var s = getService(serviceId);
    if (!s) return 'Prestation';
    if (!hasPaliers(serviceId)) return 'Prestation';
    return LIBELLES_CRITERE[s.critere_tranche] || 'Prestation';
  }

  /* ---------- calcul ---------- */

  /**
   * computePrice({ serviceId, trancheIndex, palier, options })
   *
   *  options : tableau d'index dans service.options (ou d'objets option).
   *
   *  Deux formats d'option coexistent dans la grille :
   *    { prix: 20 }        -> montant fixe ajouté au sous-total
   *    { majoration: 0.2 } -> pourcentage appliqué AU SOUS-TOTAL
   *    { devis: true }     -> bascule toute l'estimation en « Sur devis »
   *
   *  Ordre de calcul : base + options fixes = sous-total,
   *  puis application cumulée des majorations sur ce sous-total.
   */
  function computePrice(params) {
    params = params || {};
    var vide = {
      devis: true, base: null, sousTotal: null, total: null,
      palier: null, tranche: null, detail: [], raison: 'indisponible'
    };

    var s = getService(params.serviceId);
    if (!s) return vide;

    var avecPaliers = hasPaliers(s.id);
    var liste = getTranches(s.id);
    var idx = params.trancheIndex;
    if (idx == null || idx < 0 || idx >= liste.length) {
      return { devis: true, base: null, sousTotal: null, total: null,
               palier: null, tranche: null, detail: [], raison: 'tranche-non-choisie' };
    }
    var tr = liste[idx];

    var res = {
      devis: false, base: null, sousTotal: null, total: null,
      palier: avecPaliers ? (params.palier || 'solo') : null,
      tranche: tr, detail: [], raison: ''
    };

    /* --- prix de base --- */
    if (tr.devis === true) {
      res.devis = true;
      res.raison = 'tranche-sur-devis';
      return res;
    }

    if (avecPaliers) {
      var p = res.palier;
      if (tr[p] == null) { res.devis = true; res.raison = 'palier-sur-devis'; return res; }
      res.base = tr[p];
    } else {
      if (tr.prix == null) { res.devis = true; res.raison = 'prestation-sur-devis'; return res; }
      res.base = tr.prix;
    }
    res.detail.push({ label: tr.label, montant: res.base, type: 'base' });

    /* --- options --- */
    var dispo = s.options || [];
    var choisies = params.options || [];
    var fixes = 0;
    var majorations = [];

    for (var i = 0; i < choisies.length; i++) {
      var o = choisies[i];
      if (typeof o === 'number') o = dispo[o];
      if (!o) continue;

      if (o.devis === true) {
        /* Une seule option « sur devis » suffit à rendre l'estimation impossible. */
        res.devis = true;
        res.raison = 'option-sur-devis';
        res.detail.push({ label: o.label, montant: null, type: 'devis' });
        return res;
      }
      if (typeof o.prix === 'number') {
        fixes += o.prix;
        res.detail.push({ label: o.label, montant: o.prix, type: 'option' });
      } else if (typeof o.majoration === 'number') {
        majorations.push(o);
      }
    }

    res.sousTotal = round2(res.base + fixes);

    var total = res.sousTotal;
    for (var j = 0; j < majorations.length; j++) {
      var m = round2(res.sousTotal * majorations[j].majoration);
      total += m;
      res.detail.push({
        label: majorations[j].label + ' (+' + Math.round(majorations[j].majoration * 100) + ' %)',
        montant: m, type: 'majoration'
      });
    }
    res.total = round2(total);
    return res;
  }

  /* ---------- export ---------- */

  global.NGPricing = {
    load: load,
    isReady: isReady,
    getData: getData,
    getRules: getRules,
    getPaliers: getPaliers,
    getServices: getServices,
    getService: getService,
    getTranches: getTranches,
    hasPaliers: hasPaliers,
    labelCritere: labelCritere,
    computePrice: computePrice,
    formatEUR: formatEUR,
    normId: normId
  };
})(window);
