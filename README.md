# Tomatle

The daily movie score guessing game: guess the Rotten Tomatoes critic and audience scores for a movie poster.

- `python rt_dump.py <source>` writes `rt_scores.json`
- `npm run import` upserts `rt_scores.json` into Supabase (`rt_movies`)
- `npm run dev` runs the site locally
- `/admin` (Supabase login, account must be in `rt_admins`) shows and edits the upcoming movie order
- Scoring knobs (`MAX_POINTS`, `RANGE`, `CURVE`) are in `src/lib/score.ts`

First-time setup: run `supabase/schema.sql` in the Supabase SQL editor, then fill `.env` (see `.env.example`)
and set the same variables in Vercel.
# rt-game
