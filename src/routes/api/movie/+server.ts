import { error, json } from '@sveltejs/kit';
import { supabase } from '#lib/server/supabase.js';
import type { RequestHandler } from './$types';

const DAY_MS = 86_400_000;

export const GET: RequestHandler = async ({ url }) => {
	const day = url.searchParams.get('d') ?? '';
	const requested = Date.parse(`${day}T00:00:00Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(requested)) error(400, 'Bad date');

	// Every timezone's local date is within a day of UTC's, so this allows any real player
	// while stopping anyone from peeking (and using up movies) further ahead
	const utcToday = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
	if (Math.abs(requested - utcToday) > DAY_MS) error(400, 'Date out of range');

	const { data: id, error: rpcError } = await supabase.rpc('rt_movie_for_day', { d: day });
	if (rpcError) error(500, rpcError.message);
	if (!id) error(503, 'Out of movies');

	const { data: movie, error: err } = await supabase
		.from('rt_movies')
		.select('imdb_id, title, year, poster')
		.eq('imdb_id', id)
		.single();
	if (err) error(500, err.message);
	return json(movie);
};
