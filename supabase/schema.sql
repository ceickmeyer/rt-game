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

-- One movie per calendar day. Days are the player's local date, so the same date maps to the
-- same movie in every timezone. imdb_id is unique, so a movie can never be used twice.
create table if not exists rt_daily (
  day date primary key,
  imdb_id text not null unique references rt_movies (imdb_id),
  created_at timestamptz default now()
);

alter table rt_daily enable row level security;

-- Returns the movie for a day, picking an unused one at random the first time a day is asked for.
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
    order by random()
    limit 1
    on conflict do nothing;
  end loop;

  select imdb_id into id from rt_daily where day = d;
  return id;
end;
$$;

-- Server (service role) only, otherwise anyone could burn through future days via the public API
revoke execute on function rt_movie_for_day(date) from public, anon, authenticated;
