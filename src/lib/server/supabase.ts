import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$app/env/private';

// Service-role client: bypasses RLS. Server-only, so real scores stay hidden until a guess is in.
export const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
