/* =====================================================================
   Novogarden — zone de couverture cote client
   ---------------------------------------------------------------------
   Une prestation qui demande un deplacement n'est pas proposee partout.
   Ce module determine le departement du visiteur, demande a la base ce
   qui y est desservi, et grise les prestations hors zone.

   Le departement vient, dans l'ordre :
     1. d'un choix deja memorise (30 jours) ;
     2. de la geolocalisation du navigateur, convertie en code postal par
        l'API Adresse (data.gouv.fr, publique et sans cle) ;
     3. d'une saisie manuelle, si la position est refusee ou indisponible.

   Regle de prudence : tant que le departement est inconnu, rien n'est
   masque. Une information absente ne doit jamais retirer de l'offre.
   ===================================================================== */
(function (global) {
  'use strict';

  var CLE = 'ng_zone';
  var JOURS = 30;
  var P = null;                       /* raccourci vers NGP    */
  var dept = null;                    /* departement retenu    */
  var couverts = null;                /* null = inconnu        */

  var NOMS = {
    tonte: 'Tonte robotisée', topographie: 'Topographie 3D',
    modelisation: 'Modélisation 3D', impression: 'Impression prototype',
    drone: 'Prestation drone', 'etude-flux': 'Étude de flux'
  };

  /* data/services.json dit « flux », la grille tarifaire « etude-flux ». */
  function normal(id) { return id === 'flux' ? 'etude-flux' : id; }

  /* ---------- memoire ---------- */

  function lire() {
    try {
      var b = JSON.parse(localStorage.getItem(CLE) || 'null');
      if (!b || !b.dept) return null;
      if (Date.now() - b.t > JOURS * 86400000) { localStorage.removeItem(CLE); return null; }
      return b.dept;
    } catch (e) { return null; }
  }
  function ecrire(d) {
    try { localStorage.setItem(CLE, JSON.stringify({ dept: d, t: Date.now() })); } catch (e) {}
  }
  function oublier() { try { localStorage.removeItem(CLE); } catch (e) {} }

  /* ---------- du code postal au departement ---------- */

  function deptDuCP(cp) {
    if (!cp) return null;
    cp = String(cp).trim();
    if (/^97[1-6]/.test(cp)) return cp.slice(0, 3);          /* outre-mer  */
    if (/^20/.test(cp)) return (parseInt(cp, 10) < 20200) ? '2A' : '2B';
    return /^\d{5}$/.test(cp) ? cp.slice(0, 2) : null;
  }

  function valide(d) {
    return !!d && /^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(d);
  }

  /* ---------- geolocalisation ---------- */

  function position() {
    return new Promise(function (ok, ko) {
      if (!('geolocation' in navigator)) return ko(new Error('indisponible'));
      navigator.geolocation.getCurrentPosition(
        function (p) { ok(p.coords); },
        function (e) { ko(e); },
        { timeout: 8000, maximumAge: 600000, enableHighAccuracy: false }
      );
    });
  }

  function deptDesCoordonnees(c) {
    var u = 'https://api-adresse.data.gouv.fr/reverse/?lat=' + c.latitude
          + '&lon=' + c.longitude + '&limit=1';
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var p = j && j.features && j.features[0] && j.features[0].properties;
        return p ? deptDuCP(p.postcode) : null;
      })
      .catch(function () { return null; });
  }

  /* ---------- ce qui est desservi ici ---------- */

  function charger(d) {
    if (!P || !P.estConfigure() || !P.client()) return Promise.resolve(null);
    return P.client().rpc('services_couverts', { p_departement: d })
      .then(function (r) { return r.error ? null : (r.data || []); })
      .catch(function () { return null; });
  }

  /* ---------- application a l'ecran ---------- */

  function estCouvert(id) {
    if (!couverts) return true;              /* inconnu : on ne masque rien */
    return couverts.indexOf(normal(id)) >= 0;
  }

  function appliquer() {
    var visibles = 0;
    document.querySelectorAll('[data-ngv]').forEach(function (t) {
      var id = t.getAttribute('data-ngv');
      var ok = (id === 'contact') || estCouvert(id);
      t.classList.toggle('ngv-hors-zone', !ok);
      /* Vestige de la version grisee : on nettoie s'il en reste. */
      var marque = t.querySelector('.ngv-zone-note');
      if (marque) marque.remove();
      if (ok) visibles++;
    });
    repartir(visibles);
    majBandeau();
  }

  /* Les tuiles se partagent la hauteur : le CSS a besoin de savoir combien
     il en reste. Une seule prestation occupe tout l'ecran, deux le coupent
     en deux, et ainsi de suite. */
  function repartir(n) {
    var g = document.querySelector('.ngv-grid');
    if (!g) return;
    if (!n) n = g.querySelectorAll('[data-ngv]:not(.ngv-hors-zone)').length;
    g.setAttribute('data-n', String(Math.max(1, Math.min(n, 7))));
  }

  /* Le visiteur doit pouvoir corriger : une geolocalisation se trompe. */
  function majBandeau() {
    var hero = document.querySelector('.ngv-hero');
    if (!hero) return;
    var b = hero.querySelector('.ngv-zone');
    if (!b) {
      b = document.createElement('p');
      b.className = 'ngv-zone';
      hero.appendChild(b);
    }
    if (!dept) {
      b.innerHTML = '<button type="button" class="ngv-zone-btn" id="ngv-ou">'
                  + '\u25CE Voir ce qui est disponible chez moi</button>';
      var bt = b.querySelector('#ngv-ou');
      if (bt) bt.addEventListener('click', function () { demander(true); });
      return;
    }
    var n = couverts ? couverts.length : 6;
    b.innerHTML = 'Département ' + dept + ' \u00b7 ' + n + ' prestation' + (n > 1 ? 's' : '')
                + ' disponible' + (n > 1 ? 's' : '')
                + ' <button type="button" class="ngv-zone-lien" id="ngv-chg">changer</button>';
    var c = b.querySelector('#ngv-chg');
    if (c) c.addEventListener('click', saisieManuelle);
  }

  function saisieManuelle() {
    var v = global.prompt('Votre département (deux chiffres, ou 2A / 2B) :', dept || '');
    if (v === null) return;
    var d = v.toUpperCase().trim();
    if (!valide(d)) {
      if (P && P.toast) P.toast('Département invalide.');
      return;
    }
    poser(d);
  }

  function poser(d) {
    dept = d; ecrire(d);
    charger(d).then(function (liste) { couverts = liste; appliquer(); });
  }

  /* volontaire : declenche par le visiteur, donc la permission a du sens */
  function demander(volontaire) {
    position().then(deptDesCoordonnees).then(function (d) {
      if (valide(d)) { poser(d); return; }
      if (volontaire) saisieManuelle();
    }).catch(function () {
      if (volontaire) saisieManuelle();
      else majBandeau();
    });
  }

  function demarrer() {
    P = global.NGP;
    var memo = lire();
    if (memo) { poser(memo); return; }
    /* Au premier passage on ne force rien : le bouton attend un geste. */
    majBandeau();
  }

  /* L'accueil se redessine quand la grille arrive : on repasse derriere. */
  function observer() {
    var v = document.getElementById('volets');
    if (!v || !global.MutationObserver) return;
    var enCours = false;
    new MutationObserver(function () {
      if (enCours) return;
      enCours = true;
      setTimeout(function () { appliquer(); enCours = false; }, 60);
    }).observe(v, { childList: true, subtree: true });
  }

  /* Un clic sur une tuile hors zone doit dire pourquoi, pas rester sans effet. */
  function intercepter() {
    var v = document.getElementById('volets');
    if (!v) return;
    v.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-ngv]') : null;
      if (!t) return;
      var id = t.getAttribute('data-ngv');
      if (id === 'contact' || estCouvert(id)) return;
      e.preventDefault();
      e.stopPropagation();
      var nom = NOMS[normal(id)] || 'Cette prestation';
      if (P && P.toast) P.toast(nom + ' n\'est pas encore proposée dans le ' + dept + '.');
    }, true);
  }

  function init() {
    repartir();
    demarrer();
    observer();
    intercepter();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 600); });
  } else { setTimeout(init, 600); }

  global.NGZone = {
    departement: function () { return dept; },
    couverts: function () { return couverts; },
    estCouvert: estCouvert,
    definir: poser,
    repartir: repartir,
    oublier: function () { oublier(); dept = null; couverts = null; appliquer(); },
    NOMS: NOMS
  };
})(window);
