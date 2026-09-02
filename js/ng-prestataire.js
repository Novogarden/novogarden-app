/* =====================================================================
   Novogarden — onglet Prestataire (spec 8)
   ---------------------------------------------------------------------
   Missions disponibles, mes missions, compte-rendu photo, revenus.

   Concurrence : l'acceptation passe par la fonction accepter_mission
   cote base, qui fait un UPDATE conditionnel sur statut = 'ouverte'.
   Deux prestataires simultanes : un seul l'emporte, l'autre recoit
   « Cette mission vient d'être attribuée » (critere 5).

   Photos : compressees dans le navigateur avant televersement
   (1600 px sur le grand cote, JPEG q=0.8) puis deposees dans un bucket
   prive. Elles ne sont relues que par URL signee a duree limitee.
   ===================================================================== */
(function (global) {
  'use strict';

  var P = null;
  var TYPES = {
    tonte: 'Tonte', drone: 'Prestation drone',
    impression_3d: 'Impression 3D', modelisation: 'Modélisation 3D'
  };

  function init() { P = global.NGP; return P && P.estConfigure() && P.client(); }

  function ouvrir() {
    if (!init()) return;
    if (!P.connecte()) { global.navTo('compte'); return; }
    var w = P.ecran('prestataire');
    if (!w) return;
    w.innerHTML = '<div class="ngp-wrap"><div class="ngp-chargement">Chargement…</div></div>';
    P.aller('prestataire');

    /* Spec 11 et critere 7 : sans validation, aucune mission n'est visible. */
    if (!(P.profil && P.profil.prestataire_valide)) {
      w.innerHTML = '<div class="ngp-wrap"><div class="ngp-head">'
        + '<div class="ngp-titre">Missions</div></div>'
        + '<div class="ngp-carte"><p class="ngp-h3">Compte en attente de validation</p>'
        + '<p class="ngp-note" style="margin:0">Votre inscription comme prestataire a bien été '
        + 'enregistrée. Novogarden la valide sous 48 h ouvrées. Vous verrez les missions '
        + 'disponibles dès que ce sera fait.</p></div></div>';
      return;
    }
    charger().then(function (d) { rendre(w, d); });
  }

  function charger() {
    var sb = P.client(), moi = P.session.user.id;
    return Promise.all([
      sb.from('missions').select('*').eq('statut', 'ouverte')
        .is('prestataire_id', null).order('date_souhaitee', { ascending: true }),
      sb.from('missions').select('*').eq('prestataire_id', moi)
        .order('date_souhaitee', { ascending: true })
    ]).then(function (r) {
      return { ouvertes: (r[0] && r[0].data) || [], miennes: (r[1] && r[1].data) || [] };
    });
  }

  function rendre(w, d) {
    var h = '<div class="ngp-wrap"><div class="ngp-head"><div class="ngp-titre">Missions</div></div>';

    /* ---- 8.1 Missions disponibles ---- */
    h += '<p class="sect">Missions disponibles</p>';
    if (!d.ouvertes.length) {
      h += '<div class="ngp-carte"><p class="ngp-note" style="margin:0">'
        + 'Aucune mission ouverte pour le moment. Vous serez notifié dès qu’une mission '
        + 'correspond à votre secteur.</p></div>';
    } else {
      d.ouvertes.forEach(function (m) { h += carteMission(m, true); });
    }

    /* ---- 8.2 Mes missions ---- */
    var aVenir = d.miennes.filter(function (m) { return m.statut === 'acceptee'; });
    var enCours = d.miennes.filter(function (m) { return m.statut === 'en_cours'; });
    var finies = d.miennes.filter(function (m) { return m.statut === 'terminee'; });

    h += '<p class="sect">Mes missions</p>';
    h += section('À venir', aVenir, 'Aucune mission acceptée.');
    h += section('En cours', enCours, 'Aucune mission démarrée.');
    h += section('Terminées', finies, 'Aucune mission terminée.');

    /* ---- 8.4 Mes revenus ---- */
    var moisCourant = new Date().toISOString().slice(0, 7);
    var duMois = finies.filter(function (m) {
      return (m.date_acceptation || m.created_at || '').slice(0, 7) === moisCourant;
    });
    var total = duMois.reduce(function (a, m) { return a + (Number(m.remuneration_prestataire) || 0); }, 0);

    h += '<p class="sect">Mes revenus</p>'
      + '<div class="ngp-carte">'
      + '<div class="ngp-gain" style="margin-bottom:10px"><div class="ngp-gain-v">' + P.eur(total) + '</div>'
      + '<div class="ngp-gain-l">Mois en cours</div></div>';
    if (finies.length) {
      finies.forEach(function (m, i) {
        h += '<div class="ngp-ligne' + (i ? ' ngp-sep' : '') + '">'
          + '<span class="ngp-k">' + P.esc(m.titre || TYPES[m.type_prestation] || 'Mission')
          + ' · ' + P.esc(m.commune || '') + '</span>'
          + '<span class="ngp-v">' + P.eur(m.remuneration_prestataire) + '</span></div>';
      });
      h += '<button type="button" class="ngp-lien" id="ngp-export">Exporter le récapitulatif</button>';
    } else {
      h += '<p class="ngp-note" style="margin:0">Aucune mission terminée pour l’instant.</p>';
    }
    h += '<p class="ngp-note">Ce récapitulatif sert à établir votre facture. '
      + 'L’application ne génère aucune facture et ne gère aucun paiement.</p>';
    h += '</div></div>';

    w.innerHTML = h;
    brancher(w, d, finies);
  }

  function section(titre, liste, vide) {
    var h = '<p class="ngp-sous">' + titre + '</p>';
    if (!liste.length) {
      return h + '<div class="ngp-carte"><p class="ngp-note" style="margin:0">' + vide + '</p></div>';
    }
    liste.forEach(function (m) { h += carteMission(m, false); });
    return h;
  }

  function carteMission(m, ouverte) {
    var h = '<div class="ngp-carte ngp-mission">'
      + '<div class="ngp-mission-h">'
      + '<div><div class="ngp-mission-t">' + P.esc(TYPES[m.type_prestation] || m.type_prestation) + '</div>'
      + '<div class="ngp-note" style="margin:2px 0 0">'
      + P.esc([m.commune, m.code_postal].filter(Boolean).join(' ') || '—')
      + (m.surface_m2 ? ' · ' + m.surface_m2 + ' m²' : '')
      + ' · ' + P.dateFr(m.date_souhaitee) + '</div></div>'
      + '<div class="ngp-remu">' + P.eur(m.remuneration_prestataire) + '</div></div>';

    if (m.titre) h += '<div class="ngp-mission-s">' + P.esc(m.titre) + '</div>';
    h += '<div class="ngp-detail" id="det-' + m.id + '" style="display:none">'
      + '<p class="ngp-note">' + P.esc(m.description || 'Aucune description fournie.') + '</p></div>';
    h += '<button type="button" class="ngp-lien" data-ngp-detail="' + m.id + '">Voir le détail</button>';

    if (ouverte) {
      h += '<button class="btn-p" data-ngp-accepter="' + m.id + '">Accepter la mission</button>';
    } else if (m.statut === 'acceptee') {
      h += '<button class="btn-p" data-ngp-demarrer="' + m.id + '">Démarrer</button>';
    } else if (m.statut === 'en_cours') {
      h += '<button class="btn-p" data-ngp-cr="' + m.id + '">Déposer le compte-rendu</button>';
    } else if (m.statut === 'terminee') {
      h += '<div class="ngp-fini">Terminée · compte-rendu déposé</div>';
    }
    return h + '</div>';
  }

  function brancher(w, d, finies) {
    w.querySelectorAll('[data-ngp-detail]').forEach(function (b) {
      b.addEventListener('click', function () {
        var z = document.getElementById('det-' + this.getAttribute('data-ngp-detail'));
        if (!z) return;
        var ouvert = z.style.display !== 'none';
        z.style.display = ouvert ? 'none' : 'block';
        this.textContent = ouvert ? 'Voir le détail' : 'Masquer le détail';
      });
    });

    w.querySelectorAll('[data-ngp-accepter]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = this.getAttribute('data-ngp-accepter');
        this.disabled = true; this.textContent = 'Attribution…';
        P.client().rpc('accepter_mission', { p_mission: id }).then(function (r) {
          if (r.error) { P.toast('Erreur. Réessayez.'); ouvrir(); return; }
          if (r.data && r.data.ok) { P.toast('Mission acceptée !'); }
          else if (r.data && r.data.raison === 'non_valide') {
            P.toast('Votre compte prestataire n’est pas encore validé.');
          } else {
            P.toast('Cette mission vient d’être attribuée.');
          }
          ouvrir();   /* rafraichit la liste dans tous les cas */
        });
      });
    });

    w.querySelectorAll('[data-ngp-demarrer]').forEach(function (b) {
      b.addEventListener('click', function () {
        P.client().rpc('demarrer_mission', { p_mission: this.getAttribute('data-ngp-demarrer') })
          .then(function () { ouvrir(); });
      });
    });

    w.querySelectorAll('[data-ngp-cr]').forEach(function (b) {
      b.addEventListener('click', function () { ecranCR(this.getAttribute('data-ngp-cr')); });
    });

    var ex = w.querySelector('#ngp-export');
    if (ex) ex.addEventListener('click', function () { exporter(finies); });
  }

  /* ---------- 8.3 compte-rendu ---------- */

  function ecranCR(missionId) {
    var w = P.ecran('ngp-cr');
    if (!w) return;
    w.innerHTML = '<div class="ngp-wrap"><div class="ngp-head">'
      + '<button type="button" class="ngp-back" id="cr-back">← Retour</button>'
      + '<div class="ngp-titre">Compte-rendu</div></div>'
      + '<div class="ngp-carte">'
      + '<p class="ngp-h3">Photos avant</p>'
      + '<input type="file" id="cr-avant" accept="image/*" capture="environment" multiple class="finput">'
      + '<div class="ngp-vignettes" id="cr-av-vue"></div>'
      + '<p class="ngp-h3" style="margin-top:14px">Photos après</p>'
      + '<input type="file" id="cr-apres" accept="image/*" capture="environment" multiple class="finput">'
      + '<div class="ngp-vignettes" id="cr-ap-vue"></div>'
      + '</div>'
      + '<div class="ngp-carte">'
      + '<label class="flabel">Commentaire</label>'
      + '<textarea id="cr-com" class="finput" rows="4" style="resize:none" '
      + 'placeholder="Ce qui a été fait, points de vigilance…"></textarea>'
      + '<label class="flabel">Durée d’intervention (minutes, optionnel)</label>'
      + '<input id="cr-duree" class="finput" type="number" inputmode="numeric" min="0" placeholder="90">'
      + '</div>'
      + '<div class="err-msg" id="cr-err"></div>'
      + '<p class="ngp-note">Une fois envoyé, le compte-rendu ne peut plus être modifié '
      + 'et la mission passe en « terminée ».</p>'
      + '<button class="btn-p" id="cr-envoyer">Envoyer le compte-rendu</button></div>';

    var avant = [], apres = [];
    var maxi = P.CFG.PHOTO_MAX_PAR_TYPE || 4;

    w.querySelector('#cr-back').addEventListener('click', ouvrir);
    brancherFichiers(w.querySelector('#cr-avant'), w.querySelector('#cr-av-vue'), avant, maxi);
    brancherFichiers(w.querySelector('#cr-apres'), w.querySelector('#cr-ap-vue'), apres, maxi);

    w.querySelector('#cr-envoyer').addEventListener('click', function () {
      var err = w.querySelector('#cr-err');
      err.textContent = '';
      if (!avant.length && !apres.length) {
        err.textContent = 'Ajoutez au moins une photo.'; return;
      }
      var btn = this;
      btn.disabled = true; btn.textContent = 'Envoi…';
      envoyer(missionId, avant, apres,
        w.querySelector('#cr-com').value,
        parseInt(w.querySelector('#cr-duree').value, 10) || null)
        .then(function (r) {
          if (r && r.ok) { P.toast('Compte-rendu envoyé.'); ouvrir(); }
          else {
            err.textContent = messageCR(r);
            btn.disabled = false; btn.textContent = 'Envoyer le compte-rendu';
          }
        })
        .catch(function () {
          err.textContent = 'Envoi impossible. Vérifiez votre connexion.';
          btn.disabled = false; btn.textContent = 'Envoyer le compte-rendu';
        });
    });

    P.aller('ngp-cr');
  }

  function messageCR(r) {
    var raison = r && r.raison;
    if (raison === 'deja_depose') return 'Un compte-rendu a déjà été déposé pour cette mission.';
    if (raison === 'mission_non_autorisee') return 'Cette mission ne vous est pas attribuée.';
    return 'Envoi impossible. Réessayez.';
  }

  function brancherFichiers(input, vue, cible, maxi) {
    input.addEventListener('change', function () {
      var fichiers = [].slice.call(this.files || []);
      var reste = maxi - cible.length;
      if (reste <= 0) { P.toast(maxi + ' photos maximum.'); this.value = ''; return; }
      fichiers.slice(0, reste).reduce(function (chaine, f) {
        return chaine.then(function () {
          return compresser(f).then(function (blob) {
            cible.push(blob);
            var img = document.createElement('img');
            img.className = 'ngp-vignette';
            img.src = URL.createObjectURL(blob);
            vue.appendChild(img);
          });
        });
      }, Promise.resolve()).then(function () { input.value = ''; });
    });
  }

  /* Redimensionne et recompresse dans le navigateur : on n'envoie jamais
     une photo de 4 Mo sortie d'un telephone. */
  function compresser(fichier) {
    var cote = P.CFG.PHOTO_COTE_MAX || 1600;
    var q = P.CFG.PHOTO_QUALITE || 0.8;
    return new Promise(function (resoudre, rejeter) {
      var img = new Image();
      img.onload = function () {
        var r = Math.min(1, cote / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * r);
        c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob(function (b) { b ? resoudre(b) : rejeter(new Error('compression')); }, 'image/jpeg', q);
      };
      img.onerror = function () { rejeter(new Error('image illisible')); };
      img.src = URL.createObjectURL(fichier);
    });
  }

  function envoyer(missionId, avant, apres, commentaire, duree) {
    var sb = P.client(), moi = P.session.user.id;
    var photos = [];

    function televerser(blob, type, i) {
      var chemin = moi + '/' + missionId + '/' + type + '-' + i + '-' + Date.now() + '.jpg';
      return sb.storage.from('comptes-rendus')
        .upload(chemin, blob, { contentType: 'image/jpeg', upsert: false })
        .then(function (r) {
          if (r.error) throw new Error(r.error.message);
          photos.push({ chemin: chemin, type: type });
        });
    }

    var chaine = Promise.resolve();
    avant.forEach(function (b, i) { chaine = chaine.then(function () { return televerser(b, 'avant', i); }); });
    apres.forEach(function (b, i) { chaine = chaine.then(function () { return televerser(b, 'apres', i); }); });

    return chaine.then(function () {
      return sb.rpc('deposer_compte_rendu', {
        p_mission: missionId,
        p_commentaire: commentaire || null,
        p_duree: duree,
        p_photos: photos
      });
    }).then(function (r) {
      if (r.error) return { ok: false };
      return r.data;
    });
  }

  /* ---------- export du recapitulatif ---------- */

  function exporter(missions) {
    var lignes = ['Date;Prestation;Commune;Montant TTC'];
    missions.forEach(function (m) {
      lignes.push([
        (m.date_souhaitee || '').slice(0, 10),
        (TYPES[m.type_prestation] || m.type_prestation),
        (m.commune || ''),
        String(m.remuneration_prestataire).replace('.', ',')
      ].join(';'));
    });
    var total = missions.reduce(function (a, m) { return a + (Number(m.remuneration_prestataire) || 0); }, 0);
    lignes.push(';;Total;' + String(total.toFixed(2)).replace('.', ','));

    var csv = '﻿' + lignes.join('\r\n');   /* BOM : Excel lit l'UTF-8 */
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'novogarden-recapitulatif-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function installer() {
    P = global.NGP;
    if (!P) return;
    P.onglets.prestataire = ouvrir;
  }

  global.NGP_PRESTATAIRE = { ouvrir: ouvrir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installer);
  else installer();
})(window);
