/* =====================================================================
   Novogarden — configuration des espaces partenaires
   ---------------------------------------------------------------------
   SEUL FICHIER A MODIFIER pour brancher Supabase.

   Projet : novogarden-app (organisation Novogarden, plan gratuit)
   Tableau de bord :
   https://supabase.com/dashboard/project/svbzwhdenlbhtacbqbdz

   La cle anon est PUBLIQUE par conception : elle ne donne aucun droit
   au-dela de ce que les policies RLS autorisent. Ne jamais coller ici
   la cle "service_role", qui elle contourne toute securite.
   ===================================================================== */
window.NG_CONFIG = {
  SUPABASE_URL: 'https://svbzwhdenlbhtacbqbdz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2Ynp3aGRlbmxiaHRhY2JxYmR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNjk5MDcsImV4cCI6MjEwMzk0NTkwN30.MiwRK1UrpPwBxrWAejT4TT202yWSiweLm3H6U2dH26w',

  /* Cle PUBLIQUE Stripe (pk_…), faite pour etre dans l'appli : elle sert
     seulement a afficher le formulaire de paiement. La cle secrete (sk_…)
     reste dans les secrets Supabase. Passer en pk_live_… pour encaisser. */
  STRIPE_PK: 'pk_live_51UTG2kS1JLydBNy65CMuZTD69ghBxVaZeFcM6uJB7pnidAAkiRr0OeEtajzrQh2f05hwXYJSQRiQDdmMttz0HSN100HXKlS4tk',

  /* Lien partage par l'apporteur. Le code est ajoute en ?code=XXX */
  LIEN_PARTAGE: 'https://novogarden.github.io/novogarden-app/',

  /* Duree de la fenetre d'attribution, en jours (spec 6). */
  FENETRE_ATTRIBUTION_JOURS: 30,

  /* Compression des photos de compte-rendu (spec 8.3). */
  PHOTO_COTE_MAX: 1600,
  PHOTO_QUALITE: 0.8,
  PHOTO_MAX_PAR_TYPE: 4
};
