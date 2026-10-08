# Tomatle: instructions for AI coding assistants

Tomatle is a minimal SvelteKit game: one movie poster and two sliders (Rotten Tomatoes critic + audience score).
Points depend on how close the guess is. A copy-to-clipboard button shares the result.
Keep the UI VERY minimal and don't add features or chrome unless asked.

## Stack
- SvelteKit 3 + Svelte 5 (runes mode), TypeScript, deployed on Vercel (@sveltejs/adapter-vercel)
- Supabase project is SHARED with other apps: prefix every table/function/view/policy with `rt_`
- No CSS framework: plain scoped <style> blocks, CSS vars --fg/--bg/--muted/--track and --accent (Rotten Tomatoes red #fa320a, used for buttons, slider thumbs, the total) set in +layout.svelte

## SvelteKit 3 gotchas (this is NOT v2)
- Config lives in vite.config.ts inside sveltekit({...}); there is no svelte.config.js
- Lib alias is `#lib/...` and needs a .js extension: import { points } from '#lib/score.js'
- Env vars are declared in src/env.ts via defineEnvVars, then imported from
  '$app/env/private' / '$app/env/public' (NOT '$env/static/...')
- browser/dev/building come from '$app/env'; the Handle type comes from '@sveltejs/kit/hooks'
- Env vars marked `public: true` in src/env.ts (the PUBLIC_SUPABASE_* ones) import from '$app/env/public'

## Data pipeline
- rt_dump.py (MDBList API) writes rt_scores.json:
  { movies: [{ imdb_id, title, year, poster, critic, audience }], skipped: [] }
- `npm run import` (scripts/import.mjs) upserts the JSON into rt_movies, then calls rt_queue_append
  so new movies land at the end of the queue in random order. Safe to re-run.
- Schema: supabase/schema.sql (rt_movies + queue_pos, rt_daily, rt_admins, rt_settings, rt_movie_for_day, rt_queue_append, rt_set_queue). Run it by hand in the Supabase SQL editor (no psql/supabase CLI here).

## Security model
- rt_movies has RLS enabled with NO policies, so only the service-role client can read it
  (src/lib/server/supabase.ts, server-only).
- `load` returns only imdb_id, title, year, poster. Real scores are returned only by the
  form action after a guess. Never send critic/audience to the client before that.

## Scoring (src/lib/score.ts; tune only here)
- MAX_POINTS = 50 per slider (100 total), RANGE = 50, CURVE = 1.5
- points = round(MAX_POINTS * (1 - min(|guess - actual|, RANGE) / RANGE) ** CURVE)
- Goal: leaving the sliders at 50 should score badly

## Routes / behavior
- A new movie on each play day (rt_settings.play_days, weekdays 0 = Sunday, set on /admin; default every day),
  rolling over at the PLAYER'S local midnight (not server/UTC time). Other days keep the latest play day's movie.
  gameDay/nextGameDay in src/lib/day.ts do this math; /api/movie returns { day (the play day), next, movie }
- `/` has ssr = false (src/routes/+page.ts): the browser computes its local YYYY-MM-DD and calls
  GET /api/movie?d=... ; the server only accepts UTC today ±1 day (covers every timezone, blocks peeking ahead)
- rt_daily (day -> imdb_id, imdb_id UNIQUE) guarantees a movie is never reused; the SQL function
  rt_movie_for_day(d) assigns the next unused movie by rt_movies.queue_pos the first time a day is requested.
  Execute on all rt_ functions is revoked from anon/authenticated; only the service role calls them.
- The finished result is saved in localStorage (`rt-game:<play day>`) so refreshing can't replay it
- The page reloads itself when the next play day starts (open tab past midnight); the countdown targets it
- Share text: date, title, points (never the actual scores), and a link /?d=<play day>&s=<total>
- Link previews: src/hooks.server.ts swaps the `<!-- meta -->` marker in src/app.html for OG tags on `/`
  (generic tagline + static/og.png, or that day's movie, poster and score when d/s are present).
  It only reads days already in rt_daily, never assigns one. localStorage keys keep the old `rt-game:` prefix on purpose
- Layout must never scroll: main is 100dvh, the poster shrinks to fit what the controls leave, and on tall screens poster + controls are centered together. Sizes use the --u unit (on main) so everything scales up with the window; write new sizes as calc(N * var(--u))
- TMDB poster URLs are rewritten /original/ -> /w500/

## Reveal animation (src/routes/+page.svelte, sounds in src/lib/sound.ts)
- After a guess the user's thumb stays put; an RT icon (static/icons) drops in at the guess and slides to the actual score, ticking per number, flipping fresh/rotten (popcorn/spilled) at 60%. Then points pop in, then the total counts up
- The gap bar between guess and actual is colored by the points it's worth (hue 120 green → 0 red, live during the glide);
  an "N too high" / "N too low" / "spot on!" label sits under its midpoint, and the row on the right shows only +points
- The whole reveal must stay under ~2s (glides capped at 550ms). Respect prefers-reduced-motion.
- Sounds are Web Audio blips (no files); unlock() must run inside the submit click

## Admin (/admin, src/routes/admin)
- Auth works like the owner's tutoring-app: fully client-side. Browser supabase-js client (src/lib/supabase.ts,
  anon key, session in localStorage), signInWithPassword on /admin/login, and admin/+layout.svelte
  (ssr = false) redirects via getSession() + onAuthStateChange. No @supabase/ssr; hooks.server.ts is only for link previews.
- Security is RLS: the auth users are shared across apps, so policies only let accounts in rt_admins
  read rt_movies / rt_daily, and rt_set_queue (security definer) checks rt_admins itself.
  Anon has no policies, so players can never read scores directly.
- Weekday checkboxes edit rt_settings.play_days (saved on change; admin-only RLS select/update policies)
- Shows assigned days (locked) and the upcoming queue with projected dates (one per play day, admin's local day)
- Reorder via ↑/↓, position input, sorts applied to the selected rows only (they keep their slots) or the whole queue
- Save sends the full ordered id list to rt_set_queue. Scores/gaps are hidden behind spoiler bars (the owner plays too)

## Env (.env locally, same names in Vercel project settings)
- PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

## Commands
- npm run dev | npm run check | npm run build | npm run import
- Run `npm run check` after changes; it should report 0 errors.
