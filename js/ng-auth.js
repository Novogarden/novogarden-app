/* =====================================================================
   Novogarden — authentification reelle (Supabase)
   ---------------------------------------------------------------------
   Remplace le faux login qui stockait les mots de passe en clair dans
   localStorage et acceptait n'importe quelle adresse. Les fonctions
   globales doLogin / doRegister / doLogout sont reecrites ici afin de
   ne pas toucher au balisage existant de l'ecran Compte.

   Parcours d'inscription (spec 11) :
     1. prenom, nom, email, telephone, mot de passe, acceptation RGPD
     2. choix des roles : recommander et/ou realiser des prestations
   Le role apporteur est actif tout de suite, le role prestataire
   attend la validation de l'admin.
   ===================================================================== */
(function (global) {
  'use strict';

  var P = null;                       /* raccourci vers NGP */
  function $(id) { return document.getElementById(id); }

  function pret() {
    P = global.NGP;
    return P && P.estConfigure() && P.client();
  }

  /* ---------- connexion ---------- */

  function connexion() {
    if (!pret()) return alerteConfig('login-err');
    var email = ($('login-email') || {}).value || '';
    var mdp = ($('login-pwd') || {}).value || '';
    var err = $('login-err');
    cacher(err);
    if (!email.trim() || !mdp) return afficher(err, 'Veuillez remplir tous les champs.');

    P.client().auth.signInWithPassword({ email: email.trim(), password: mdp })
      .then(function (r) {
        if (r.error) return afficher(err, traduire(r.error.message));
        return P.rafraichir().then(function () {
          P.toast('Bienvenue ' + ((P.profil && P.profil.prenom) || '') + ' !');
          if (typeof global.navTo === 'function') global.navTo('compte');
        });
      })
      .catch(function () { afficher(err, 'Connexion impossible. Réessayez.'); });
  }

  /* ---------- inscription ---------- */

  function inscription() {
    if (!pret()) return alerteConfig('reg-err');
    var prenom = val('reg-prenom'), nom = val('reg-nom');
    var email = val('reg-email'), mdp = ($('reg-pwd') || {}).value || '';
    var tel = val('reg-tel');
    var rgpd = $('reg-rgpd');
    var apporteur = $('reg-role-apporteur');
    var prestataire = $('reg-role-prestataire');
    var err = $('reg-err');
    cacher(err);

    if (!prenom || !nom || !email) return afficher(err, 'Prénom, nom et email sont requis.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return afficher(err, 'Adresse email invalide.');
    if (mdp.length < 8) return afficher(err, 'Mot de passe : 8 caractères minimum.');
    if (rgpd && !rgpd.checked) return afficher(err, 'Merci d’accepter la politique de données personnelles.');
    if (apporteur && prestataire && !apporteur.checked && !prestataire.checked) {
      return afficher(err, 'Choisissez au moins un rôle.');
    }

    P.client().auth.signUp({
      email: email, password: mdp,
      options: { data: { prenom: prenom, nom: nom, telephone: tel } }
    }).then(function (r) {
      if (r.error) return afficher(err, traduire(r.error.message));
      /* Si la confirmation par email est active, il n'y a pas encore de
         session : on le dit clairement plutot que de laisser l'ecran muet. */
      if (!r.data.session) {
        afficher(err, 'Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.');
        return;
      }
      return P.rafraichir()
        .then(function () { return enregistrerRoles(apporteur && apporteur.checked, prestataire && prestataire.checked); })
        .then(function () { return P.rafraichir(); })
        .then(function () {
          P.toast('Bienvenue ' + prenom + ' !');
          if (typeof global.navTo === 'function') global.navTo('compte');
        });
    }).catch(function () { afficher(err, 'Inscription impossible. Réessayez.'); });
  }

  /* Le profil est cree par un trigger cote base ; on n'ecrit ici que
     les deux booleens de role, que l'utilisateur a le droit de poser.
     prestataire_valide reste a false : c'est l'admin qui l'ouvre. */
  function enregistrerRoles(apporteur, prestataire) {
    if (!P.session) return Promise.resolve();
    return P.client().from('profiles').update({
      is_apporteur: !!apporteur,
      is_prestataire: !!prestataire,
      rgpd_accepte_le: new Date().toISOString()
    }).eq('id', P.session.user.id);
  }

  /* ---------- deconnexion ---------- */

  function deconnexion() {
    if (!pret()) { majAffichage(); return; }
    P.client().auth.signOut().then(function () {
      return P.rafraichir();
    }).then(function () {
      P.toast('Déconnecté.');
      if (typeof global.navTo === 'function') global.navTo('home');
    });
  }

  /* ---------- profil : bloc roles + RGPD ---------- */

  function blocProfil() {
    if (!P || !P.connecte() || !P.profil) return '';
    var p = P.profil, h = '';

    h += '<div class="ngp-carte"><p class="ngp-h3">Mes rôles</p>';
    h += ligneRole('Apporteur d’affaires', p.is_apporteur,
      p.is_apporteur && p.code_apporteur ? 'Code : ' + P.esc(p.code_apporteur) : 'Actif immédiatement');
    h += ligneRole('Prestataire', p.is_prestataire,
      !p.is_prestataire ? '' :
      (p.prestataire_valide ? 'Validé — accès aux missions ouvert'
                            : 'En attente de validation par Novogarden'));
    h += '<button type="button" class="ngp-lien" id="ngp-maj-roles">Modifier mes rôles</button>';
    h += '</div>';

    h += '<div class="ngp-carte"><p class="ngp-h3">Données personnelles</p>'
      + '<p class="ngp-note">Responsable de traitement : Novogarden — Romain Marlier, '
      + 'Le Châtellier. Vos données servent uniquement à gérer votre compte partenaire, '
      + 'vos filleuls et vos missions. Elles sont conservées le temps de la relation '
      + 'commerciale, puis 3 ans. Vous disposez d’un droit d’accès, de rectification, '
      + 'de portabilité et d’effacement à contact@novogardenhub.com.</p>'
      + '<button type="button" class="ngp-lien ngp-danger" id="ngp-suppr">Supprimer mon compte</button>'
      + '</div>';
    return h;
  }

  function ligneRole(nom, actif, mention) {
    return '<div class="ngp-ligne"><span class="ngp-k">' + P.esc(nom) + '</span>'
      + '<span class="ngp-v">' + (actif ? 'Activé' : 'Non') + '</span></div>'
      + (mention ? '<p class="ngp-note" style="margin:2px 0 10px">' + P.esc(mention) + '</p>' : '');
  }

  function brancherProfil(racine) {
    var b = racine.querySelector('#ngp-maj-roles');
    if (b) b.addEventListener('click', ecranRoles);
    var s = racine.querySelector('#ngp-suppr');
    if (s) s.addEventListener('click', supprimerCompte);
  }

  function ecranRoles() {
    var p = P.profil || {};
    var w = P.ecran('ngp-roles');
    if (!w) return;
    w.innerHTML = '<div class="ngp-wrap"><div class="ngp-head">'
      + '<button type="button" class="ngp-back" id="ngp-r-back">← Retour</button>'
      + '<div class="ngp-titre">Que souhaitez-vous faire ?</div></div>'
      + '<div class="ngp-carte">'
      + '<label class="ngp-check"><input type="checkbox" id="ngp-r-app"'
      + (p.is_apporteur ? ' checked' : '') + '> <span><strong>Recommander Novogarden</strong><br>'
      + '<span class="ngp-note">Vous partagez votre code et touchez une commission sur les clients que vous apportez.</span></span></label>'
      + '<label class="ngp-check"><input type="checkbox" id="ngp-r-pre"'
      + (p.is_prestataire ? ' checked' : '') + '> <span><strong>Réaliser des prestations</strong><br>'
      + '<span class="ngp-note">Vous acceptez des missions et les réalisez. Ce rôle est soumis à validation.</span></span></label>'
      + '</div>'
      + '<div class="err-msg" id="ngp-r-err"></div>'
      + '<button class="btn-p" id="ngp-r-ok">Enregistrer</button></div>';

    w.querySelector('#ngp-r-back').addEventListener('click', function () { global.navTo('compte'); });
    w.querySelector('#ngp-r-ok').addEventListener('click', function () {
      var a = w.querySelector('#ngp-r-app').checked;
      var pr = w.querySelector('#ngp-r-pre').checked;
      var e = w.querySelector('#ngp-r-err');
      if (!a && !pr) { e.textContent = 'Choisissez au moins un rôle.'; return; }
      e.textContent = '';
      enregistrerRoles(a, pr).then(function () { return P.rafraichir(); }).then(function () {
        P.toast('Rôles mis à jour.');
        global.navTo('compte');
      });
    });
    P.aller('ngp-roles');
  }

  function supprimerCompte() {
    if (!confirm('Supprimer votre compte ? Vos données personnelles seront effacées. '
      + 'L’historique des missions et commissions est conservé de façon anonyme. '
      + 'Cette action est irréversible.')) return;
    P.client().rpc('supprimer_mon_compte').then(function (r) {
      if (r.error || !(r.data && r.data.ok)) { P.toast('Suppression impossible. Contactez-nous.'); return; }
      return P.client().auth.signOut().then(function () { return P.rafraichir(); })
        .then(function () {
          P.toast('Compte supprimé.');
          global.navTo('home');
        });
    });
  }

  /* ---------- helpers ---------- */

  function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
  function cacher(e) { if (e) { e.textContent = ''; e.style.display = 'none'; } }
  function afficher(e, m) { if (e) { e.textContent = m; e.style.display = 'block'; } }
  function alerteConfig(id) {
    afficher($(id), 'Les comptes ne sont pas encore activés sur cette application.');
  }
  function traduire(m) {
    m = String(m || '');
    if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
    if (/already registered|User already/i.test(m)) return 'Un compte existe déjà avec cet email.';
    if (/Email not confirmed/i.test(m)) return 'Confirmez d’abord votre adresse email.';
    if (/Password should be/i.test(m)) return 'Mot de passe trop court (8 caractères minimum).';
    if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Réessayez dans quelques minutes.';
    return 'Erreur : ' + m;
  }

  /* Reecrit l'entete de l'ecran Compte selon l'etat de connexion. */
  function majAffichage() {
    if (!P) P = global.NGP;
    var zone = document.getElementById('ngp-profil');
    if (!zone) return;
    zone.innerHTML = blocProfil();
    brancherProfil(zone);
  }

  /* ---------- branchement sur l'existant ---------- */

  function installer() {
    P = global.NGP;
    if (!P) return;

    /* Tant que Supabase n'est pas configure, on ne touche a RIEN :
       l'application reste strictement identique (critere 8). La bascule
       se fait toute seule le jour ou js/ng-config.js est rempli. */
    if (!P.estConfigure()) return;

    /* On ecrase les trois fonctions du faux systeme de compte. */
    global.doLogin = connexion;
    global.doRegister = inscription;
    global.doLogout = deconnexion;

    /* Le faux systeme conservait mots de passe et sessions en clair
       dans le navigateur. On efface ces traces des l'activation. */
    try {
      localStorage.removeItem('ng_users');
      localStorage.removeItem('ng_user');
    } catch (e) {}

    P.surChangement(majAffichage);
    majAffichage();
  }

  global.NGP_AUTH = { installer: installer, majAffichage: majAffichage, ecranRoles: ecranRoles };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installer);
  else installer();
})(window);
