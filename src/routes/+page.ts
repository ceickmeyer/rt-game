import { error } from '@sveltejs/kit';
import { localDay } from '#lib/day.js';
import type { PageLoad } from './$types';

// The server can't know the player's timezone, so this page renders in the browser,
// which asks for the movie belonging to its own local date
export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch(`/api/movie?d=${localDay()}`);
	if (!res.ok) error(res.status, (await res.json().catch(() => null))?.message ?? 'Could not load movie');
	// day is the play day this movie belongs to (can be before today), next is when the next one comes out
	const data: {
		day: string;
		next: string;
		movie: { imdb_id: string; title: string; year: number | null; poster: string | null };
	} = await res.json();
	return data;
};
