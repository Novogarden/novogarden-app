/* =====================================================================
   Novogarden — configuration des espaces partenaires
   ---------------------------------------------------------------------
   SEUL FICHIER A MODIFIER pour brancher Supabase.

   1. Cree ton projet sur https://supabase.com (gratuit).
   2. Ouvre Project Settings > API.
   3. Recopie ci-dessous "Project URL" et la cle "anon public".
   4. Execute sql/schema.sql dans Supabase > SQL Editor.

   La cle anon est PUBLIQUE par conception : elle ne donne aucun droit
   au-dela de ce que les policies RLS autorisent. Ne jamais coller ici
   la cle "service_role", qui elle contourne toute securite.

   Tant que les deux valeurs restent vides, les espaces partenaires
   sont invisibles et l'application se comporte exactement comme avant.
   ===================================================================== */
window.NG_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  /* Lien partage par l'apporteur. Le code est ajoute en ?code=XXX */
  LIEN_PARTAGE: 'https://novogarden.github.io/novogarden-app/',

  /* Duree de la fenetre d'attribution, en jours (spec 6). */
  FENETRE_ATTRIBUTION_JOURS: 30,

  /* Compression des photos de compte-rendu (spec 8.3). */
  PHOTO_COTE_MAX: 1600,
  PHOTO_QUALITE: 0.8,
  PHOTO_MAX_PAR_TYPE: 4
};
