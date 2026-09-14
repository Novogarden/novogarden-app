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
    + '#ng-zone-btn:active{background:#5a8e1e}';

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
  function redefinir() {
    if (!window.confirm('Redéfinir votre zone ? Le choix du département vous sera redemandé.')) return;
    try { localStorage.removeItem('ng_zone'); } catch (e) {}
    location.reload();
  }
  function carteZone() {
    var ecran = document.getElementById('compte');
    if (!ecran || document.getElementById('ng-zone-carte')) return;
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
  function majZone() {
    var v = document.getElementById('ng-zone-val');
    if (!v) return;
    var z = zoneLue();
    if (NOMS || !z || !z.dept) { v.textContent = libelle(z); return; }
    fetch('data/departements.json')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var src = j.departements || j.depts || j;
        NOMS = {};
        if (Array.isArray(src)) {
          src.forEach(function (x) {
            var c = x.code || x.dept || x.num, n = x.nom || x.name || x.libelle;
            if (c && n) NOMS[String(c)] = n;
          });
        } else {
          Object.keys(src).forEach(function (c) {
            var x = src[c];
            NOMS[c] = typeof x === 'string' ? x : (x.n || x.nom || x.name || c);
          });
        }
        v.textContent = libelle(zoneLue());
      })
      .catch(function () {});
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

    carteZone();
    new MutationObserver(carteZone).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
