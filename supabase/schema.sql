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

-- Saves the order from /admin: ids[1] gets position 1, and so on.
create or replace function rt_set_queue(ids text[])
returns void
language sql
as $$
  update rt_movies m
  set queue_pos = q.pos
  from unnest(ids) with ordinality as q(imdb_id, pos)
  where m.imdb_id = q.imdb_id;
$$;

revoke execute on function rt_queue_append() from public, anon, authenticated;
revoke execute on function rt_set_queue(text[]) from public, anon, authenticated;

select rt_queue_append();
