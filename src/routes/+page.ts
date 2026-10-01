import { error } from '@sveltejs/kit';
import { localDay } from '#lib/day.js';
import type { PageLoad } from './$types';

// The server can't know the player's timezone, so this page renders in the browser,
// which asks for the movie belonging to its own local date
export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
	const day = localDay();
	const res = await fetch(`/api/movie?d=${day}`);
	if (!res.ok) error(res.status, (await res.json().catch(() => null))?.message ?? 'Could not load movie');
	const movie: { imdb_id: string; title: string; year: number | null; poster: string | null } =
		await res.json();
	return { day, movie };
};
