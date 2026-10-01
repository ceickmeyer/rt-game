import { supabase } from '#lib/server/supabase.js';

// The Supabase project is shared with other apps, so being logged in isn't enough:
// the account must also be listed in rt_admins.
export async function adminUser(locals: App.Locals) {
	const user = await locals.getUser();
	if (!user) return null;
	const { data } = await supabase.from('rt_admins').select('user_id').eq('user_id', user.id).maybeSingle();
	return data ? user : null;
}
