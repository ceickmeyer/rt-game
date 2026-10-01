import { fail } from '@sveltejs/kit';
import { supabase } from '#lib/server/supabase.js';
import { points } from '#lib/score.js';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const critic = Number(form.get('critic'));
		const audience = Number(form.get('audience'));
		const { data: movie } = await supabase
			.from('rt_movies')
			.select('critic, audience')
			.eq('imdb_id', String(form.get('imdb_id')))
			.maybeSingle();
		if (!movie) return fail(404);

		return {
			critic: { guess: critic, actual: movie.critic, points: points(critic, movie.critic) },
			audience: { guess: audience, actual: movie.audience, points: points(audience, movie.audience) }
		};
	}
};
