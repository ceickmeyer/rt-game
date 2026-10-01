import { error, fail } from '@sveltejs/kit';
import { supabase } from '#lib/server/supabase.js';
import { isAdmin, logIn, logOut } from '#lib/server/admin.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	if (!isAdmin(cookies)) return { authed: false as const };

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
	login: async ({ cookies, request }) => {
		const password = String((await request.formData()).get('password') ?? '');
		if (!logIn(cookies, password)) return fail(401, { wrong: true });
	},
	logout: async ({ cookies }) => {
		logOut(cookies);
	},
	save: async ({ cookies, request }) => {
		if (!isAdmin(cookies)) return fail(401);
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
