/* =====================================================================
   Novogarden — suivi client : compteur de tontes + notifications
   ---------------------------------------------------------------------
   Données dans Supabase (sql/migration-02-clients.sql) :
     client_packs    : pack attribué par Novogarden (Solo 1, Essentiel 5…)
     client_passages : chaque tonte effectuée, rattachée au pack
     client_messages : notifications Novogarden -> client et client -> Novogarden

   Côté client  : notifications reçues dans l'écran Notifications, envoi
                  d'un message à Novogarden, pastille « N tontes restantes »
                  et carte « Mon pack » dans Solde.
   Côté admin   : onglet « Clients » de l'Administration — packs, +1 tonte,
                  annulation, notification à un client ou à tous, messages reçus.
   ===================================================================== */
(function (global) {
  'use strict';

  var P = null;
  var etat = { packs: [], passages: [], messages: [], charge: false };
  var canal = null, canalAdmin = null;
  var nonLusAdmin = 0;
  var PACKS = [
    { lib: 'Pack Solo', n: 1 },
    { lib: 'Pack Essentiel', n: 5 },
    { lib: 'Pack Sérénité', n: 10 }
  ];

  function pret() { P = global.NGP; return !!(P && P.estConfigure && P.estConfigure() && P.client()); }
  function sb() { return P.client(); }
  function moi() { return P && P.session && P.session.user ? P.session.user.id : null; }
  function esc(s) { return P ? P.esc(s) : String(s == null ? '' : s); }
  function dateFr(d) {
    if (!d) return '—';
    var x = new Date(String(d).length <= 10 ? d + 'T00:00:00' : d);
    return isNaN(x) ? String(d) : x.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function heureFr(d) {
    var x = new Date(d);
    return isNaN(x) ? '' : x.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' · '
      + x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function toast(m) { if (P && P.toast) P.toast(m); }

  /* ---------- calcul du compteur ---------- */

  function resume(packs, passages) {
    var actifs = packs.filter(function (p) { return p.actif; });
    var total = 0, faites = 0, lib = '';
    actifs.forEach(function (p) {
      var f = passages.filter(function (x) { return x.pack_id === p.id; }).length;
      total += p.total; faites += Math.min(f, p.total);
      if (!lib) lib = p.libelle;
    });
    return { actif: actifs.length > 0, total: total, faites: faites, reste: Math.max(0, total - faites), libelle: lib };
  }

  /* Utilisé par la pastille de l'écran Notifications (index.html). */
  global.NGC_RESTE = function () {
    if (!etat.charge || !moi()) return null;
    var r = resume(etat.packs, etat.passages);
    return r.actif ? { n: r.reste, pack: r.libelle } : { n: 0, pack: '' };
  };

  /* ====================== CÔTÉ CLIENT ====================== */

  function chargerClient() {
    if (!pret() || !moi()) { etat.charge = false; rendreClient(); return Promise.resolve(); }
    var id = moi();
    return Promise.all([
      sb().from('client_packs').select('*').eq('client_id', id).order('created_at'),
      sb().from('client_passages').select('*').eq('client_id', id).order('date'),
      sb().from('client_messages').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(100)
    ]).then(function (r) {
      if (r[0].error) { etat.charge = false; return; } /* tables pas encore créées */
      etat.packs = r[0].data || []; etat.passages = r[1].data || []; etat.messages = r[2].data || [];
      etat.charge = true;
      rendreClient();
    }).catch(function () { etat.charge = false; });
  }

  function ecouterClient() {
    if (canal || !moi()) return;
    var f = 'client_id=eq.' + moi();
    canal = sb().channel('ngc-' + moi())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages', filter: f }, function (p) {
        if (p.eventType === 'INSERT' && p.new && p.new.de_admin) toast('🔔 ' + (p.new.titre || 'Nouveau message de Novogarden'));
        chargerClient();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_passages', filter: f }, chargerClient)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_packs', filter: f }, chargerClient)
      .subscribe();
  }
  function arreterEcoute() {
    if (canal) { try { sb().removeChannel(canal); } catch (e) {} canal = null; }
    if (canalAdmin) { try { sb().removeChannel(canalAdmin); } catch (e) {} canalAdmin = null; }
  }

  function rendreClient() {
    rendreNotifs();
    rendreSolde();
    if (typeof global.ngMajReste === 'function') global.ngMajReste();
  }

  /* Notifications reçues : insérées en tête de la liste existante. */
  function rendreNotifs() {
    var liste = document.getElementById('notif-list');
    if (!liste) return;
    liste.querySelectorAll('.ngc-notif').forEach(function (e) { e.remove(); });
    var vide = liste.querySelector('.ngj-empty');
    var recus = etat.charge ? etat.messages.filter(function (m) { return m.de_admin; }) : [];
    if (recus.length && vide) vide.remove();
    var frag = document.createDocumentFragment();
    recus.forEach(function (m) {
      var d = document.createElement('div');
      d.className = 'notif-item ngc-notif' + (m.lu ? '' : ' unread');
      d.setAttribute('data-ngj', 'ngc-' + m.id);
      d.innerHTML = '<div class="notif-title">' + esc(m.titre || 'Novogarden') + '</div>'
        + '<div class="notif-body">' + esc(m.corps) + '</div>'
        + '<div class="notif-time">' + heureFr(m.created_at) + '</div>';
      frag.appendChild(d);
    });
    liste.insertBefore(frag, liste.firstChild);
    rendreZoneEcrire();
    majCloche();
  }

  function majCloche() {
    var n = document.querySelectorAll('#notif-list .notif-item.unread:not(.ngn-masque)').length;
    ['bell-badge', 'bell-badge-t'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) { b.textContent = n; b.style.display = n > 0 ? 'flex' : 'none'; }
    });
  }

  function marquerLus() {
    if (!etat.charge || !moi()) return;
    var non = etat.messages.some(function (m) { return m.de_admin && !m.lu; });
    if (!non) return;
    sb().rpc('marquer_messages_lus').then(function () {
      etat.messages.forEach(function (m) { if (m.de_admin) m.lu = true; });
      setTimeout(function () {
        document.querySelectorAll('#notif-list .ngc-notif.unread').forEach(function (e) { e.classList.remove('unread'); });
        majCloche();
      }, 2500);
    });
  }

  /* Zone « Écrire à Novogarden » sous la liste. */
  function rendreZoneEcrire() {
    var ecr = document.getElementById('notifs');
    if (!ecr) return;
    var z = document.getElementById('ngc-ecrire');
    if (!moi() || !etat.charge) { if (z) z.remove(); return; }
    if (!z) {
      z = document.createElement('div');
      z.id = 'ngc-ecrire';
      z.className = 'ngc-ecrire';
      ecr.appendChild(z);
    }
    var envoyes = etat.messages.filter(function (m) { return !m.de_admin; }).slice(0, 5);
    var h = '<div class="ngc-ecrire-t">Écrire à Novogarden</div>'
      + '<textarea id="ngc-txt" maxlength="2000" rows="3" placeholder="Une question, un changement de date, un accès au jardin…"></textarea>'
      + '<button type="button" id="ngc-envoyer" class="ngc-btn">Envoyer</button>';
    if (envoyes.length) {
      h += '<div class="ngc-hist-t">Vos derniers messages</div>';
      envoyes.forEach(function (m) {
        h += '<div class="ngc-hist"><div>' + esc(m.corps) + '</div><span>' + heureFr(m.created_at)
          + (m.lu ? ' · lu par Novogarden' : ' · envoyé') + '</span></div>';
      });
    }
    var garde = document.getElementById('ngc-txt'); var brouillon = garde ? garde.value : '';
    z.innerHTML = h;
    document.getElementById('ngc-txt').value = brouillon;
    document.getElementById('ngc-envoyer').onclick = envoyerClient;
  }

  function envoyerClient() {
    var t = document.getElementById('ngc-txt');
    var txt = (t && t.value || '').trim();
    if (!txt) { toast('Écrivez votre message.'); return; }
    var b = document.getElementById('ngc-envoyer'); b.disabled = true;
    sb().from('client_messages').insert({ client_id: moi(), de_admin: false, corps: txt }).then(function (r) {
      b.disabled = false;
      if (r.error) { toast('Envoi impossible : ' + r.error.message); return; }
      t.value = '';
      toast('Message envoyé à Novogarden ✅');
      alerterMail(txt);
      chargerClient();
    });
  }

  /* Copie par mail à contact@novogardenhub.com (même canal que les devis). */
  function alerterMail(txt) {
    var p = (P && P.profil) || {};
    try {
      fetch('https://formsubmit.co/ajax/contact@novogardenhub.com', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: 'Appli Novogarden — message de ' + ((p.prenom || '') + ' ' + (p.nom || '')).trim(),
          client: ((p.prenom || '') + ' ' + (p.nom || '')).trim(), email: p.email || '', telephone: p.telephone || '',
          message: txt, _template: 'table'
        })
      }).catch(function () {});
    } catch (e) {}
  }

  /* Carte « Mon pack » dans l'onglet Solde. */
  function rendreSolde() {
    var body = document.querySelector('#solde .solde-body');
    if (!body) return;
    var w = document.getElementById('ngc-solde');
    if (!etat.charge || !etat.packs.length) { if (w) w.remove(); return; }
    if (!w) {
      w = document.createElement('div'); w.id = 'ngc-solde';
      body.insertBefore(w, body.firstChild.nextSibling);
    }
    var r = resume(etat.packs, etat.passages);
    var pct = r.total ? Math.round(r.faites / r.total * 100) : 0;
    var pl = r.reste > 1 ? 's' : '';
    var h = '<p class="sect">Mon pack</p><div class="ngj-card"><div class="ngj-head">'
      + '<div class="ngj-pack">' + esc(r.libelle || 'Aucun pack actif') + '</div>'
      + '<div class="ngj-count">' + r.faites + ' / ' + r.total + '</div></div>'
      + '<div class="ngj-bar"><div class="ngj-fill" style="width:' + pct + '%"></div></div>'
      + '<div class="ngj-sub">' + r.reste + ' tonte' + pl + ' restante' + pl + '</div></div>';
    if (etat.passages.length) {
      h += '<p class="sect">Historique des passages</p>';
      etat.passages.slice().reverse().forEach(function (x, i) {
        h += '<div class="ngj-item"><div><div class="ngj-date">' + dateFr(x.date) + '</div>'
          + '<div class="ngj-note">Tonte n°' + (etat.passages.length - i) + (x.note ? ' · ' + esc(x.note) : '') + '</div></div></div>';
      });
    }
    w.innerHTML = h;
    var st = document.getElementById('sd-tontes'); if (st) st.textContent = etat.passages.length;
  }

  /* ====================== CÔTÉ ADMIN ====================== */

  var adm = { profils: [], packs: [], passages: [], messages: [], ouvert: null };

  function chargerAdmin() {
    return Promise.all([
      sb().from('profiles').select('id,prenom,nom,email,telephone,is_admin,compte_supprime').order('nom'),
      sb().from('client_packs').select('*').order('created_at'),
      sb().from('client_passages').select('*').order('date'),
      sb().from('client_messages').select('*').order('created_at', { ascending: false }).limit(500)
    ]).then(function (r) {
      if (r[1].error) throw r[1].error;
      adm.profils = (r[0].data || []).filter(function (p) { return !p.compte_supprime; });
      adm.packs = r[1].data || []; adm.passages = r[2].data || []; adm.messages = r[3].data || [];
      nonLusAdmin = adm.messages.filter(function (m) { return !m.de_admin && !m.lu; }).length;
      majPastilleAdmin();
    });
  }

  function majPastilleAdmin() {
    var t = document.querySelector('[data-adm-tab="clients"]');
    if (t) t.innerHTML = 'Clients' + (nonLusAdmin ? ' <span class="ngc-pastille">' + nonLusAdmin + '</span>' : '');
    var nav = document.querySelector('#nav-partadmin .nav-label');
    if (nav) nav.innerHTML = 'Admin' + (nonLusAdmin ? ' <span class="ngc-pastille">' + nonLusAdmin + '</span>' : '');
  }

  function ecouterAdmin() {
    if (canalAdmin) return;
    canalAdmin = sb().channel('ngc-admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'client_messages' }, function (p) {
        if (p.new && !p.new.de_admin) {
          var c = adm.profils.filter(function (x) { return x.id === p.new.client_id; })[0];
          toast('✉️ Message de ' + (c ? (c.prenom + ' ' + c.nom).trim() : 'un client'));
        }
        chargerAdmin().then(function () { if (document.getElementById('ngc-admin')) rendreAdmin(); });
      })
      .subscribe();
  }

  /* Appelée par l'onglet « Clients » de ng-admin.js. */
  function sectionAdmin(z) {
    z.innerHTML = '<div class="ngp-chargement">Chargement…</div>';
    chargerAdmin().then(function () { rendreAdmin(); })
      .catch(function (e) {
        z.innerHTML = '<div class="ngp-carte"><p class="ngp-note" style="margin:0">Base clients pas encore installée : '
          + 'exécuter sql/migration-02-clients.sql dans Supabase.<br><small>' + esc(e && e.message) + '</small></p></div>';
      });
  }

  function nomDe(p) { return ((p.prenom || '') + ' ' + (p.nom || '')).trim() || p.email; }

  function rendreAdmin() {
    var z = document.getElementById('adm-corps');
    if (!z) return;
    var clients = adm.profils.filter(function (p) { return !p.is_admin; });
    var h = '<div id="ngc-admin">'
      + '<div class="ngp-carte"><div class="ngp-mission-t">📣 Notifier tous les clients</div>'
      + '<input id="ngc-tous-t" class="ngc-in" maxlength="80" placeholder="Titre (ex. Reprise des tontes)">'
      + '<textarea id="ngc-tous-c" class="ngc-in" rows="2" maxlength="2000" placeholder="Message"></textarea>'
      + '<button type="button" class="ngc-btn" id="ngc-tous-go">Envoyer à ' + clients.length + ' client(s)</button></div>';
    clients.sort(function (a, b) { return nonLus(b.id) - nonLus(a.id) || nomDe(a).localeCompare(nomDe(b)); });
    clients.forEach(function (c) {
      var pk = adm.packs.filter(function (p) { return p.client_id === c.id; });
      var pa = adm.passages.filter(function (p) { return p.client_id === c.id; });
      var r = resume(pk, pa), nl = nonLus(c.id), ouvert = adm.ouvert === c.id;
      h += '<div class="ngp-carte ngc-cli' + (ouvert ? ' ouvert' : '') + '">'
        + '<div class="ngc-cli-h" data-ngc-ouvrir="' + c.id + '"><div><div class="ngp-mission-t">' + esc(nomDe(c))
        + (nl ? ' <span class="ngc-pastille">' + nl + '</span>' : '') + '</div>'
        + '<div class="ngp-note" style="margin:0">' + esc(c.email) + (c.telephone ? ' · ' + esc(c.telephone) : '') + '</div></div>'
        + '<div class="ngc-compte' + (r.actif ? '' : ' vide') + '">' + (r.actif ? r.reste + '<small>/' + r.total + '</small>' : '—') + '</div></div>';
      if (ouvert) h += detailClient(c, pk, pa);
      h += '</div>';
    });
    if (!clients.length) h += '<div class="ngp-carte"><p class="ngp-note" style="margin:0">Aucun client inscrit pour le moment.</p></div>';
    z.innerHTML = h + '</div>';
    brancherAdmin(z);
  }

  function nonLus(id) {
    return adm.messages.filter(function (m) { return m.client_id === id && !m.de_admin && !m.lu; }).length;
  }

  function detailClient(c, pk, pa) {
    var h = '<div class="ngc-det">';
    var actifs = pk.filter(function (p) { return p.actif; });
    if (actifs.length) {
      actifs.forEach(function (p) {
        var f = pa.filter(function (x) { return x.pack_id === p.id; });
        h += '<div class="ngc-pack"><div><strong>' + esc(p.libelle) + '</strong> — ' + f.length + ' / ' + p.total
          + ' faites · <strong>' + Math.max(0, p.total - f.length) + ' restante(s)</strong></div>'
          + '<input type="date" class="ngc-in ngc-date" id="ngc-d-' + p.id + '" value="' + new Date().toISOString().slice(0, 10) + '">'
          + '<input class="ngc-in" id="ngc-n-' + p.id + '" maxlength="200" placeholder="Note (facultatif)">'
          + '<div class="ngc-acts"><button type="button" class="ngc-btn" data-ngc-plus="' + p.id + '">+1 tonte effectuée</button>'
          + (f.length ? '<button type="button" class="ngc-btn ngc-sec" data-ngc-moins="' + f[f.length - 1].id + '">Annuler la dernière</button>' : '')
          + '<button type="button" class="ngc-btn ngc-sec" data-ngc-clore="' + p.id + '">Clore le pack</button></div>';
        f.slice().reverse().forEach(function (x) {
          h += '<div class="ngp-note" style="margin:2px 0">• ' + dateFr(x.date) + (x.note ? ' — ' + esc(x.note) : '') + '</div>';
        });
        h += '</div>';
      });
    }
    h += '<div class="ngc-sous">Attribuer un pack</div><div class="ngc-acts">';
    PACKS.forEach(function (p) {
      h += '<button type="button" class="ngc-btn ngc-sec" data-ngc-pack="' + c.id + '" data-lib="' + p.lib + '" data-n="' + p.n + '">'
        + p.lib + ' (' + p.n + ')</button>';
    });
    h += '<button type="button" class="ngc-btn ngc-sec" data-ngc-pack="' + c.id + '" data-lib="" data-n="">Autre…</button></div>';

    h += '<div class="ngc-sous">Messages</div><div class="ngc-fil">';
    var fil = adm.messages.filter(function (m) { return m.client_id === c.id; }).slice(0, 20).reverse();
    if (!fil.length) h += '<div class="ngp-note">Aucun message.</div>';
    fil.forEach(function (m) {
      h += '<div class="ngc-bulle ' + (m.de_admin ? 'moi' : 'lui') + '">'
        + (m.titre ? '<strong>' + esc(m.titre) + '</strong><br>' : '') + esc(m.corps)
        + '<span>' + heureFr(m.created_at) + (m.de_admin ? (m.lu ? ' · lu' : ' · non lu') : '') + '</span></div>';
    });
    h += '</div><input id="ngc-t-' + c.id + '" class="ngc-in" maxlength="80" placeholder="Titre de la notification">'
      + '<textarea id="ngc-c-' + c.id + '" class="ngc-in" rows="2" maxlength="2000" placeholder="Message au client"></textarea>'
      + '<button type="button" class="ngc-btn" data-ngc-msg="' + c.id + '">Envoyer la notification</button></div>';
    return h;
  }

  function brancherAdmin(z) {
    z.querySelectorAll('[data-ngc-ouvrir]').forEach(function (el) {
      el.onclick = function () {
        var id = this.getAttribute('data-ngc-ouvrir');
        adm.ouvert = adm.ouvert === id ? null : id;
        if (adm.ouvert && nonLus(id)) {
          sb().from('client_messages').update({ lu: true }).eq('client_id', id).eq('de_admin', false).eq('lu', false)
            .then(function () { chargerAdmin().then(rendreAdmin); });
        }
        rendreAdmin();
      };
    });
    z.querySelectorAll('[data-ngc-plus]').forEach(function (b) {
      b.onclick = function () {
        var pid = this.getAttribute('data-ngc-plus');
        var p = adm.packs.filter(function (x) { return x.id === pid; })[0];
        var d = document.getElementById('ngc-d-' + pid).value || new Date().toISOString().slice(0, 10);
        var n = document.getElementById('ngc-n-' + pid).value.trim();
        var faites = adm.passages.filter(function (x) { return x.pack_id === pid; }).length;
        if (faites >= p.total && !confirm('Ce pack est déjà épuisé. Ajouter quand même ?')) return;
        b.disabled = true;
        sb().from('client_passages').insert({ pack_id: pid, client_id: p.client_id, date: d, note: n || null }).then(function (r) {
          if (r.error) { b.disabled = false; toast('Erreur : ' + r.error.message); return; }
          var reste = Math.max(0, p.total - faites - 1);
          return sb().from('client_messages').insert({
            client_id: p.client_id, de_admin: true, titre: 'Tonte effectuée ✅',
            corps: 'Votre tonte du ' + dateFr(d) + ' est faite' + (n ? ' (' + n + ')' : '') + '. '
              + p.libelle + ' : ' + reste + ' tonte' + (reste > 1 ? 's' : '') + ' restante' + (reste > 1 ? 's' : '') + '.'
          }).then(function () { toast('Tonte enregistrée, client notifié.'); return chargerAdmin(); }).then(rendreAdmin);
        });
      };
    });
    z.querySelectorAll('[data-ngc-moins]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('Annuler la dernière tonte enregistrée ?')) return;
        sb().from('client_passages').delete().eq('id', this.getAttribute('data-ngc-moins')).then(function (r) {
          if (r.error) { toast('Erreur : ' + r.error.message); return; }
          toast('Dernière tonte annulée.'); chargerAdmin().then(rendreAdmin);
        });
      };
    });
    z.querySelectorAll('[data-ngc-clore]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('Clore ce pack ? Il ne comptera plus dans le solde du client.')) return;
        sb().from('client_packs').update({ actif: false }).eq('id', this.getAttribute('data-ngc-clore')).then(function (r) {
          if (r.error) { toast('Erreur : ' + r.error.message); return; }
          chargerAdmin().then(rendreAdmin);
        });
      };
    });
    z.querySelectorAll('[data-ngc-pack]').forEach(function (b) {
      b.onclick = function () {
        var cid = this.getAttribute('data-ngc-pack');
        var lib = this.getAttribute('data-lib'), n = parseInt(this.getAttribute('data-n'), 10);
        if (!lib) {
          lib = prompt('Nom du pack ?', 'Pack personnalisé'); if (!lib) return;
          n = parseInt(prompt('Nombre de tontes ?', '3'), 10); if (!(n > 0 && n <= 100)) return;
        }
        if (!confirm('Attribuer « ' + lib + ' » (' + n + ' tonte' + (n > 1 ? 's' : '') + ') ?')) return;
        sb().from('client_packs').insert({ client_id: cid, libelle: lib, total: n }).then(function (r) {
          if (r.error) { toast('Erreur : ' + r.error.message); return; }
          return sb().from('client_messages').insert({
            client_id: cid, de_admin: true, titre: 'Votre ' + lib + ' est actif 🌱',
            corps: n + ' tonte' + (n > 1 ? 's' : '') + ' à votre disposition. Suivez le décompte dans l’onglet Solde.'
          }).then(function () { toast('Pack attribué, client notifié.'); return chargerAdmin(); }).then(rendreAdmin);
        });
      };
    });
    z.querySelectorAll('[data-ngc-msg]').forEach(function (b) {
      b.onclick = function () {
        var cid = this.getAttribute('data-ngc-msg');
        var t = document.getElementById('ngc-t-' + cid).value.trim();
        var c = document.getElementById('ngc-c-' + cid).value.trim();
        if (!c) { toast('Écrivez le message.'); return; }
        b.disabled = true;
        sb().from('client_messages').insert({ client_id: cid, de_admin: true, titre: t || 'Message de Novogarden', corps: c }).then(function (r) {
          b.disabled = false;
          if (r.error) { toast('Erreur : ' + r.error.message); return; }
          toast('Notification envoyée.'); chargerAdmin().then(rendreAdmin);
        });
      };
    });
    var tous = document.getElementById('ngc-tous-go');
    if (tous) tous.onclick = function () {
      var t = document.getElementById('ngc-tous-t').value.trim();
      var c = document.getElementById('ngc-tous-c').value.trim();
      var cl = adm.profils.filter(function (p) { return !p.is_admin; });
      if (!c) { toast('Écrivez le message.'); return; }
      if (!cl.length || !confirm('Envoyer cette notification à ' + cl.length + ' client(s) ?')) return;
      tous.disabled = true;
      sb().from('client_messages').insert(cl.map(function (p) {
        return { client_id: p.id, de_admin: true, titre: t || 'Message de Novogarden', corps: c };
      })).then(function (r) {
        tous.disabled = false;
        if (r.error) { toast('Erreur : ' + r.error.message); return; }
        toast('Notification envoyée à ' + cl.length + ' client(s).'); chargerAdmin().then(rendreAdmin);
      });
    };
  }

  /* ---------- démarrage ---------- */

  function surSession() {
    if (!pret()) return;
    if (!moi()) { arreterEcoute(); etat = { packs: [], passages: [], messages: [], charge: false }; rendreClient(); return; }
    chargerClient(); ecouterClient();
    if (P.role('is_admin')) { chargerAdmin().then(ecouterAdmin).catch(function () {}); }
  }

  function demarrer() {
    if (!pret()) return;
    P.surChangement(surSession);
    surSession();
    /* Le journal redessine la liste : on réinsère nos notifications. */
    var l = document.getElementById('notif-list');
    if (l) new MutationObserver(function () {
      if (etat.charge && !l.querySelector('.ngc-notif') && etat.messages.some(function (m) { return m.de_admin; })) rendreNotifs();
    }).observe(l, { childList: true });
    /* Ouvrir l'écran Notifications marque les messages comme lus. */
    var n = document.getElementById('notifs');
    if (n) new MutationObserver(function () { if (n.classList.contains('active')) { rendreNotifs(); marquerLus(); } })
      .observe(n, { attributes: true, attributeFilter: ['class'] });
  }

  global.NGC = { sectionAdmin: sectionAdmin, recharger: chargerClient };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(demarrer, 0); });
  else setTimeout(demarrer, 0);
})(window);
