/* =====================================================================
   Novogarden — noyau des espaces partenaires
   ---------------------------------------------------------------------
   Client Supabase, session, profil, navigation dynamique et petits
   utilitaires partages par les onglets apporteur / prestataire / admin.

   Regle de non-regression : si la configuration Supabase est vide,
   estConfigure() renvoie false et l'application reste strictement
   identique a ce qu'elle etait (critere d'acceptation 8).

   API : window.NGP
   ===================================================================== */
(function (global) {
  'use strict';

  var CFG = global.NG_CONFIG || {};
  var NGP = {
    sb: null,          /* client Supabase */
    session: null,     /* session auth courante */
    profil: null,      /* ligne profiles de l'utilisateur */
    pret: false,
    ecouteurs: []
  };

  /* ---------- configuration ---------- */

  function estConfigure() {
    return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  }

  function client() {
    if (NGP.sb) return NGP.sb;
    if (!estConfigure() || !global.supabase) return null;
    NGP.sb = global.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return NGP.sb;
  }

  /* ---------- utilitaires ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function eur(n) {
    if (n == null || isNaN(n)) return '—';
    var s = Number(n).toFixed(2).replace('.', ',');
    if (s.slice(-3) === ',00') s = s.slice(0, -3);
    return s + ' €';
  }

  function dateFr(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function toast(m) {
    if (typeof global.showToast === 'function') global.showToast(m); else alert(m);
  }

  /* Cree un ecran plein format, comme le font les autres modules. */
  function ecran(id) {
    var ex = document.getElementById(id);
    if (ex) return ex;
    var ref = document.getElementById('home');
    if (!ref || !ref.parentNode) return null;
    var d = document.createElement('div');
    d.id = id; d.className = 'screen';
    ref.parentNode.insertBefore(d, ref);
    return d;
  }

  function aller(id) {
    if (typeof global.navTo === 'function') global.navTo(id);
    var c = document.querySelector('#' + id + ' .ngp-wrap');
    if (c) c.scrollTop = 0;
  }

  /* ---------- session et profil ---------- */

  function chargerProfil() {
    var sb = client();
    if (!sb || !NGP.session) { NGP.profil = null; return Promise.resolve(null); }
    return sb.from('profiles').select('*').eq('id', NGP.session.user.id).single()
      .then(function (r) { NGP.profil = r.data || null; return NGP.profil; })
      .catch(function () { NGP.profil = null; return null; });
  }

  function rafraichir() {
    var sb = client();
    if (!sb) return Promise.resolve(null);
    return sb.auth.getSession().then(function (r) {
      NGP.session = (r.data && r.data.session) || null;
      return chargerProfil();
    }).then(function () {
      majInterface();
      return NGP.profil;
    });
  }

  function connecte() { return !!NGP.session; }
  function role(r) { return !!(NGP.profil && NGP.profil[r]); }

  /* ---------- navigation : onglets selon les roles ---------- */

  /* Les onglets partenaires n'apparaissent que si le role est actif
     (spec 1). La barre passe alors a 6 ou 7 entrees : la classe
     ngp-nav-dense reduit la typo pour que tout tienne a 380 px. */
  function majNav() {
    var nav = document.querySelector('.bottom-nav');
    if (!nav) return;

    definirItem(nav, 'nav-apporteur', 'apporteur', 'Parrainage',
      '<path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
      role('is_apporteur'));

    definirItem(nav, 'nav-prestataire', 'prestataire', 'Missions',
      '<path d="M22 7h-7V2H9v5H2v15h20V7zm-9-3h-2v3h2V4zM4 9h16v11H4V9zm5 2v7l6-3.5L9 11z"/>',
      role('is_prestataire'));

    definirItem(nav, 'nav-partadmin', 'partadmin', 'Admin',
      '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>',
      role('is_admin'));

    var n = nav.querySelectorAll('.nav-item').length;
    nav.classList.toggle('ngp-nav-dense', n > 5);
  }

  function definirItem(nav, id, cible, libelle, chemin, visible) {
    var el = document.getElementById(id);
    if (!visible) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.className = 'nav-item';
    el.id = id;
    el.innerHTML = '<svg viewBox="0 0 24 24">' + chemin + '</svg>'
      + '<span class="nav-label">' + esc(libelle) + '</span>';
    el.addEventListener('click', function () {
      if (global.NGP.onglets && global.NGP.onglets[cible]) global.NGP.onglets[cible]();
    });
    nav.appendChild(el);
  }

  /* Rend visibles ou non les blocs reserves aux connectes. */
  function majInterface() {
    majNav();
    document.querySelectorAll('[data-ngp-si]').forEach(function (el) {
      var attendu = el.getAttribute('data-ngp-si');
      var ok = attendu === 'connecte' ? connecte()
             : attendu === 'deconnecte' ? !connecte()
             : role(attendu);
      el.style.display = ok ? '' : 'none';
    });
    NGP.ecouteurs.forEach(function (f) { try { f(); } catch (e) {} });
  }

  /* ---------- demarrage ---------- */

  function demarrer() {
    if (!estConfigure()) {
      /* Aucune configuration : on ne touche a rien. */
      NGP.pret = true;
      return;
    }
    var sb = client();
    if (!sb) { console.warn('[NGP] supabase-js non charge'); return; }

    sb.auth.onAuthStateChange(function (_evt, session) {
      NGP.session = session || null;
      chargerProfil().then(majInterface);
    });

    rafraichir().then(function () { NGP.pret = true; });
  }

  /* ---------- export ---------- */

  global.NGP = Object.assign(NGP, {
    CFG: CFG,
    estConfigure: estConfigure,
    client: client,
    esc: esc, eur: eur, dateFr: dateFr, toast: toast,
    ecran: ecran, aller: aller,
    connecte: connecte, role: role,
    rafraichir: rafraichir, chargerProfil: chargerProfil,
    majInterface: majInterface, majNav: majNav,
    surChangement: function (f) { NGP.ecouteurs.push(f); },
    onglets: {}
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(window);
