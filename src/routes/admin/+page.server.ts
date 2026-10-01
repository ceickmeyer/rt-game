import { error, fail, redirect } from '@sveltejs/kit';
import { supabase } from '#lib/server/supabase.js';
import { adminUser } from '#lib/server/admin.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = await locals.getUser();
	if (!user) redirect(303, '/admin/login');
	if (!(await adminUser(locals))) return { authed: false as const, email: user.email };

	const [movies, daily] = await Promise.all([
		supabase
			.from('rt_movies')
			.select('imdb_id, title, year, poster, critic, audience, queue_pos')
			.order('queue_pos', { nullsFirst: false })
			.order('imdb_id'),
		supabase.from('rt_daily').select('day, imdb_id').order('day')
	]);
	if (movies.error) error(500, movies.error.message);
	if (daily.error) error(500, daily.error.message);

	const byId = new Map(movies.data.map((m) => [m.imdb_id, m]));
	const used = new Set(daily.data.map((d) => d.imdb_id));
	return {
		authed: true as const,
		played: daily.data.map((d) => ({ day: d.day, movie: byId.get(d.imdb_id)! })),
		queue: movies.data.filter((m) => !used.has(m.imdb_id))
	};
};

export const actions: Actions = {
	logout: async ({ locals }) => {
		await locals.supabase.auth.signOut();
		redirect(303, '/admin/login');
	},
	save: async ({ locals, request }) => {
		if (!(await adminUser(locals))) return fail(403);
		let ids: unknown;
		try {
			ids = JSON.parse(String((await request.formData()).get('order')));
		} catch {
			return fail(400);
		}
		if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return fail(400);

		const { error: err } = await supabase.rpc('rt_set_queue', { ids });
		if (err) return fail(500, { message: err.message });
		return { saved: true };
	}
};
