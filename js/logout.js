/* =====================================================================
   Novogarden — Compléments de l'écran Compte
   ---------------------------------------------------------------------
   1. Déconnexion : le bouton existe déjà mais il est enfoui dans
      l'écran Compte. Accès direct ajouté dans la barre du haut.
   2. Localisation : rappel de la zone retenue (clé ng_zone) avec un
      bouton pour la redéfinir, en haut de l'écran Compte.
   ===================================================================== */
(function () {
  'use strict';

  var CSS = ''
    + '#ng-logout{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);'
    + 'color:#fff;width:38px;height:38px;border-radius:50%;cursor:pointer;display:none;'
    + 'align-items:center;justify-content:center;padding:0;flex:0 0 auto;margin-left:6px}'
    + '#ng-logout.on{display:flex}'
    + '#ng-logout:active{background:rgba(255,255,255,.3)}'
    + '#ng-logout svg{display:block;pointer-events:none}'
    + '#ng-zone-carte{display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E8E6E6;'
    + 'border-radius:12px;padding:12px 14px;margin:0 0 14px}'
    + '#ng-zone-carte .z-i{width:34px;height:34px;border-radius:50%;background:#eaf5dc;display:flex;'
    + 'align-items:center;justify-content:center;flex:0 0 auto}'
    + '#ng-zone-carte .z-t{flex:1;min-width:0}'
    + '#ng-zone-carte .z-l{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#808080;font-weight:700}'
    + '#ng-zone-carte .z-v{font-size:14px;color:#14140F;font-weight:600;margin-top:2px}'
    + '#ng-zone-btn{background:#7DB532;color:#fff;border:0;border-radius:999px;padding:8px 15px;'
    + 'font-size:12.5px;font-weight:700;cursor:pointer;flex:0 0 auto}'
    + '#ng-zone-btn:active{background:#5a8e1e}'
    + '#ng-dept-ov{position:fixed;inset:0;z-index:9500;background:rgba(20,25,15,.55);display:none;'
    + 'align-items:flex-end;justify-content:center}'
    + '#ng-dept-ov.on{display:flex}'
    + '#ng-dept-ov .d-box{background:#fff;width:100%;max-width:520px;max-height:82vh;'
    + 'border-radius:16px 16px 0 0;display:flex;flex-direction:column;overflow:hidden}'
    + '#ng-dept-ov .d-top{background:#7DB532;color:#fff;padding:14px 16px;font-weight:700;'
    + 'letter-spacing:.04em;font-size:14px;display:flex;align-items:center}'
    + '#ng-dept-ov .d-x{margin-left:auto;background:rgba(255,255,255,.2);border:0;color:#fff;'
    + 'width:28px;height:28px;border-radius:50%;font-size:17px;cursor:pointer;line-height:1}'
    + '#ng-dept-ov #ng-dept-q{margin:12px;padding:11px 13px;border:1px solid #E8E6E6;border-radius:12px;'
    + 'font-size:15px;outline:none}'
    + '#ng-dept-ov #ng-dept-q:focus{border-color:#7DB532}'
    + '#ng-dept-ov .d-liste{overflow-y:auto;padding:0 12px 16px;-webkit-overflow-scrolling:touch}'
    + '#ng-dept-ov .d-i{display:flex;align-items:center;gap:11px;width:100%;text-align:left;'
    + 'background:#fff;border:0;border-bottom:1px solid #F0EFEA;padding:12px 4px;font-size:14.5px;'
    + 'color:#14140F;cursor:pointer}'
    + '#ng-dept-ov .d-i:active{background:#eaf5dc}'
    + '#ng-dept-ov .d-c{display:inline-flex;align-items:center;justify-content:center;min-width:34px;'
    + 'height:26px;border-radius:7px;background:#eaf5dc;color:#5a8e1e;font-weight:700;font-size:12.5px}'
    + '#ng-dept-ov .d-vide{padding:26px 8px;text-align:center;color:#808080;font-size:13.5px}';

  var ICONE = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff"'
    + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>'
    + '<path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';

  function connecte() {
    var b = document.getElementById('topbar-auth-btn');
    if (!b) return false;
    var t = (b.textContent || '').trim();
    return t !== '' && !/connexion|se connecter|compte/i.test(t);
  }

  function deconnecter() {
    if (!window.confirm('Se déconnecter de votre compte Novogarden ?')) return;
    if (typeof window.doLogout === 'function') { window.doLogout(); return; }
    var b = document.querySelector('.btn-logout');
    if (b) { b.click(); return; }
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    location.reload();
  }

  /* ------------------------------------------------------ localisation */
  var PIN = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5a8e1e"'
    + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  var NOMS = null;
  function zoneLue() {
    try { return JSON.parse(localStorage.getItem('ng_zone') || 'null'); } catch (e) { return null; }
  }
  function libelle(z) {
    if (!z || !z.dept) return 'Non renseignée';
    var n = NOMS && NOMS[z.dept];
    return n ? n + ' (' + z.dept + ')' : 'Département ' + z.dept;
  }
  /* Sélecteur de département : liste complète + recherche par code postal.
     Les prestations couvertes sont relues côté serveur pour que l'app
     filtre correctement les services proposés. */
  function client() {
    var n = window.NGP;
    if (n) { if (n.sb && n.sb.rpc) return n.sb; if (n.client && n.client.rpc) return n.client; }
    return null;
  }

  function redefinir() {
    var ov = document.getElementById('ng-dept-ov');
    if (ov) { ov.classList.add('on'); return; }

    ov = document.createElement('div');
    ov.id = 'ng-dept-ov';
    ov.innerHTML =
      '<div class="d-box">'
      + '<div class="d-top">Choisissez votre département'
      + '<button type="button" class="d-x" id="ng-dept-x">&times;</button></div>'
      + '<input type="search" id="ng-dept-q" placeholder="Code postal ou nom du département…" autocomplete="off">'
      + '<div class="d-liste" id="ng-dept-l"><div class="d-vide">Chargement…</div></div>'
      + '</div>';
    document.body.appendChild(ov);
    ov.classList.add('on');
    ov.onclick = function (e) { if (e.target === ov) ov.classList.remove('on'); };
    document.getElementById('ng-dept-x').onclick = function () { ov.classList.remove('on'); };

    var liste = [];
    var rendre = function (q) {
      var l = liste;
      if (q) {
        var s = q.trim().toLowerCase();
        var cp = /^\d{2,5}$/.test(s) ? (s.length >= 3 && s.charAt(0) === '9' && s.charAt(1) === '7'
          ? s.slice(0, 3) : s.slice(0, 2)) : null;
        l = liste.filter(function (d) {
          return (cp && d.code.indexOf(cp) === 0) || d.nom.toLowerCase().indexOf(s) >= 0 || d.code === s;
        });
      }
      var el = document.getElementById('ng-dept-l');
      if (!l.length) { el.innerHTML = '<div class="d-vide">Aucun département trouvé.</div>'; return; }
      el.innerHTML = l.slice(0, 120).map(function (d) {
        return '<button type="button" class="d-i" data-c="' + d.code + '">'
          + '<span class="d-c">' + d.code + '</span>' + d.nom + '</button>';
      }).join('');
      [].forEach.call(el.children, function (b) {
        b.onclick = function () { choisir(b.dataset.c, ov); };
      });
    };

    var remplir = function () {
      liste = Object.keys(NOMS).map(function (c) { return { code: c, nom: NOMS[c] }; })
        .sort(function (a, b) { return a.code.localeCompare(b.code); });
      rendre('');
      document.getElementById('ng-dept-q').oninput = function (e) { rendre(e.target.value); };
    };

    if (NOMS) { remplir(); }
    else {
      chargerNoms().then(remplir).catch(function () {
        document.getElementById('ng-dept-l').innerHTML =
          '<div class="d-vide">Liste indisponible. Réessayez plus tard.</div>';
      });
    }
  }

  function choisir(code, ov) {
    var el = document.getElementById('ng-dept-l');
    el.innerHTML = '<div class="d-vide">Vérification des prestations couvertes…</div>';
    var c = client();
    var fin = function (services) {
      try {
        localStorage.setItem('ng_zone', JSON.stringify({
          dept: code, services: services || [], t: Date.now()
        }));
      } catch (e) {}
      location.reload();
    };
    if (!c) {
      el.innerHTML = '<div class="d-vide">Connexion au serveur indisponible. Réessayez dans un instant.</div>';
      return;
    }
    c.rpc('services_couverts', { p_departement: code })
      .then(function (r) { fin(r && !r.error ? (r.data || []) : []); })
      .catch(function () { fin([]); });
  }
  function carteZone() {
    var ecran = document.getElementById('compte');
    if (!ecran || document.getElementById('ng-zone-carte')) return;
    if (!ecran.firstChild) return;
    var d = document.createElement('div');
    d.id = 'ng-zone-carte';
    d.innerHTML = '<span class="z-i">' + PIN + '</span>'
      + '<span class="z-t"><span class="z-l">Ma localisation</span>'
      + '<span class="z-v" id="ng-zone-val">' + libelle(zoneLue()) + '</span></span>'
      + '<button type="button" id="ng-zone-btn">Modifier</button>';
    ecran.insertBefore(d, ecran.firstChild);
    document.getElementById('ng-zone-btn').onclick = redefinir;
    majZone();
  }
  var promesseNoms = null;
  function chargerNoms() {
    if (NOMS) return Promise.resolve(NOMS);
    if (promesseNoms) return promesseNoms;
    promesseNoms = fetch('data/departements.json')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var src = j.departements || j.depts || j;
        NOMS = {};
        if (Array.isArray(src)) {
          src.forEach(function (x) {
            var c = x.code || x.dept || x.num, n = x.n || x.nom || x.name || x.libelle;
            if (c && n) NOMS[String(c)] = n;
          });
        } else {
          Object.keys(src).forEach(function (c) {
            var x = src[c];
            NOMS[c] = typeof x === 'string' ? x : (x.n || x.nom || x.name || c);
          });
        }
        return NOMS;
      });
    return promesseNoms;
  }

  function majZone() {
    var v = document.getElementById('ng-zone-val');
    if (!v) return;
    var z = zoneLue();
    v.textContent = libelle(z);
    if (!NOMS && z && z.dept) {
      chargerNoms().then(function () {
        var e = document.getElementById('ng-zone-val');
        if (e) e.textContent = libelle(zoneLue());
      }).catch(function () {});
    }
  }

  function init() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var ref = document.getElementById('topbar-auth-btn');
    if (!ref || !ref.parentNode) return;

    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'ng-logout';
    b.title = 'Se déconnecter';
    b.setAttribute('aria-label', 'Se déconnecter');
    b.innerHTML = ICONE;
    b.onclick = deconnecter;
    ref.parentNode.insertBefore(b, ref.nextSibling);

    var maj = function () { b.classList.toggle('on', connecte()); };
    maj();
    new MutationObserver(maj).observe(ref, { childList: true, subtree: true, characterData: true });
    setInterval(maj, 2000);

    /* Un intervalle plutôt qu'un MutationObserver sur <body> : l'observateur
       se redéclenchait sur ses propres insertions et saturait la boucle de
       micro-tâches, ce qui figeait la page. */
    carteZone();
    setInterval(carteZone, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
