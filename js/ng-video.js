/* Vidéo « Tout est lié » : une case de la grille des prestations, à côté de la
   tonte robotisée. Rien ne démarre seul :
   la vidéo s'ouvre en plein écran, avec le son, quand on appuie sur le bouton.
   Le fichier n'est téléchargé qu'à ce moment-là. */
(function () {
  var SRC = 'assets/tout_est_lie.mp4';

  var css = document.createElement('style');
  css.textContent =
    '.ngvid-btn{display:inline-flex;align-items:center;gap:6px;margin:6px auto 0;background:#fff;color:#1f4a1b;' +
    'border:none;border-radius:999px;padding:4px 12px 4px 5px;font:inherit;font-size:12.5px;font-weight:800;' +
    'cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.15)}' +
    '.ngvid-btn .rond{width:20px;height:20px;border-radius:50%;background:#2e7d32;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '.ngvid-btn .rond svg{width:8px;height:8px;fill:#fff;margin-left:2px}' +
    '.ngvid-btn .duree{font-weight:600;color:#5d6b5d;font-size:11.5px}' +
    '.ngv-grid>.ngv-tile.ngvid-tile{background-size:cover;background-position:center 55%;justify-content:flex-end}' +
    '.ngvid-play{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35)}' +
    '.ngvid-play svg{width:16px;height:16px;fill:#1f4a1b;margin-left:3px}' +
    '#ngvid-ov{position:fixed;inset:0;z-index:10000;background:#000;display:flex;flex-direction:column}' +
    '#ngvid-ov video{flex:1;min-height:0;width:100%;background:#000}' +
    '#ngvid-ferme{background:#fff;color:#1f4a1b;border:none;font:inherit;font-size:18px;font-weight:800;' +
    'padding:16px;cursor:pointer;width:100%}';
  document.head.appendChild(css);

  function ouvrir() {
    if (document.getElementById('ngvid-ov')) { return; }
    var ov = document.createElement('div');
    ov.id = 'ngvid-ov';
    var v = document.createElement('video');
    v.src = SRC;
    v.controls = true;
    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    var f = document.createElement('button');
    f.id = 'ngvid-ferme';
    f.type = 'button';
    f.textContent = '✕  Fermer la vidéo';
    function fermer() { v.pause(); ov.remove(); history.state && history.state.ngvid && history.back(); }
    f.addEventListener('click', fermer);
    v.addEventListener('ended', fermer);
    ov.appendChild(v);
    ov.appendChild(f);
    document.body.appendChild(ov);
    /* Le bouton « retour » du téléphone ferme la vidéo au lieu de quitter l'appli. */
    try { history.pushState({ ngvid: 1 }, ''); } catch (e) {}
    var p = v.play();
    if (p && p.catch) { p.catch(function () {}); }
  }
  window.addEventListener('popstate', function () {
    var ov = document.getElementById('ngvid-ov');
    if (ov) { var v = ov.querySelector('video'); if (v) { v.pause(); } ov.remove(); }
  });

  /* Une case de la grille, de la même taille que les prestations, juste après
     la tonte robotisée. Elle n'est jamais masquée par le choix du département. */
  function tuile() {
    var t = document.createElement('button');
    t.type = 'button';
    t.className = 'ngv-tile ngvid-tile';
    t.setAttribute('data-ngv', 'video');
    t.style.backgroundImage = "linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,.1) 35%,rgba(0,0,0,.1) 55%,#1f4a1be0 100%),url('assets/video_poster.jpg')";
    t.innerHTML = '<span class="ngvid-play"><svg viewBox="0 0 10 12"><path d="M0 0L10 6L0 12Z"/></svg></span>' +
      '<div><div class="lab">Novogarden en vidéo</div><div class="sub2">Tout comprendre en 53 secondes</div></div>';
    t.addEventListener('click', function (e) { e.stopPropagation(); ouvrir(); });
    return t;
  }

  function placer() {
    var g = document.querySelector('.ngv-grid');
    if (!g || g.querySelector('.ngvid-tile')) { return; }
    var tonte = g.querySelector('[data-ngv="tonte"]');
    var t = tuile();
    if (tonte && tonte.nextSibling) { g.insertBefore(t, tonte.nextSibling); } else { g.appendChild(t); }
    /* Même répartition que js/ng-zone.js : nombre pair, toutes les cases à la même taille. */
    var vis = [].slice.call(g.querySelectorAll('[data-ngv]')).filter(function (e) { return !e.classList.contains('ngv-hors-zone'); });
    var n = vis.length;
    g.setAttribute('data-n', String(Math.max(1, Math.min(n, 8))));
    vis.forEach(function (e) { e.classList.remove('ngv-large'); });
    if (n >= 5 && n % 2 === 1 && vis[0]) { vis[0].classList.add('ngv-large'); }
  }
  new MutationObserver(placer).observe(document.body, { childList: true, subtree: true });
  placer();
})();
