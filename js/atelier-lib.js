/* =====================================================================
   Novogarden — Bibliothèque « Atelier » (simulateurs itch.io)
   ---------------------------------------------------------------------
   Même principe que js/library.js pour l'impression 3D :
   - injecte un bouton « Bibliothèque de simulateurs » dans la fiche
     Cours & formation ;
   - ouvre un écran plein format, filtres Physique / Chimie ;
   - chaque appli renvoie vers sa page itch.io.
   Données : data/atelier.json.
   ===================================================================== */
(function () {
  'use strict';
  var C = '#3949AB', C_D = '#283593', C_L = '#eceffa';
  var CSS = ''
    + '#nga-ov{position:fixed;inset:0;z-index:9000;background:#f6f7fb;display:none;flex-direction:column;overflow:hidden}'
    + '#nga-ov.on{display:flex}'
    + '.nga-top{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:' + C + ';color:#fff}'
    + '.nga-top h2{font-size:17px;font-weight:800;margin:0}'
    + '.nga-x{background:rgba(255,255,255,.18);border:0;color:#fff;font-size:24px;width:38px;height:38px;border-radius:50%;cursor:pointer;line-height:1}'
    + '.nga-intro{padding:12px 16px 4px;font-size:13px;color:#4a4f63;line-height:1.45}'
    + '.nga-cats{display:flex;gap:8px;padding:8px 16px 4px;flex-wrap:wrap}'
    + '.nga-cat{border:1.5px solid ' + C + ';background:#fff;color:' + C + ';border-radius:20px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer}'
    + '.nga-cat.on{background:' + C + ';color:#fff}'
    + '.nga-grid{flex:1;overflow-y:auto;padding:10px 16px 30px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;align-content:start;grid-auto-rows:max-content}'
    + '.nga-c{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(20,25,60,.08);display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:transform .15s}'
    + '.nga-c:active{transform:scale(.98)}'
    + '.nga-img{aspect-ratio:315/250;background:' + C_L + ' center/cover no-repeat}'
    + '.nga-b{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;flex:1}'
    + '.nga-t{font-size:15px;font-weight:800;color:#1c1f2e}'
    + '.nga-tags{display:flex;gap:6px;flex-wrap:wrap}'
    + '.nga-tag{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:3px 8px;border-radius:10px;background:' + C_L + ';color:' + C_D + '}'
    + '.nga-d{font-size:12.5px;color:#5a6075;line-height:1.4;flex:1}'
    + '.nga-go{margin-top:4px;align-self:flex-start;background:' + C + ';color:#fff;font-size:12px;font-weight:800;padding:8px 14px;border-radius:10px}'
    + '.nga-foot{grid-column:1/-1;text-align:center;font-size:12px;color:#6b7086;padding:8px 0}'
    + '.nga-foot a{color:' + C + ';font-weight:800}'
    + '.nga-empty{grid-column:1/-1;text-align:center;color:#808080;padding:40px 12px;font-size:14px}';

  var DATA = null, filtre = '', chargement = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function construire() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var ov = document.createElement('div'); ov.id = 'nga-ov';
    ov.innerHTML = '<div class="nga-top"><h2>Bibliothèque de simulateurs</h2><button class="nga-x" id="nga-close" aria-label="Fermer">&times;</button></div>'
      + '<div class="nga-intro">La collection <strong>Atelier</strong> : des simulateurs de physique-chimie utilisés pendant les cours, '
      + 'à essayer gratuitement en ligne et à retrouver sur itch.io.</div>'
      + '<div class="nga-cats" id="nga-cats"></div><div class="nga-grid" id="nga-grid"></div>';
    document.body.appendChild(ov);
    document.getElementById('nga-close').onclick = function () { ov.classList.remove('on'); };
  }

  function grille() {
    var l = DATA.applis.filter(function (a) { return !filtre || a.theme === filtre; });
    var h = '';
    l.forEach(function (a) {
      h += '<a class="nga-c" href="' + esc(a.url) + '" target="_blank" rel="noopener">'
        + '<div class="nga-img" style="background-image:url(&quot;' + esc(a.img) + '&quot;)"></div>'
        + '<div class="nga-b"><div class="nga-t">' + esc(a.nom) + '</div>'
        + '<div class="nga-tags"><span class="nga-tag">' + esc(a.theme) + '</span><span class="nga-tag">' + esc(a.niveau) + '</span></div>'
        + '<div class="nga-d">' + esc(a.desc) + '</div><span class="nga-go">Ouvrir sur itch.io ↗</span></div></a>';
    });
    h += '<div class="nga-foot">' + DATA.applis.length + ' simulateurs · <a href="' + esc(DATA.boutique) + '" target="_blank" rel="noopener">Toute la collection sur itch.io ↗</a></div>';
    document.getElementById('nga-grid').innerHTML = h;
  }
  function categories() {
    var cats = [['', 'Tout'], ['Physique', 'Physique'], ['Chimie', 'Chimie']];
    var w = document.getElementById('nga-cats');
    w.innerHTML = cats.map(function (c) { return '<button class="nga-cat' + (filtre === c[0] ? ' on' : '') + '" data-c="' + c[0] + '">' + c[1] + '</button>'; }).join('');
    w.querySelectorAll('.nga-cat').forEach(function (b) { b.onclick = function () { filtre = this.getAttribute('data-c'); categories(); grille(); }; });
  }

  function ouvrir() {
    document.getElementById('nga-ov').classList.add('on');
    if (DATA) return;
    document.getElementById('nga-grid').innerHTML = '<div class="nga-empty">Chargement…</div>';
    if (!chargement) chargement = fetch('data/atelier.json').then(function (r) { return r.json(); })
      .then(function (j) { DATA = j; categories(); grille(); })
      .catch(function () { chargement = null; document.getElementById('nga-grid').innerHTML = '<div class="nga-empty">Bibliothèque momentanément indisponible.</div>'; });
  }

  function injecter() {
    var g = document.querySelector('[data-ngb-grille="cours"]');
    if (!g || document.getElementById('nga-entree')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'nga-entree'; b.className = g.className;
    b.textContent = 'Bibliothèque de simulateurs';
    b.style.cssText = 'display:block;width:100%;margin:6px 0 2px;font-weight:700';
    b.onclick = ouvrir;
    g.parentNode.insertBefore(b, g);
  }

  function init() {
    construire();
    new MutationObserver(injecter).observe(document.body, { childList: true, subtree: true });
    injecter();
    window.NovogardenAtelier = { ouvrir: ouvrir };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
