/* Novogarden - balayage des notifications.
   Autonome : ne touche pas au rendu existant, il observe la liste et
   rebranche ce qu'il faut a chaque redessin. */
(function (global) {
  'use strict';

  var CLE = 'ng_notifs_masques';
  var CLE_LUS = 'ng_notifs_lus';
  var SEUIL = 90;
  var blocageClic = 0;

  function lire(cle) {
    try { return JSON.parse(localStorage.getItem(cle)) || {}; } catch (e) { return {}; }
  }
  function ecrire(cle, m) {
    try { localStorage.setItem(cle, JSON.stringify(m)); } catch (e) {}
  }
  function liste() { return document.getElementById('notif-list'); }

  function majBadge() {
    var l = liste(); if (!l) { return; }
    var n = l.querySelectorAll('.notif-item.unread:not(.ngn-masque)').length;
    var ids = ['bell-badge', 'bell-badge-t'];
    for (var i = 0; i < ids.length; i++) {
      var b = document.getElementById(ids[i]);
      if (b) { b.textContent = n; b.style.display = n > 0 ? 'flex' : 'none'; }
    }
  }

  function majBouton() {
    var b = document.getElementById('notif-restore');
    if (!b) { return; }
    var n = Object.keys(lire(CLE)).length;
    b.textContent = 'Retablir (' + n + ')';
    b.style.display = n ? 'inline-block' : 'none';
  }

  function masquer(id) {
    var m = lire(CLE); m[id] = 1; ecrire(CLE, m);
    var lus = lire(CLE_LUS); lus[id] = 1; ecrire(CLE_LUS, lus);
    majBouton(); majBadge();
  }

  function retablir() {
    ecrire(CLE, {});
    appliquer(); majBouton(); majBadge();
  }

  function brancher(el) {
    if (el.__ngn) { return; }
    el.__ngn = true;
    var x0 = 0, y0 = 0, dx = 0, actif = false, glisse = false;

    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) { return; }
      actif = true; glisse = false; dx = 0;
      x0 = e.clientX; y0 = e.clientY;
      el.style.transition = '';
    });

    el.addEventListener('pointermove', function (e) {
      if (!actif) { return; }
      dx = e.clientX - x0;
      var dy = e.clientY - y0;
      if (!glisse) {
        if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) { return; }
        glisse = true;
        try { el.setPointerCapture(e.pointerId); } catch (er) {}
      }
      el.style.transform = 'translateX(' + dx + 'px)';
      el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 280));
    });

    function fin() {
      if (!actif) { return; }
      actif = false;
      el.style.transition = 'transform .18s ease-out,opacity .18s ease-out';
      if (glisse && Math.abs(dx) > SEUIL) {
        blocageClic = Date.now();
        var sens = dx > 0 ? 1 : -1;
        var id = el.getAttribute('data-ngj');
        el.style.transform = 'translateX(' + (sens * 420) + 'px)';
        el.style.opacity = '0';
        setTimeout(function () {
          el.classList.add('ngn-masque');
          el.style.transform = ''; el.style.opacity = ''; el.style.transition = '';
          masquer(id);
        }, 180);
      } else {
        if (glisse) { blocageClic = Date.now(); }
        el.style.transform = ''; el.style.opacity = '';
      }
      glisse = false;
    }
    el.addEventListener('pointerup', fin);
    el.addEventListener('pointercancel', fin);
    el.addEventListener('lostpointercapture', fin);

    el.addEventListener('click', function (e) {
      if (Date.now() - blocageClic < 400) {
        e.stopPropagation(); e.preventDefault();
      }
    }, true);
  }

  function appliquer() {
    var l = liste(); if (!l) { return; }
    var m = lire(CLE);
    var els = l.querySelectorAll('.notif-item[data-ngj]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var id = el.getAttribute('data-ngj');
      if (m[id]) { el.classList.add('ngn-masque'); }
      else {
        el.classList.remove('ngn-masque');
        el.style.transform = ''; el.style.opacity = '';
      }
      brancher(el);
    }
  }

  function demarrer(essais) {
    var l = liste();
    if (!l) {
      if (essais > 0) { setTimeout(function () { demarrer(essais - 1); }, 300); }
      return;
    }
    appliquer(); majBouton(); majBadge();
    try {
      new MutationObserver(function () {
        appliquer(); majBouton(); majBadge();
      }).observe(l, { childList: true });
    } catch (e) {}
  }

  global.NGNotifs = { retablir: retablir, appliquer: appliquer };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { demarrer(40); });
  } else { demarrer(40); }
})(window);
