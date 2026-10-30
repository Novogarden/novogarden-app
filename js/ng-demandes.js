/* =====================================================================
   Novogarden — filet de securite pour les signalements et les devis
   ---------------------------------------------------------------------
   Les formulaires partent par mail via FormSubmit. Quand ce service est
   en panne (cela arrive : erreur 521 le 30/10/2026), la demande etait
   perdue et le client voyait « Erreur d'envoi ».

   Desormais chaque demande est AUSSI enregistree dans la table Supabase
   « demandes » (photo ou piece jointe dans l'espace « demandes »).
   La demande est consideree comme recue des que l'un des deux canaux
   a fonctionne. Les nouvelles lignes se consultent dans Supabase :
   Table Editor > demandes (colonne traite = false).
   ===================================================================== */
(function (global) {
  'use strict';

  function client() {
    var P = global.NGP;
    if (!P || typeof P.estConfigure !== 'function' || !P.estConfigure()) return null;
    try { return P.client(); } catch (e) { return null; }
  }

  function nomPropre(n) {
    return String(n || 'fichier').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  }

  /* Enregistre la demande. Resout toujours (jamais d'exception) :
     true si la ligne est bien en base, false sinon. */
  function sauver(type, sujet, donnees, fichier, mailEnvoye) {
    var sb = client();
    if (!sb) return Promise.resolve(false);
    var chemin = null;
    var depot = Promise.resolve();
    if (fichier) {
      var jour = new Date().toISOString().slice(0, 10);
      chemin = type + '/' + jour + '-' + Math.random().toString(36).slice(2, 8) + '-' + nomPropre(fichier.name);
      depot = sb.storage.from('demandes').upload(chemin, fichier, { upsert: false, contentType: fichier.type || undefined })
        .then(function (r) { if (r && r.error) { chemin = 'ECHEC DEPOT : ' + (fichier.name || ''); } })
        .catch(function () { chemin = 'ECHEC DEPOT : ' + (fichier.name || ''); });
    }
    return depot.then(function () {
      return sb.from('demandes').insert({
        type: type,
        sujet: sujet || null,
        donnees: donnees || {},
        fichier: chemin,
        mail_envoye: (typeof mailEnvoye === 'boolean') ? mailEnvoye : null
      });
    }).then(function (r) { return !(r && r.error); })
      .catch(function () { return false; });
  }

  /* Envoi FormSubmit en AJAX, avec delai maximum. Resout true/false. */
  function mailAjax(champs, delaiMs) {
    var fini = false;
    return new Promise(function (ok) {
      var t = setTimeout(function () { if (!fini) { fini = true; ok(false); } }, delaiMs || 12000);
      fetch('https://formsubmit.co/ajax/contact@novogardenhub.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(champs)
      }).then(function (r) { return r.json(); })
        .then(function (d) { if (!fini) { fini = true; clearTimeout(t); ok(!!d && (d.success === true || d.success === 'true')); } })
        .catch(function () { if (!fini) { fini = true; clearTimeout(t); ok(false); } });
    });
  }

  global.NGDemandes = { sauver: sauver, mailAjax: mailAjax };
})(window);
