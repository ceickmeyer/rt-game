// Upserts rt_scores.json into the rt_movies table. Safe to re-run.
// Usage: npm run import
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { movies } = JSON.parse(readFileSync(new URL('../rt_scores.json', import.meta.url)));
const rows = movies
	.filter((m) => m.title && m.critic != null && m.audience != null)
	.map(({ imdb_id, title, year, poster, critic, audience, votes }) => ({
		imdb_id,
		title,
		year,
		poster,
		critic: Math.round(critic),
		audience: Math.round(audience),
		votes: votes ?? null
	}));

for (let i = 0; i < rows.length; i += 500) {
	const { error } = await supabase.from('rt_movies').upsert(rows.slice(i, i + 500));
	if (error) {
		console.error(error);
		process.exit(1);
	}
}
// put any newly added movies at the end of the play queue
const { error } = await supabase.rpc('rt_queue_append');
if (error) {
	console.error(error);
	process.exit(1);
}
console.log(`Upserted ${rows.length} movies`);
