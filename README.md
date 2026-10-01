# rt-game

Guess the Rotten Tomatoes critic and audience scores for a movie poster.

- `python rt_dump.py <source>` writes `rt_scores.json`
- `npm run import` upserts `rt_scores.json` into Supabase (`rt_movies`)
- `npm run dev` runs the site locally
- Scoring knobs (`MAX_POINTS`, `RANGE`, `CURVE`) are in `src/lib/score.ts`

First-time setup: run `supabase/schema.sql` in the Supabase SQL editor, then fill `.env` (see `.env.example`)
and set the same two variables in Vercel.
# rt-game
