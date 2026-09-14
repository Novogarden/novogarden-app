/* =====================================================================
   Novogarden — Bibliothèque pièces imprimables (NovoForge)
   ---------------------------------------------------------------------
   Autonome : ne dépend d'aucun autre module de l'app.
   - injecte un bouton « Bibliothèque pièces » dans la fiche du service
     Impression prototype dès qu'elle est affichée ;
   - ouvre un écran plein écran avec recherche, filtres, catégories ;
   - calcule le prix à partir de la grille tarifaire existante.

   Données : data/catalogue.json (miroir de la bibliothèque Cults).
   ===================================================================== */
(function () {
  'use strict';

  var ORANGE = '#C25E1B';
  var ORANGE_D = '#9c4a14';
  var ORANGE_L = '#fbf0e8';
  var CDN = 'https://images.cults3d.com/';
  var FBI = '=/246x246/filters:no_upscale()/https://fbi.cults3d.com/uploaders/13638839/illustration-file/';

  /* ---------------------------------------------------------- accents */
  var ACC = {
    cles: 'clés', cle: 'clé', percage: 'perçage', diametres: 'diamètres',
    reglette: 'réglette', regle: 'règle', graduee: 'graduée', graduees: 'graduées',
    fenetre: 'fenêtre', fenetres: 'fenêtres', etiquette: 'étiquette',
    sorciere: 'sorcière', araignee: 'araignée', araignees: 'araignées',
    degres: 'degrés', crane: 'crâne', erable: 'érable', decoupe: 'découpe',
    piece: 'pièce', pieces: 'pièces', noel: 'Noël', epices: 'épices',
    ecriture: 'écriture', cables: 'câbles', cable: 'câble', ecrous: 'écrous',
    millimetres: 'millimètres', egouttage: 'égouttage', echantillon: 'échantillon',
    alveoles: 'alvéoles', mediators: 'médiators', prenom: 'prénom',
    givre: 'givré', ajoure: 'ajouré', apero: 'apéro', boite: 'boîte',
    boites: 'boîtes', tete: 'tête', arriere: 'arrière', numero: 'numéro',
    repere: 'repère', reperes: 'repères', serie: 'série', modele: 'modèle',
    carree: 'carrée', carre: 'carré', etoile: 'étoile', etoiles: 'étoiles',
    coeur: 'cœur', fleche: 'flèche', trefle: 'trèfle', perce: 'percé',
    percee: 'percée', ferme: 'fermé', decor: 'décor', elastique: 'élastique',
    telephone: 'téléphone', cafe: 'café', the: 'thé', epaisseur: 'épaisseur',
    interieur: 'intérieur', exterieur: 'extérieur', cote: 'côté',
    reglable: 'réglable', sechage: 'séchage', aeration: 'aération',
    personnalise: 'personnalisé', eclair: 'éclair', etagere: 'étagère',
    ecole: 'école', diametre: 'diamètre', vegetal: 'végétal',
    gravee: 'gravée', grave: 'gravé', reperage: 'repérage',
    electrique: 'électrique', eponge: 'éponge', evier: 'évier',
    lumiere: 'lumière', pate: 'pâte', pates: 'pâtes', plie: 'plié',
    poele: 'poêle', rangee: 'rangée', releve: 'relevé', sechoir: 'séchoir',
    arque: 'arqué', tresse: 'tressé', dore: 'doré', ferree: 'ferrée'
  };
  function nomFr(raw) {
    var s = raw.split('_').map(function (m) { return ACC[m] || m; }).join(' ');
    s = s.replace(/\b([dlnjcmst])\s+(?=[aeiouyhéèêàâîôû])/gi, "$1'");
    s = s.replace(/\ba\s+(?=[a-zé])/g, 'à ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ------------------------------------------------- désignations
     Une phrase d'usage déduite du type d'objet : le nom seul ne suffit
     pas toujours à comprendre à quoi sert la pièce.                   */
  var DESC = [
    [/^porte_cles/, "Porte-clés à glisser sur un trousseau ou un sac."],
    [/^porte_savon/, "Porte-savon avec égouttage, pour évier ou douche."],
    [/^porte_(forets|pinceaux|outils|stylos|embouts|cartes)/, "Rangement à poser sur l'établi ou le bureau, chaque élément à sa place."],
    [/^porte_/, "Support de rangement à poser ou à fixer."],
    [/^dessous_de_verre/, "Dessous de verre : protège la table des traces et de la chaleur."],
    [/^dessous_de_plat/, "Dessous de plat : pour poser un plat chaud sans marquer la table."],
    [/^marque_page/, "Marque-page plat, à glisser entre les pages sans les abîmer."],
    [/^marque_place/, "Marque-place à poser sur la table pour indiquer le couvert de chaque invité."],
    [/^marque_verre/, "Marqueur de verre : se clipse sur le pied pour que chacun retrouve le sien."],
    [/^emporte_piece/, "Emporte-pièce : découpe la pâte à biscuits d'un geste net, se démoule sans coller."],
    [/^pochoir/, "Pochoir à maintenir contre le support pour peindre ou tracer le motif."],
    [/^gabarit/, "Gabarit de traçage et de perçage, à poser directement sur la pièce à travailler."],
    [/^(jauge|reglette|regle)/, "Instrument de mesure gradué, à lire directement sur la pièce."],
    [/^suspension/, "Décoration à suspendre, anneau de fixation intégré."],
    [/^etiquette/, "Étiquette à accrocher, texte en relief."],
    [/^plaque_de_porte/, "Plaque de porte à fixer ou à suspendre, lettres en relief."],
    [/^plaque_murale/, "Plaque décorative à fixer au mur, deux trous de suspension."],
    [/^(panneau|enseigne)/, "Panneau décoratif à fixer ou à suspendre."],
    [/^support_mural/, "Support à fixer au mur, perçages prévus."],
    [/^support/, "Support de maintien à poser."],
    [/^(rack|range|casier|organiseur)/, "Rangement compartimenté, à poser ou à fixer."],
    [/^repose/, "Repose-objet à poser : évite de salir le plan de travail."],
    [/^crochet/, "Crochet à fixer, pour suspendre un objet léger."],
    [/^rond_de_serviette/, "Rond de serviette pour dresser la table."],
    [/^photophore/, "Photophore à poser autour d'une bougie LED."],
    [/^grattoir/, "Grattoir à passer sur la surface pour décoller ce qui adhère."],
    [/^raclette/, "Raclette à passer à plat pour racler une surface."],
    [/^planche/, "Planche de travail à poser à plat."],
    [/^(boite|bloc|bac|coffret)/, "Contenant à poser, compartiments séparés."],
    [/^plateau/, "Plateau à poser, rebord qui retient le contenu."],
    [/^guide/, "Guide à poser sur la pièce pour couper ou tracer droit."],
    [/^cle_/, "Clé de serrage à main."],
    [/^clips?/, "Clip de fermeture, à pincer sur le bord."],
    [/^medaille/, "Médaille à graver, anneau de suspension intégré."],
    [/^peigne/, "Peigne à passer sur la surface."],
    [/^ouvre/, "Ouvre-bocal à prise renforcée, pour desserrer un couvercle sans forcer."],
    [/^cadre/, "Cadre à poser ou à fixer."],
    [/^(tri|bac_de_tri)/, "Bac de tri à poser, une case par catégorie."],
    [/^equerre/, "Équerre de traçage graduée, pour reporter un angle droit ou biseauté."],
    [/^rapporteur/, "Rapporteur d'angle à poser sur la pièce pour lire ou reporter une mesure."],
    [/^lisseur/, "Lisseur de joint : plusieurs profils pour égaliser un cordon de silicone."],
    [/^(corne|racloir)/, "Racloir à pâte : décolle, divise et racle le plan de travail."],
    [/^mesure/, "Mesureur de portions : une ouverture par quantité, plus besoin de peser."],
    [/^enrouleur/, "Enrouleur pour ranger un câble sans nœud."],
    [/^marqueur/, "Marqueur à planter dans le pot, texte à écrire ou à graver."],
    [/^passe_cable/, "Passe-câble à visser pour faire passer les fils proprement."]
  ];
  var DESC_FAM = {
    'Emporte-pièce': "Emporte-pièce pour pâte à biscuits.",
    'Pochoir': "Pochoir à maintenir contre le support pour tracer le motif.",
    'Suspension': "Décoration à suspendre.",
    'Marque-page': "Marque-page plat à glisser entre les pages.",
    'Plaque': "Plaque décorative à fixer ou à poser.",
    'Gabarit': "Gabarit de mesure et de traçage.",
    'Dessous de verre': "Dessous de verre pour protéger la table.",
    'Support': "Support de rangement à poser ou à fixer.",
    'Rangement': "Rangement compartimenté à poser.",
    'Petite pièce': "Petite pièce fonctionnelle.",
    'Ustensile': "Ustensile à main.",
    'Divers': "Pièce décorative ou utilitaire."
  };
  function designation(raw, fam) {
    for (var i = 0; i < DESC.length; i++) if (DESC[i][0].test(raw)) return DESC[i][1];
    return DESC_FAM[fam] || "Pièce imprimée en 3D.";
  }

  /* ------------------------------------------------ moteur de coût */
  var P = {
    bobine: 22, echec: 8, machine: 0.25, debit: 9, amorce: 0.08,
    mo_min: 8, mo_h: 35, plateau: 256, jeu: 5, qte_ess: 5, qte_ser: 10
  };
  var MAT = {
    pla:  { nom: 'PLA',        d: 1.24, coef: 1.00 },
    petg: { nom: 'PETG',       d: 1.27, coef: 1.00 },
    abs:  { nom: 'ABS / ASA',  d: 1.04, coef: 1.25 },
    tpu:  { nom: 'TPU',        d: 1.21, coef: 1.25 }
  };
  var GRILLE = [
    [20,  { solo: 9,  essentiel: 39,  serenite: 70 }],
    [80,  { solo: 19, essentiel: 83,  serenite: 150 }],
    [240, { solo: 39, essentiel: 170, serenite: 305 }],
    [600, { solo: 79, essentiel: 345, serenite: 615 }]
  ];
  var FIN = [
    { id: 'poncage',  nom: 'Ponçage / lissage',    prix: 9 },
    { id: 'peinture', nom: 'Apprêt + peinture',    prix: 15 },
    { id: 'insert',   nom: "Pose d'insert laiton", prix: 1 }
  ];

  function fVol(z) { return Math.max(0.4, Math.min(1, 0.4 + 0.6 * (4 / Math.max(z, 0.1)))); }

  function physique(m, matId) {
    var mat = MAT[matId || 'pla'];
    var x = m.b[0], y = m.b[1], z = m.b[2];
    var vol = x * y * z * m.k * fVol(z);
    var debit = P.debit * (0.55 + 0.45 * Math.min(1, z / 10));
    return {
      mat: mat,
      masse: vol / 1000 * mat.d,
      temps: vol / debit / 3600 + P.amorce,
      plateau: Math.max(1, Math.floor(P.plateau / (x + P.jeu)) * Math.floor(P.plateau / (y + P.jeu)))
    };
  }
  function tranche(masse) {
    for (var i = 0; i < GRILLE.length; i++) if (masse <= GRILLE[i][0]) return GRILLE[i][1];
    return null;
  }
  function prix(m, o) {
    var ph = physique(m, o.matiere);
    var t = tranche(ph.masse);
    if (!t) return { devis: true, ph: ph };
    var qte = o.pack === 'solo' ? 1 : (o.pack === 'essentiel' ? P.qte_ess : P.qte_ser);
    var base = t[o.pack], total = base;
    var l = [['Grille — ' + (qte === 1 ? "à l'unité" : 'pack de ' + qte) + ' (' + Math.round(ph.masse) + ' g)', base]];
    if (ph.mat.coef > 1) { var s = base * (ph.mat.coef - 1); total += s; l.push(['Matière technique (' + ph.mat.nom + ')', s]); }
    if (o.multi) { var s2 = base * 0.2; total += s2; l.push(['Impression multicolore', s2]); }
    FIN.forEach(function (f) { if (o[f.id]) { total += f.prix * qte; l.push([f.nom + ' × ' + qte, f.prix * qte]); } });
    if (o.urgence) { var s3 = total * 0.2; total += s3; l.push(['Urgence sous 48 h', s3]); }
    total += 6; l.push(['Envoi suivi', 6]);
    return { devis: false, total: total, lignes: l, qte: qte, ph: ph };
  }

  /* ---------------------------------------------------------- styles */
  var CSS = ''
    + '#ngl-ov{position:fixed;inset:0;z-index:9000;background:#FAF9F5;display:none;flex-direction:column;font-family:inherit}'
    + '#ngl-ov.on{display:flex}'
    + '.ngl-top{background:' + ORANGE + ';color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;flex:0 0 auto}'
    + '.ngl-top h2{margin:0;font-size:16px;letter-spacing:.05em;text-transform:uppercase;font-weight:700}'
    + '.ngl-x{margin-left:auto;background:rgba(255,255,255,.18);border:0;color:#fff;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer}'
    + '.ngl-bar{padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;background:#fff;border-bottom:1px solid #E8E6E6;flex:0 0 auto}'
    + '.ngl-bar input,.ngl-bar select{padding:9px 11px;border:1px solid #E8E6E6;border-radius:12px;font-size:14px;background:#fff;color:#14140F;outline:none}'
    + '.ngl-bar input{flex:1;min-width:150px}'
    + '.ngl-bar input:focus,.ngl-bar select:focus{border-color:' + ORANGE + '}'
    + '.ngl-cats{display:flex;gap:7px;overflow-x:auto;padding:10px 12px 4px;flex:0 0 auto;-webkit-overflow-scrolling:touch}'
    + '.ngl-cat{white-space:nowrap;border:1px solid #E8E6E6;background:#fff;border-radius:999px;padding:7px 14px;font-size:13px;cursor:pointer;color:#14140F}'
    + '.ngl-cat.on{background:' + ORANGE + ';border-color:' + ORANGE + ';color:#fff;font-weight:600}'
    + '.ngl-n{padding:2px 14px 8px;font-size:12px;color:#808080;flex:0 0 auto}'
    + '.ngl-grid{flex:1;overflow-y:auto;padding:0 12px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:11px;align-content:start;grid-auto-rows:min-content}'
    + '.ngl-c{background:#fff;border:1px solid #E8E6E6;border-radius:12px;overflow:hidden;cursor:pointer}'
    + '.ngl-th{position:relative;height:150px;background:' + ORANGE_L + '}'
    + '.ngl-th img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.ngl-bg{position:absolute;right:7px;bottom:7px;min-width:46px;height:46px;border-radius:999px;background:#fff;border:2px solid ' + ORANGE + ';color:' + ORANGE_D + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;padding:0 6px}'
    + '.ngl-b{padding:9px 10px 11px}'
    + '.ngl-t{font-size:12.5px;font-weight:600;line-height:1.3;color:#14140F;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:33px}'
    + '.ngl-d{font-size:11px;line-height:1.35;color:#808080;margin-top:4px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}'
    + '.ngl-s-d{font-size:13.5px;line-height:1.5;color:#14140F;background:' + ORANGE_L + ';border-radius:10px;padding:11px 13px;margin:10px 0 4px}'
    + '.ngl-m{font-size:10.5px;color:#808080;margin-top:4px;display:flex;gap:7px;flex-wrap:wrap}'
    + '.ngl-tag{background:' + ORANGE_L + ';color:' + ORANGE_D + ';padding:2px 6px;border-radius:5px;font-weight:600}'
    + '#ngl-sheet{position:fixed;inset:0;z-index:9100;background:rgba(20,15,10,.55);display:none;overflow-y:auto;padding:18px 12px}'
    + '#ngl-sheet.on{display:block}'
    + '.ngl-s{background:#fff;border-radius:16px;max-width:620px;margin:0 auto;overflow:hidden}'
    + '.ngl-s-img{background:' + ORANGE_L + ';height:200px}'
    + '.ngl-s-img img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.ngl-s-b{padding:18px}'
    + '.ngl-s-b h3{margin:0 0 3px;font-size:18px;color:#14140F}'
    + '.ngl-sub{color:#808080;font-size:12px;margin-bottom:14px}'
    + '.ngl-lab{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#808080;margin:12px 0 6px}'
    + '.ngl-chips{display:flex;flex-wrap:wrap;gap:6px}'
    + '.ngl-chip{border:1px solid #E8E6E6;background:#fff;border-radius:999px;padding:7px 13px;font-size:12.5px;cursor:pointer;color:#14140F}'
    + '.ngl-chip.on{background:' + ORANGE + ';border-color:' + ORANGE + ';color:#fff;font-weight:600}'
    + '.ngl-chk{display:flex;align-items:center;gap:8px;font-size:13px;padding:5px 0;cursor:pointer;color:#14140F}'
    + '.ngl-chk input{accent-color:' + ORANGE + ';width:16px;height:16px}'
    + '.ngl-rec{background:#FAF9F5;border-radius:12px;padding:13px 15px;margin-top:14px}'
    + '.ngl-rl{display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:#808080;gap:12px}'
    + '.ngl-rl b{color:#14140F}'
    + '.ngl-tot{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #E8E6E6;margin-top:9px;padding-top:10px;font-weight:700}'
    + '.ngl-tot span:last-child{font-size:24px;color:' + ORANGE_D + '}'
    + '.ngl-cta{display:block;width:100%;margin-top:12px;background:' + ORANGE + ';color:#fff;border:0;border-radius:12px;padding:13px;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;text-align:center;text-decoration:none}'
    + '.ngl-cta.gh{background:#fff;color:' + ORANGE_D + ';border:1.5px solid ' + ORANGE + '}'
    + '.ngl-note{font-size:11px;color:#808080;text-align:center;margin-top:10px;line-height:1.5}'
    + '.ngl-empty{grid-column:1/-1;text-align:center;color:#808080;padding:40px 12px;font-size:14px}';

  /* ------------------------------------------------------------ état */
  var DATA = null, etat = { q: '', cat: '', tri: 'prix' }, opts = null, courant = null;

  var img = function (m) { return CDN + m.ih + FBI + m.u + '/' + m.r + '__apercu_3d.png'; };
  var eur = function (v) { return v.toFixed(2).replace('.', ',') + ' €'; };
  var eur0 = function (v) { return Math.round(v) + ' €'; };

  /* ------------------------------------------------------------ vues */
  function construire() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    var ov = document.createElement('div'); ov.id = 'ngl-ov';
    ov.innerHTML =
      '<div class="ngl-top"><h2>Bibliothèque pièces</h2>'
      + '<button class="ngl-x" id="ngl-close">&times;</button></div>'
      + '<div class="ngl-bar"><input type="search" id="ngl-q" placeholder="Rechercher une pièce…">'
      + '<select id="ngl-tri"><option value="prix">Prix croissant</option>'
      + '<option value="nom">Nom</option><option value="masse">Taille</option>'
      + '<option value="vues">Les plus vues</option></select></div>'
      + '<div class="ngl-cats" id="ngl-cats"></div>'
      + '<div class="ngl-n" id="ngl-n"></div>'
      + '<div class="ngl-grid" id="ngl-grid"></div>';
    document.body.appendChild(ov);

    var sh = document.createElement('div'); sh.id = 'ngl-sheet';
    sh.innerHTML = '<div class="ngl-s" id="ngl-s"></div>';
    document.body.appendChild(sh);

    document.getElementById('ngl-close').onclick = fermer;
    document.getElementById('ngl-q').oninput = function (e) { etat.q = e.target.value; grille(); };
    document.getElementById('ngl-tri').onchange = function (e) { etat.tri = e.target.value; grille(); };
    sh.onclick = function (e) { if (e.target.id === 'ngl-sheet') sh.classList.remove('on'); };
  }

  function categories() {
    var c = {}; DATA.forEach(function (m) { c[m.f] = (c[m.f] || 0) + 1; });
    var l = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
    var h = '<button class="ngl-cat' + (etat.cat ? '' : ' on') + '" data-c="">Tout (' + DATA.length + ')</button>';
    l.forEach(function (f) {
      h += '<button class="ngl-cat' + (etat.cat === f ? ' on' : '') + '" data-c="' + f + '">' + f + ' (' + c[f] + ')</button>';
    });
    var el = document.getElementById('ngl-cats');
    el.innerHTML = h;
    [].forEach.call(el.children, function (b) {
      b.onclick = function () { etat.cat = b.dataset.c; categories(); grille(); };
    });
  }

  function grille() {
    var l = DATA.slice();
    if (etat.cat) l = l.filter(function (m) { return m.f === etat.cat; });
    if (etat.q) {
      var q = etat.q.toLowerCase();
      l = l.filter(function (m) {
        return m.nom.toLowerCase().indexOf(q) >= 0 || m.f.toLowerCase().indexOf(q) >= 0
          || m.desc.toLowerCase().indexOf(q) >= 0;
      });
    }
    l.forEach(function (m) { if (!m._p) { var ph = physique(m, 'pla'); var t = tranche(ph.masse); m._ph = ph; m._p = t ? t.solo : null; } });
    var cmp = {
      prix: function (a, b) { return (a._p || 999) - (b._p || 999) || a._ph.masse - b._ph.masse; },
      masse: function (a, b) { return a._ph.masse - b._ph.masse; },
      vues: function (a, b) { return b.v - a.v; },
      nom: function (a, b) { return a.nom.localeCompare(b.nom); }
    };
    l.sort(cmp[etat.tri]);

    document.getElementById('ngl-n').textContent =
      l.length + ' pièce' + (l.length > 1 ? 's' : '') + (etat.cat ? ' — ' + etat.cat : '');

    var g = document.getElementById('ngl-grid');
    if (!l.length) { g.innerHTML = '<div class="ngl-empty">Aucune pièce ne correspond à cette recherche.</div>'; return; }
    g.innerHTML = l.map(function (m) {
      return '<div class="ngl-c" data-s="' + m.s + '">'
        + '<div class="ngl-th"><img loading="lazy" src="' + img(m) + '" alt="">'
        + '<div class="ngl-bg">' + (m._p ? eur0(m._p) : 'Devis') + '</div></div>'
        + '<div class="ngl-b"><div class="ngl-t">' + m.nom + '</div>'
        + '<div class="ngl-d">' + m.desc + '</div>'
        + '<div class="ngl-m"><span class="ngl-tag">' + m.f + '</span>'
        + '<span>' + Math.round(m._ph.masse) + ' g</span></div></div></div>';
    }).join('');
    [].forEach.call(g.children, function (c) {
      c.onclick = function () { ouvrir(DATA.filter(function (m) { return m.s === c.dataset.s; })[0]); };
    });
  }

  function ouvrir(m) {
    courant = m;
    opts = { matiere: 'pla', pack: 'solo', multi: false, urgence: false,
             poncage: false, peinture: false, insert: false };
    fiche();
    document.getElementById('ngl-sheet').classList.add('on');
  }

  function fiche() {
    var m = courant, r = prix(m, opts), ph = r.ph;
    var h = '<div class="ngl-s-img"><img src="' + img(m) + '" alt=""></div><div class="ngl-s-b">'
      + '<h3>' + m.nom + '</h3><div class="ngl-sub">' + m.f + ' · '
      + m.b.map(function (v) { return Math.round(v * 10) / 10; }).join(' × ') + ' mm · '
      + Math.round(ph.masse) + ' g</div>'
      + '<div class="ngl-s-d">' + m.desc + '</div>'
      + '<div class="ngl-lab">Matière</div><div class="ngl-chips" id="ngl-mat">';
    Object.keys(MAT).forEach(function (k) {
      h += '<button class="ngl-chip' + (opts.matiere === k ? ' on' : '') + '" data-v="' + k + '">' + MAT[k].nom + '</button>';
    });
    h += '</div><div class="ngl-lab">Quantité</div><div class="ngl-chips" id="ngl-pack">'
      + '<button class="ngl-chip' + (opts.pack === 'solo' ? ' on' : '') + '" data-v="solo">1 exemplaire</button>'
      + '<button class="ngl-chip' + (opts.pack === 'essentiel' ? ' on' : '') + '" data-v="essentiel">Essentiel — ' + P.qte_ess + '</button>'
      + '<button class="ngl-chip' + (opts.pack === 'serenite' ? ' on' : '') + '" data-v="serenite">Sérénité — ' + P.qte_ser + '</button>'
      + '</div><div class="ngl-lab">Finitions et options</div>';
    FIN.forEach(function (f) {
      h += '<label class="ngl-chk"><input type="checkbox" data-o="' + f.id + '"' + (opts[f.id] ? ' checked' : '') + '> '
        + f.nom + ' — ' + f.prix + ' € / pièce</label>';
    });
    h += '<label class="ngl-chk"><input type="checkbox" data-o="multi"' + (opts.multi ? ' checked' : '') + '> Impression multicolore — +20 %</label>'
      + '<label class="ngl-chk"><input type="checkbox" data-o="urgence"' + (opts.urgence ? ' checked' : '') + '> Urgence sous 48 h — +20 %</label>'
      + '<div class="ngl-rec">';
    if (r.devis) {
      h += '<div class="ngl-rl"><b>Pièce hors grille — sur devis</b></div>';
    } else {
      r.lignes.forEach(function (x) { h += '<div class="ngl-rl"><span>' + x[0] + '</span><b>' + eur(x[1]) + '</b></div>'; });
      h += '<div class="ngl-tot"><span>Total TTC</span><span>' + eur(r.total) + '</span></div>';
    }
    h += '</div><button class="ngl-cta" id="ngl-cmd">Commander cette pièce imprimée</button>'
      + '<a class="ngl-cta gh" target="_blank" rel="noopener" href="https://cults3d.com/fr/mod%C3%A8le-3d/'
      + m.c + '/' + m.s + '">Télécharger le fichier 3D — ' + eur(m.p) + '</a>'
      + '<div class="ngl-note">TTC — TVA non applicable, art. 293 B du CGI · Devis valable 30 jours<br>'
      + 'Pièce conçue et imprimée par Novogarden.</div></div>';

    var s = document.getElementById('ngl-s');
    s.innerHTML = h;
    s.scrollTop = 0;
    [].forEach.call(document.getElementById('ngl-mat').children, function (b) {
      b.onclick = function () { opts.matiere = b.dataset.v; fiche(); };
    });
    [].forEach.call(document.getElementById('ngl-pack').children, function (b) {
      b.onclick = function () { opts.pack = b.dataset.v; fiche(); };
    });
    [].forEach.call(s.querySelectorAll('[data-o]'), function (c) {
      c.onchange = function () { opts[c.dataset.o] = c.checked; fiche(); };
    });
    document.getElementById('ngl-cmd').onclick = commander;
  }

  /* Reprend le parcours de devis existant de l'app en le pré-remplissant. */
  function commander() {
    var m = courant, r = prix(m, opts);
    var txt = 'Bibliothèque — ' + m.nom
      + ' | matière : ' + MAT[opts.matiere].nom
      + ' | quantité : ' + r.qte
      + (r.devis ? ' | sur devis' : ' | prix estimé : ' + eur(r.total))
      + ' | réf. ' + m.s;
    try { sessionStorage.setItem('ngl_piece', txt); } catch (e) {}
    fermer();
    var d = document.getElementById('ngv-devis');
    if (d) {
      d.click();
      setTimeout(function () {
        var n = document.getElementById('bk-note');
        if (n) { n.value = txt; n.dispatchEvent(new Event('input', { bubbles: true })); }
      }, 500);
    } else {
      alert('Pièce retenue :\n\n' + txt + '\n\nUtilisez « Demander un devis » pour finaliser.');
    }
  }

  function fermer() {
    document.getElementById('ngl-ov').classList.remove('on');
    document.getElementById('ngl-sheet').classList.remove('on');
  }

  /* ---------------------------------------------------------- ouverture */
  var chargement = null;
  function ouvrirBiblio() {
    document.getElementById('ngl-ov').classList.add('on');
    if (DATA) return;
    document.getElementById('ngl-grid').innerHTML = '<div class="ngl-empty">Chargement de la bibliothèque…</div>';
    if (!chargement) {
      chargement = fetch('data/catalogue.json')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          DATA = (j.modeles || j).map(function (m) {
            m.nom = nomFr(m.r);
            m.desc = designation(m.r, m.f);
            return m;
          });
          categories(); grille();
        })
        .catch(function () {
          document.getElementById('ngl-grid').innerHTML =
            '<div class="ngl-empty">Bibliothèque momentanément indisponible.</div>';
        });
    }
  }

  /* ------------ injection du bouton dans la fiche Impression prototype */
  function injecter() {
    var grille = document.querySelector('[data-ngb-grille]');
    if (!grille) return;
    if (document.getElementById('ngl-entree')) return;
    var titre = document.querySelector('.ngv-head');
    if (titre && !/impression/i.test(titre.textContent)) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'ngl-entree';
    b.className = grille.className;
    b.textContent = 'Bibliothèque pièces';
    b.style.cssText = 'display:block;width:100%;margin:6px 0 2px;font-weight:700';
    b.onclick = ouvrirBiblio;
    grille.parentNode.insertBefore(b, grille);
  }

  function init() {
    construire();
    new MutationObserver(injecter).observe(document.body, { childList: true, subtree: true });
    injecter();
    window.NovogardenBibliotheque = { ouvrir: ouvrirBiblio };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
