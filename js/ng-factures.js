/* =====================================================================
   Novogarden — commandes, factures et modalités de paiement
   ---------------------------------------------------------------------
   1. Le mail de devis contient un lien « Valider la commande »
      (…/?valider=NGV-…). Ouvert par l'admin, il affiche le devis et le
      bouton « OK pour commande » : la facture est créée (F2026-0001…).
   2. L'admin envoie ensuite au client, par mail (et dans l'appli si le
      client a un compte), la facture et les modalités de paiement :
      carte (lien Stripe), virement (RIB) ou espèces à la commande.
   3. …/?facture=<id> affiche la facture (imprimable / PDF) avec les
      moyens de paiement. Lisible sans compte grâce au lien.
   ===================================================================== */
(function (global) {
  'use strict';

  var FN = 'https://svbzwhdenlbhtacbqbdz.supabase.co/functions/v1/';
  var APP = 'https://novogarden.github.io/novogarden-app/';
  var VENDEUR = {
    nom: 'Novogarden — Romain Marlier (EI)',
    adresse: '2 Grande Ganterie, 61450 Le Châtellier',
    siren: '995 315 793',
    tel: '06 35 58 47 00',
    mail: 'contact@novogardenhub.com',
    site: 'novogardenhub.com'
  };

  var P = null;
  function pret() { P = global.NGP; return !!(P && P.estConfigure && P.estConfigure() && P.client()); }
  function sb() { return P.client(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (P && P.toast) P.toast(m); else alert(m); }
  function euros(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }
  function dateFr(d) { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); }
  function estAdmin() { return !!(P && P.role && P.role('is_admin')); }
  function lienPayer(id) { return FN + 'payer?id=' + id; }
  function lienFacture(id) { return APP + '?facture=' + id; }
  function centsDe(txt) {
    var m = String(txt || '').replace(/\s/g, '').match(/(\d+(?:[.,]\d{1,2})?)/);
    return m ? Math.round(parseFloat(m[1].replace(',', '.')) * 100) : 0;
  }
  /* Lignes « Tonte n : date » du devis, pour la facture et le mail. */
  function calendrier(details) {
    return String(details || '').split('\n').filter(function (l) { return /^\s*(Tonte \d+ :|Date souhaitée|Espacement|Créneau|Surface)/.test(l); })
      .map(function (l) { return l.trim(); });
  }

  /* ---------- fenêtre plein écran ---------- */
  function fenetre(html) {
    var o = document.getElementById('ngf-ov');
    if (!o) { o = document.createElement('div'); o.id = 'ngf-ov'; document.body.appendChild(o); }
    o.innerHTML = '<div class="ngf-box"><button type="button" class="ngf-x" aria-label="Fermer">✕</button>' + html + '</div>';
    o.style.display = 'block';
    o.querySelector('.ngf-x').onclick = fermer;
    return o;
  }
  function fermer() { var o = document.getElementById('ngf-ov'); if (o) o.style.display = 'none'; }

  /* ================== 1. Valider la commande (admin) ================== */
  var aValider = null;

  function ouvrirValidation(ref) {
    if (!pret() || !P.session) {
      fenetre('<h2>Valider la commande</h2><p>Connectez-vous avec le compte administrateur, la commande <strong>' + esc(ref) + '</strong> s’ouvrira ensuite.</p>');
      return;
    }
    if (!estAdmin()) { fenetre('<h2>Accès réservé</h2><p>Seul l’administrateur Novogarden peut valider une commande.</p>'); return; }
    aValider = null;
    fenetre('<h2>Commande ' + esc(ref) + '</h2><p>Chargement…</p>');
    sb().from('demandes').select('*').eq('type', 'devis').eq('donnees->>reference', ref).limit(1).then(function (r) {
      var d = r.data && r.data[0];
      if (!d) { fenetre('<h2>Commande introuvable</h2><p>Le devis ' + esc(ref) + ' n’est pas dans la base. ' + esc(r.error ? r.error.message : '') + '</p>'); return; }
      var x = d.donnees || {};
      return sb().from('paiements').select('*').eq('devis_ref', ref).limit(1).then(function (q) {
        var deja = q.data && q.data[0];
        if (deja) { apresValidation(deja); return; }
        var cal = calendrier(x.message);
        fenetre('<h2>Commande ' + esc(ref) + '</h2>'
          + '<div class="ngf-bloc"><strong>' + esc(x.nom) + '</strong><br>' + esc(x.email) + ' · ' + esc(x.telephone) + '<br>' + esc(x.adresse) + '</div>'
          + '<div class="ngf-bloc"><strong>' + esc(x.formule) + '</strong><br>' + cal.map(esc).join('<br>') + '</div>'
          + '<label class="ngf-lab">Montant TTC (€)</label>'
          + '<input id="ngf-mt" class="ngc-in" inputmode="decimal" value="' + (centsDe(x.tarif) ? (centsDe(x.tarif) / 100).toFixed(2).replace('.', ',') : '') + '">'
          + '<p class="ngf-note">TVA non applicable, art. 293 B du CGI. Tarif du devis : ' + esc(x.tarif) + '</p>'
          + '<button type="button" class="ngc-btn ngf-ok" id="ngf-go">✅ OK pour commande</button>'
          + '<p class="ngf-note">La facture est créée et le mail de confirmation, avec le bouton de paiement, part aussitôt au client.</p>');
        document.getElementById('ngf-go').onclick = function () {
          var cents = centsDe(document.getElementById('ngf-mt').value);
          if (cents < 50) { toast('Montant invalide.'); return; }
          this.disabled = true; this.textContent = 'Création de la facture…';
          sb().rpc('valider_commande', { p_demande: d.id, p_montant_cents: cents }).then(function (v) {
            if (v.error) { toast('Erreur : ' + v.error.message); ouvrirValidation(ref); return; }
            return sb().from('paiements').select('*').eq('id', v.data).single().then(function (f) {
              if (f.data && f.data.client_id) {
                sb().from('client_messages').insert({
                  client_id: f.data.client_id, de_admin: true, titre: 'Commande confirmée — facture ' + f.data.facture_num,
                  corps: f.data.libelle + ' : ' + euros(f.data.montant_cents) + '. Votre facture et les moyens de paiement sont dans l’onglet Solde.'
                });
              }
              apresValidation(f.data, true);
              if (global.NGC && NGC.rechargerAdmin) NGC.rechargerAdmin();
            });
          });
        };
      });
    });
  }

  function apresValidation(f, auto) {
    fenetre('<h2>✅ Commande confirmée</h2>'
      + '<div class="ngf-bloc">Facture <strong>' + esc(f.facture_num) + '</strong> · ' + euros(f.montant_cents) + '<br>' + esc(f.client_nom) + ' — ' + esc(f.client_email)
      + (f.client_id ? '<br><small>Le client a un compte : la facture est aussi dans son appli.</small>' : '<br><small>Pas de compte client : envoyez le mail ci-dessous.</small>') + '</div>'
      + '<button type="button" class="ngc-btn ngf-ok" id="ngf-mail">📧 Envoyer facture et lien de paiement au client</button>'
      + '<button type="button" class="ngc-btn ngc-sec ngf-ok" id="ngf-voir">🧾 Voir la facture</button>');
    var bm = document.getElementById('ngf-mail');
    bm.onclick = function () { envoyerMail(f, bm); };
    if (auto && f.statut === 'a_payer') envoyerMail(f, bm);
    document.getElementById('ngf-voir').onclick = function () { afficherFacture(f.id); };
  }

  /* Mail au client, envoyé par l'appli depuis contact@novogardenhub.com
     (bouton « Payer ma facture »). Si l'envoi automatique n'est pas encore
     configuré, on retombe sur la messagerie du téléphone. */
  function envoyerMail(f, bouton) {
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Envoi en cours…'; }
    return sb().functions.invoke('envoyer-facture', { body: { paiement_id: f.id } }).then(function (r) {
      var ok = r && r.data && r.data.ok;
      if (bouton) { bouton.disabled = false; bouton.textContent = ok ? '✅ Mail envoyé — renvoyer' : '📧 Envoyer facture et lien de paiement au client'; }
      if (ok) { toast('📧 Mail envoyé à ' + f.client_email); return true; }
      var err = (r && r.data && r.data.error) || (r && r.error && r.error.message) || '';
      if (confirm('Envoi automatique impossible (' + err + ').\nOuvrir votre messagerie avec le mail pré-rempli ?')) envoyerMailManuel(f);
      return false;
    });
  }

  /* Secours : ouvre la messagerie du téléphone, déjà remplie. */
  function envoyerMailManuel(f) {
    lireRib().then(function (rib) {
      var corps = 'Bonjour ' + (f.client_nom || '') + ',\n\n'
        + 'Merci pour votre commande, elle est confirmée.\n\n'
        + 'Prestation : ' + f.libelle + '\n'
        + calendrier(f.details).map(function (l) { return '  ' + l; }).join('\n') + '\n\n'
        + 'Montant : ' + euros(f.montant_cents) + ' TTC (TVA non applicable, art. 293 B du CGI)\n'
        + 'Facture ' + f.facture_num + ' : ' + lienFacture(f.id) + '\n\n'
        + 'RÈGLEMENT À LA COMMANDE, au choix :\n'
        + '  • Carte bancaire (paiement sécurisé) : ' + lienPayer(f.id) + '\n'
        + (rib.iban ? '  • Virement : IBAN ' + rib.iban + (rib.bic ? ' — BIC ' + rib.bic : '') + (rib.titulaire ? ' — ' + rib.titulaire : '') + '\n    Référence à indiquer : ' + f.facture_num + '\n'
                    : '  • Virement : coordonnées bancaires sur la facture\n')
        + '  • Espèces : à remettre à la commande\n\n'
        + 'Le calendrier de passage démarre à réception du règlement.\n\n'
        + 'Cordialement,\nRomain Marlier — Novogarden\n' + VENDEUR.tel + ' · ' + VENDEUR.site;
      var url = 'mailto:' + encodeURIComponent(f.client_email || '') + '?subject='
        + encodeURIComponent('Votre commande Novogarden — facture ' + f.facture_num) + '&body=' + encodeURIComponent(corps);
      location.href = url;
    });
  }

  function lireRib() {
    if (!pret() || !estAdmin()) return Promise.resolve({});
    return sb().from('parametres').select('*').then(function (r) {
      var o = {}; (r.data || []).forEach(function (x) { o[x.cle] = x.valeur; }); return o;
    }, function () { return {}; });
  }

  /* ================== 2. Facture (tout le monde, par lien) ================== */
  function afficherFacture(id) {
    if (!pret()) { setTimeout(function () { afficherFacture(id); }, 500); return; }
    fenetre('<p>Chargement de la facture…</p>');
    sb().rpc('facture_publique', { p_id: id }).then(function (r) {
      var d = r.data, f = d && d.f;
      if (!f) { fenetre('<h2>Facture introuvable</h2>'); return; }
      var paye = f.statut === 'paye', annule = f.statut === 'annule';
      var cal = calendrier(f.details);
      var MODE = { carte: 'carte bancaire', virement: 'virement', especes: 'espèces' };
      var h = '<div id="ngf-facture">'
        + '<div class="ngf-entete"><div><div class="ngf-marque">Novogarden</div>'
        + '<div class="ngf-petit">' + esc(VENDEUR.nom) + '<br>' + esc(VENDEUR.adresse) + '<br>SIREN ' + esc(VENDEUR.siren) + '<br>'
        + esc(VENDEUR.tel) + ' · ' + esc(VENDEUR.mail) + '</div></div>'
        + '<div class="ngf-droite"><div class="ngf-titre">FACTURE</div><div>N° <strong>' + esc(f.facture_num) + '</strong></div>'
        + '<div>Date : ' + dateFr(f.created_at) + '</div>' + (f.devis_ref ? '<div class="ngf-petit">Devis ' + esc(f.devis_ref) + '</div>' : '') + '</div></div>'
        + '<div class="ngf-client"><div class="ngf-petit">Facturé à</div><strong>' + esc(f.client_nom) + '</strong><br>'
        + esc(f.client_adresse) + '<br>' + esc(f.client_email) + '</div>'
        + '<table class="ngf-t"><tr><th>Désignation</th><th>Qté</th><th>Total</th></tr>'
        + '<tr><td><strong>' + esc(f.libelle) + '</strong>' + (cal.length ? '<div class="ngf-petit">' + cal.map(esc).join('<br>') + '</div>' : '') + '</td>'
        + '<td>1</td><td>' + euros(f.montant_cents) + '</td></tr>'
        + '<tr class="ngf-tot"><td colspan="2">Total TTC</td><td>' + euros(f.montant_cents) + '</td></tr></table>'
        + '<p class="ngf-petit">TVA non applicable, art. 293 B du CGI.</p>';
      if (annule) h += '<div class="ngf-etat ngf-ann">Facture annulée</div>';
      else if (paye) h += '<div class="ngf-etat">✅ Acquittée le ' + dateFr(f.paye_le) + (f.mode_paiement ? ' par ' + MODE[f.mode_paiement] : '') + '</div>';
      else {
        h += '<div class="ngf-modal"><strong>Règlement à la commande, au choix :</strong>'
          + '<a class="ngc-btn ngf-ok ngf-noprint" href="' + lienPayer(f.id) + '">💳 Payer ' + euros(f.montant_cents) + ' par carte</a>'
          + '<div>• <strong>Carte bancaire</strong> : paiement sécurisé en ligne (bouton ci-dessus).</div>'
          + '<div>• <strong>Virement</strong> : ' + (d.iban ? 'IBAN ' + esc(d.iban) + (d.bic ? ' — BIC ' + esc(d.bic) : '') + (d.titulaire ? ' — ' + esc(d.titulaire) : '') : 'coordonnées bancaires sur demande')
          + ' — référence <strong>' + esc(f.facture_num) + '</strong>.</div>'
          + '<div>• <strong>Espèces</strong> : à remettre à la commande.</div></div>';
      }
      h += '<p class="ngf-petit ngf-cgv">Paiement à la commande, sans escompte. Pour les clients professionnels : en cas de retard, pénalités au taux légal en vigueur et indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).</p>'
        + '</div><button type="button" class="ngc-btn ngc-sec ngf-ok ngf-noprint" onclick="window.print()">🖨️ Imprimer / enregistrer en PDF</button>';
      fenetre(h);
      document.body.classList.add('ngf-impression');
    });
  }

  /* ================== 3. Carte admin « Commandes & factures » ================== */
  function admin(z) {
    if (!pret() || !estAdmin() || !z) return;
    var w = document.createElement('div'); w.className = 'ngp-carte'; w.id = 'ngf-admin';
    w.innerHTML = '<div class="ngp-mission-t">🧾 Commandes & factures</div><div class="ngp-note">Chargement…</div>';
    var racine = z.querySelector('#ngc-admin') || z;
    racine.insertBefore(w, racine.firstChild);
    Promise.all([
      sb().from('paiements').select('*').not('facture_num', 'is', null).order('created_at', { ascending: false }).limit(30),
      lireRib()
    ]).then(function (r) {
      var l = (r[0].data || []), rib = r[1];
      var h = '<div class="ngp-mission-t">🧾 Commandes & factures</div>';
      if (!l.length) h += '<div class="ngp-note">Aucune facture. Validez un devis depuis le lien « Valider la commande » de son mail.</div>';
      l.forEach(function (f) {
        var st = f.statut === 'paye' ? '✅ payée' : f.statut === 'annule' ? '✖ annulée' : '⏳ à payer';
        h += '<div class="ngf-ligne"><div><strong>' + esc(f.facture_num) + '</strong> · ' + esc(f.client_nom || f.client_email) + '<br>'
          + '<span class="ngp-note">' + esc(f.libelle) + ' — ' + euros(f.montant_cents) + ' · ' + st + '</span></div><div class="ngc-acts">'
          + '<button type="button" class="ngc-btn ngc-sec" data-ngf-voir="' + f.id + '">Voir</button>'
          + (f.statut === 'a_payer' ? '<button type="button" class="ngc-btn ngc-sec" data-ngf-mail="' + f.id + '">Mail</button>'
            + '<button type="button" class="ngc-btn ngc-sec" data-ngf-paye="' + f.id + '" data-mode="virement">Virement reçu</button>'
            + '<button type="button" class="ngc-btn ngc-sec" data-ngf-paye="' + f.id + '" data-mode="especes">Espèces reçues</button>' : '')
          + '</div></div>';
      });
      h += '<details class="ngf-rib"><summary>Coordonnées bancaires affichées sur les factures</summary>'
        + '<input id="ngf-iban" class="ngc-in" placeholder="IBAN" value="' + esc(rib.iban || '') + '">'
        + '<input id="ngf-bic" class="ngc-in" placeholder="BIC" value="' + esc(rib.bic || '') + '">'
        + '<input id="ngf-tit" class="ngc-in" placeholder="Titulaire du compte" value="' + esc(rib.titulaire || '') + '">'
        + '<button type="button" class="ngc-btn" id="ngf-rib-ok">Enregistrer</button></details>';
      w.innerHTML = h;
      var parId = {}; l.forEach(function (f) { parId[f.id] = f; });
      w.querySelectorAll('[data-ngf-voir]').forEach(function (b) { b.onclick = function () { afficherFacture(b.getAttribute('data-ngf-voir')); }; });
      w.querySelectorAll('[data-ngf-mail]').forEach(function (b) { b.onclick = function () { envoyerMail(parId[b.getAttribute('data-ngf-mail')], b); }; });
      w.querySelectorAll('[data-ngf-paye]').forEach(function (b) {
        b.onclick = function () {
          var f = parId[b.getAttribute('data-ngf-paye')], mode = b.getAttribute('data-mode');
          if (!confirm('Marquer la facture ' + f.facture_num + ' comme payée par ' + (mode === 'especes' ? 'espèces' : 'virement') + ' ?')) return;
          sb().from('paiements').update({ statut: 'paye', paye_le: new Date().toISOString(), mode_paiement: mode }).eq('id', f.id).then(function (r) {
            if (r.error) { toast('Erreur : ' + r.error.message); return; }
            if (f.client_id) sb().from('client_messages').insert({ client_id: f.client_id, de_admin: true, titre: 'Paiement reçu ✅',
              corps: 'Merci ! Votre règlement de ' + euros(f.montant_cents) + ' (facture ' + f.facture_num + ') est bien reçu.' });
            toast('Facture ' + f.facture_num + ' acquittée.'); w.remove(); admin(z);
          });
        };
      });
      document.getElementById('ngf-rib-ok').onclick = function () {
        var v = { iban: document.getElementById('ngf-iban').value.trim().toUpperCase(), bic: document.getElementById('ngf-bic').value.trim().toUpperCase(),
          titulaire: document.getElementById('ngf-tit').value.trim() };
        sb().from('parametres').upsert(Object.keys(v).map(function (k) { return { cle: k, valeur: v[k] }; })).then(function (r) {
          toast(r.error ? 'Erreur : ' + r.error.message : 'Coordonnées bancaires enregistrées.');
        });
      };
    });
  }

  /* ================== démarrage ================== */
  function demarrer() {
    if (!pret()) { setTimeout(demarrer, 400); return; }
    var q = new URLSearchParams(location.search);
    var ref = q.get('valider'), fac = q.get('facture');
    if (ref || fac) history.replaceState(null, '', location.pathname + (q.get('paiement') ? '?paiement=' + q.get('paiement') : '') + location.hash);
    if (fac) afficherFacture(fac);
    if (ref) {
      aValider = ref;
      var essais = 0;
      (function attendre() {   /* le profil admin se charge après la session */
        if (!aValider) return;
        if (estAdmin() || essais++ > 20) { var r0 = aValider; aValider = null; ouvrirValidation(r0); return; }
        setTimeout(attendre, 500);
      })();
      P.surChangement(function () { if (aValider && estAdmin()) { var r = aValider; aValider = null; ouvrirValidation(r); } });
    }
  }

  global.NGF = { admin: admin, afficherFacture: afficherFacture, lienPayer: lienPayer, valider: ouvrirValidation };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(demarrer, 0); });
  else setTimeout(demarrer, 0);
})(window);
