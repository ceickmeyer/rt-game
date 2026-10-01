import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';

// Browser client for /admin, same setup as tutoring-app: the session lives in the browser
// and RLS policies (supabase/schema.sql) decide what a signed-in admin can read and change.
export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
