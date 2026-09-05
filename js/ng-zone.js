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
    /* Les tuiles visibles se partagent la hauteur disponible. Quand elles sont
       en nombre impair, la premiere prend toute la largeur pour eviter une
       case vide en bas de grille. */
    var g = document.querySelector('.ngv-grid');
    if (!g) { return; }
    var vis = [].slice.call(g.querySelectorAll('[data-ngv]')).filter(function (e) {
      return !e.classList.contains('ngv-hors-zone');
    });
    if (!n) { n = vis.length; }
    g.setAttribute('data-n', String(Math.max(1, Math.min(n, 7))));
    vis.forEach(function (e) { e.classList.remove('ngv-large'); });
    if (n >= 5 && n % 2 === 1 && vis[0]) { vis[0].classList.add('ngv-large'); }
  }

  /* Le visiteur doit pouvoir corriger : une geolocalisation se trompe. */
  function majBandeau() {
    /* Deux etats. Zone connue : on la rappelle, avec un lien pour en changer.
       Zone inconnue : rien n'est masque, et on propose la geolocalisation pour
       n'afficher que ce qui est reellement disponible sur place. Aucun
       decompte : le nombre de tuiles est deja visible a l'ecran. */
    var hero = document.querySelector('.ngv-hero');
    if (!hero) { return; }
    var p = hero.querySelector('.ngv-zone');
    if (!p) {
      p = document.createElement('p');
      p.className = 'ngv-zone';
      hero.appendChild(p);
    }
    p.textContent = '';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ngv-zone-lien';
    b.id = 'ngv-chg';
    if (dept) {
      var nom = (typeof NOMS === 'object' && NOMS) ? NOMS[dept] : null;
      p.appendChild(document.createTextNode(nom ? (nom + ' (' + dept + ') ') : ('Département ' + dept + ' ')));
      b.textContent = 'changer';
      b.addEventListener('click', function () { saisieManuelle(); });
    } else {
      p.appendChild(document.createTextNode('Voir ce qui est disponible chez vous '));
      b.textContent = 'me localiser';
      b.addEventListener('click', function () { demander(true); });
    }
    p.appendChild(b);
  }

  /* Le prompt du navigateur affiche l'adresse du site en en-tete, ce qui
     expose une URL technique au milieu du parcours. On dessine donc notre
     propre boite, aux couleurs de l'application. */
  function saisieManuelle() {
    if (document.getElementById('ngz-ov')) return;

    var ov = document.createElement('div');
    ov.id = 'ngz-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);'
      + 'display:flex;align-items:center;justify-content:center;padding:22px';

    ov.innerHTML =
        '<div style="background:#fff;border-radius:18px;padding:22px 20px;width:100%;'
      + 'max-width:330px;box-shadow:0 12px 40px rgba(0,0,0,.28);'
      + 'font-family:inherit;text-align:left">'
      + '<p style="margin:0 0 4px;font-size:17px;font-weight:800;color:#22271F">Votre département</p>'
      + '<p style="margin:0 0 14px;font-size:12.5px;color:#6B7280;line-height:1.45">'
      + 'Il détermine les prestations disponibles autour de vous.</p>'
      + '<input id="ngz-in" type="text" inputmode="numeric" maxlength="3" placeholder="61" '
      + 'style="width:100%;box-sizing:border-box;border:1.5px solid #E2E5DE;border-radius:10px;'
      + 'padding:12px 14px;font-size:19px;font-weight:700;font-family:inherit;text-align:center;'
      + 'letter-spacing:.12em;color:#2C5F2D;outline:none">'
      + '<p id="ngz-err" style="margin:8px 0 0;font-size:12px;color:#C0392B;min-height:15px"></p>'
      + '<button id="ngz-ok" style="width:100%;margin-top:8px;background:#7DB532;color:#fff;'
      + 'border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:800;'
      + 'font-family:inherit;cursor:pointer">Valider</button>'
      + '<button id="ngz-geo" style="width:100%;margin-top:8px;background:#fff;color:#2C5F2D;'
      + 'border:1.5px solid #7DB532;border-radius:12px;padding:11px;font-size:13.5px;'
      + 'font-weight:700;font-family:inherit;cursor:pointer">Me localiser à la place</button>'
      + '<button id="ngz-non" style="width:100%;margin-top:6px;background:none;color:#6B7280;'
      + 'border:none;padding:9px;font-size:13px;font-family:inherit;cursor:pointer">Annuler</button>'
      + '</div>';

    document.body.appendChild(ov);

    var champ = ov.querySelector('#ngz-in');
    var err = ov.querySelector('#ngz-err');
    champ.value = dept || '';
    setTimeout(function () { champ.focus(); champ.select(); }, 60);

    function fermer() { if (ov.parentNode) ov.parentNode.removeChild(ov); }

    function valider() {
      var d = (champ.value || '').toUpperCase().trim();
      if (!valide(d)) {
        err.textContent = 'Deux chiffres, ou 2A / 2B.';
        champ.style.borderColor = '#C0392B';
        return;
      }
      fermer();
      poser(d);
    }

    ov.querySelector('#ngz-ok').addEventListener('click', valider);
    ov.querySelector('#ngz-non').addEventListener('click', fermer);
    ov.querySelector('#ngz-geo').addEventListener('click', function () {
      fermer();
      position().then(deptDesCoordonnees).then(function (d) {
        if (valide(d)) poser(d);
        else if (P && P.toast) P.toast('Position introuvable. Saisissez votre département.');
      }).catch(function () {
        if (P && P.toast) P.toast('Position refusée. Saisissez votre département.');
      });
    });
    champ.addEventListener('input', function () {
      err.textContent = ''; champ.style.borderColor = '#E2E5DE';
    });
    champ.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') valider();
      if (e.key === 'Escape') fermer();
    });
    /* Un clic hors de la carte referme, comme partout ailleurs. */
    ov.addEventListener('click', function (e) { if (e.target === ov) fermer(); });
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
