# rt-game: instructions for AI coding assistants

Minimal SvelteKit game: one movie poster and two sliders (Rotten Tomatoes critic + audience score).
Points depend on how close the guess is. A copy-to-clipboard button shares the result.
Keep the UI VERY minimal and don't add features or chrome unless asked.

## Stack
- SvelteKit 3 + Svelte 5 (runes mode), TypeScript, deployed on Vercel (@sveltejs/adapter-vercel)
- Supabase project is SHARED with other apps: prefix every table/function/view/policy with `rt_`
- No CSS framework: plain scoped <style> blocks, CSS vars --fg/--bg/--muted set in +layout.svelte

## SvelteKit 3 gotchas (this is NOT v2)
- Config lives in vite.config.ts inside sveltekit({...}); there is no svelte.config.js
- Lib alias is `#lib/...` and needs a .js extension: import { points } from '#lib/score.js'
- Env vars are declared in src/env.ts via defineEnvVars, then imported from
  '$app/env/private' / '$app/env/public' (NOT '$env/static/...')
- browser/dev/building come from '$app/env'

## Data pipeline
- rt_dump.py (MDBList API) writes rt_scores.json:
  { movies: [{ imdb_id, title, year, poster, critic, audience }], skipped: [] }
- `npm run import` (scripts/import.mjs) upserts the JSON into the rt_movies table. Safe to re-run.
- Schema: supabase/schema.sql (rt_movies, rt_daily, rt_movie_for_day). Run it by hand in the Supabase SQL editor (no psql/supabase CLI here).

## Security model
- rt_movies has RLS enabled with NO policies, so only the service-role client can read it
  (src/lib/server/supabase.ts, server-only).
- `load` returns only imdb_id, title, year, poster. Real scores are returned only by the
  form action after a guess. Never send critic/audience to the client before that.

## Scoring (src/lib/score.ts; tune only here)
- MAX_POINTS = 50 per slider (100 total), RANGE = 40, CURVE = 1.5
- points = round(MAX_POINTS * (1 - min(|guess - actual|, RANGE) / RANGE) ** CURVE)
- Goal: leaving the sliders at 50 should score badly

## Routes / behavior
- One movie per day, rolling over at the PLAYER'S local midnight (not server/UTC time)
- `/` has ssr = false (src/routes/+page.ts): the browser computes its local YYYY-MM-DD and calls
  GET /api/movie?d=... ; the server only accepts UTC today ±1 day (covers every timezone, blocks peeking ahead)
- rt_daily (day -> imdb_id, imdb_id UNIQUE) guarantees a movie is never reused; the SQL function
  rt_movie_for_day(d) lazily assigns a random unused movie the first time a day is requested.
  Execute is revoked from anon/authenticated; only the service role calls it.
- The finished result is saved in localStorage (`rt-game:<day>`) so refreshing can't replay the day
- The page reloads itself when the local date changes (open tab past midnight)
- Share text: date, title, points (never the actual scores), site URL
- Layout must never scroll: main is 100dvh and the poster flexes to fill what the controls leave
- TMDB poster URLs are rewritten /original/ -> /w500/

## Reveal animation (src/routes/+page.svelte, sounds in src/lib/sound.ts)
- After a guess the user's thumb stays put; an RT icon (static/icons) drops in at the guess and slides to the actual score, ticking per number, flipping fresh/rotten (popcorn/spilled) at 60%. Then points pop in, then the total counts up
- The whole reveal must stay under ~2s (glides capped at 550ms). Respect prefers-reduced-motion.
- Sounds are Web Audio blips (no files); unlock() must run inside the submit click

## Env (.env locally, same names in Vercel project settings)
- PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

## Commands
- npm run dev | npm run check | npm run build | npm run import
- Run `npm run check` after changes; it should report 0 errors.
