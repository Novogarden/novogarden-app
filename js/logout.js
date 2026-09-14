/* =====================================================================
   Novogarden — Déconnexion accessible depuis n'importe quel écran
   ---------------------------------------------------------------------
   Le bouton « Se déconnecter » existe déjà, mais il est enfoui dans
   l'écran Compte. Ce module ajoute un accès direct dans la barre du
   haut, visible dès qu'une session est ouverte.
   ===================================================================== */
(function () {
  'use strict';

  var CSS = ''
    + '#ng-logout{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);'
    + 'color:#fff;width:38px;height:38px;border-radius:50%;cursor:pointer;display:none;'
    + 'align-items:center;justify-content:center;padding:0;flex:0 0 auto;margin-left:6px}'
    + '#ng-logout.on{display:flex}'
    + '#ng-logout:active{background:rgba(255,255,255,.3)}'
    + '#ng-logout svg{display:block;pointer-events:none}';

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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
