-- Run this in the Supabase SQL editor. Safe to re-run.

create table if not exists rt_movies (
  imdb_id text primary key,
  title text not null,
  year integer,
  poster text,
  critic integer not null check (critic between 0 and 100),
  audience integer not null check (audience between 0 and 100),
  created_at timestamptz default now()
);

-- RLS on with no policies: only the service role (used server-side) can read,
-- so the real scores never reach the browser before a guess is submitted.
alter table rt_movies enable row level security;

-- Planned play order, edited on /admin. Lower plays sooner; null = not queued yet (see rt_queue_append).
alter table rt_movies add column if not exists queue_pos integer;

-- One movie per calendar day. Days are the player's local date, so the same date maps to the
-- same movie in every timezone. imdb_id is unique, so a movie can never be used twice.
create table if not exists rt_daily (
  day date primary key,
  imdb_id text not null unique references rt_movies (imdb_id),
  created_at timestamptz default now()
);

alter table rt_daily enable row level security;

-- Returns the movie for a day, taking the next unused movie in queue order the first time a day is asked for.
-- Returns null once every movie has been used.
create or replace function rt_movie_for_day(d date)
returns text
language plpgsql
as $$
declare
  id text;
begin
  for attempt in 1..5 loop
    select imdb_id into id from rt_daily where day = d;
    if id is not null then
      return id;
    end if;

    -- on conflict covers two requests racing for the same day or the same movie; just retry
    insert into rt_daily (day, imdb_id)
    select d, m.imdb_id
    from rt_movies m
    where not exists (select 1 from rt_daily x where x.imdb_id = m.imdb_id)
    order by m.queue_pos nulls last, random()
    limit 1
    on conflict do nothing;
  end loop;

  select imdb_id into id from rt_daily where day = d;
  return id;
end;
$$;

-- Server (service role) only, otherwise anyone could burn through future days via the public API
revoke execute on function rt_movie_for_day(date) from public, anon, authenticated;

-- Gives every unqueued movie a position after the current end of the queue, in random order.
-- Called here on setup and by `npm run import` for newly added movies.
create or replace function rt_queue_append()
returns void
language sql
as $$
  update rt_movies m
  set queue_pos = q.base + q.r
  from (
    select imdb_id,
      row_number() over (order by random()) as r,
      (select coalesce(max(queue_pos), 0) from rt_movies) as base
    from rt_movies
    where queue_pos is null
  ) q
  where m.imdb_id = q.imdb_id;
$$;

revoke execute on function rt_queue_append() from public, anon, authenticated;

select rt_queue_append();

-- Who can use /admin. The auth users are shared with other apps, so access is opt-in per account.
create table if not exists rt_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz default now()
);

alter table rt_admins enable row level security;

-- Change the email if you sign in with a different account; add more rows for more admins.
insert into rt_admins (user_id)
select id from auth.users where email = 'cody.eickmeyer@gmail.com'
on conflict do nothing;

-- /admin talks to Supabase straight from the browser (like tutoring-app), so these RLS policies
-- are what keep it locked down: only signed-in accounts listed in rt_admins can read the movies
-- and the schedule. Players never read these tables directly; the game's server uses the service role.
drop policy if exists rt_admins_self on rt_admins;
create policy rt_admins_self on rt_admins for select to authenticated
  using (user_id = auth.uid());

drop policy if exists rt_movies_admin_read on rt_movies;
create policy rt_movies_admin_read on rt_movies for select to authenticated
  using (exists (select 1 from rt_admins a where a.user_id = auth.uid()));

drop policy if exists rt_daily_admin_read on rt_daily;
create policy rt_daily_admin_read on rt_daily for select to authenticated
  using (exists (select 1 from rt_admins a where a.user_id = auth.uid()));

-- Saves the order from /admin: ids[1] gets position 1, and so on. Runs with owner rights,
-- so it checks for an admin itself before touching anything.
create or replace function rt_set_queue(ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from rt_admins where user_id = auth.uid()) then
    raise exception 'not an admin';
  end if;

  update rt_movies m
  set queue_pos = q.pos
  from unnest(ids) with ordinality as q(imdb_id, pos)
  where m.imdb_id = q.imdb_id;
end;
$$;

revoke execute on function rt_set_queue(text[]) from public, anon;
grant execute on function rt_set_queue(text[]) to authenticated;

-- Game settings (a single row). play_days are the weekdays a new movie comes out, 0 = Sunday … 6 = Saturday;
-- on other days the game keeps showing the most recent play day's movie. Edited on /admin.
create table if not exists rt_settings (
  id integer primary key default 1 check (id = 1),
  play_days smallint[] not null default '{0,1,2,3,4,5,6}'
    check (cardinality(play_days) > 0 and play_days <@ '{0,1,2,3,4,5,6}')
);

alter table rt_settings enable row level security;

insert into rt_settings (id) values (1) on conflict do nothing;

drop policy if exists rt_settings_admin_read on rt_settings;
create policy rt_settings_admin_read on rt_settings for select to authenticated
  using (exists (select 1 from rt_admins a where a.user_id = auth.uid()));

drop policy if exists rt_settings_admin_update on rt_settings;
create policy rt_settings_admin_update on rt_settings for update to authenticated
  using (exists (select 1 from rt_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from rt_admins a where a.user_id = auth.uid()));

-- Make the API (PostgREST) pick up new tables/functions right away instead of erroring with "not in the schema cache"
notify pgrst, 'reload schema';
