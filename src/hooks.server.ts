import type { Handle } from '@sveltejs/kit/hooks';
import { supabase } from '#lib/server/supabase.js';

const NAME = 'Tomatle';
const TAGLINE = 'The daily movie score guessing game. Guess the Rotten Tomatoes critic and audience scores. 🍅🍿';

const escape = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Link previews (Discord, iMessage, Slack...). The game page renders in the browser, so the tags
// are added to the HTML shell here, where crawlers can see them.
// A shared result links to /?d=<play day>&s=<points>, which previews that day's movie and score.
async function meta(url: URL) {
	let title = NAME;
	let description = TAGLINE;
	let image = `${url.origin}/og.png`;

	const day = url.searchParams.get('d') ?? '';
	const score = Number(url.searchParams.get('s'));
	if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isInteger(score) && score >= 0 && score <= 100) {
		// Only days that have already been handed out, so a preview can never assign a movie
		const { data: daily } = await supabase.from('rt_daily').select('imdb_id').eq('day', day).maybeSingle();
		const { data: movie } = daily
			? await supabase.from('rt_movies').select('title, year, poster').eq('imdb_id', daily.imdb_id).maybeSingle()
			: { data: null };
		if (movie) {
			title = `${NAME} · ${movie.title}${movie.year ? ` (${movie.year})` : ''}`;
			description = `🍅 ${score}/100`;
			if (movie.poster) image = movie.poster.replace('/original/', '/w500/');
		}
	}

	return [
		['og:site_name', NAME],
		['og:type', 'website'],
		['og:url', url.href],
		['og:title', title],
		['og:description', description],
		['og:image', image],
		['twitter:card', 'summary'],
		['description', description],
		['theme-color', '#fa320a']
	]
		.map(([key, value]) =>
			key.startsWith('og:')
				? `<meta property="${key}" content="${escape(value)}" />`
				: `<meta name="${key}" content="${escape(value)}" />`
		)
		.join('\n\t\t');
}

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname !== '/') return resolve(event);
	const tags = await meta(event.url);
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<!-- meta -->', tags)
	});
};
