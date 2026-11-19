/*
 * Connect Teamsheet to YOUR Supabase project.
 *
 * Find both values in Supabase: Project Settings > API Keys
 * (older dashboards: Project Settings > API).
 *   supabaseUrl -> "Project URL", looks like https://abcdxyz.supabase.co
 *   supabaseKey -> the "publishable" key (sb_publishable_...) or the
 *                  legacy "anon public" key (a long eyJ... string)
 *
 * Both are SAFE to put in a public website: the key only lets the site
 * call the Teamsheet functions, and the database tables are locked.
 * NEVER put the "secret" / "service_role" key here.
 */
window.TEAMSHEET_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseKey: 'YOUR-PUBLISHABLE-KEY'
};
