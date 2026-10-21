-- Sphere leaderboard: seasons, players and throws.
--
-- Run this once in the Supabase SQL editor. It is safe to run again: it drops and
-- recreates the functions and views, and only creates tables that don't exist yet.
--
-- How it works
-- - A season ends when all players together reach `throw_target` counted throws,
--   or when `ends_at` passes, whichever comes first. The next throw starts a new season.
-- - Each player counts toward the target for at most `per_player_cap` throws per season,
--   so one player can't end a season early. Throws past the cap still count for their rating.
-- - Rating = Wilson lower bound (90% confidence) of the share of throws with at least one
--   Perfect corner. It rewards accuracy, and gives more weight the more throws back it up.
-- - The browser can only read. All writes go through submit_throw(), which runs on the
--   server, checks the throw is plausible and limits how often a player can submit.

-- ---------- tables ----------

create table if not exists public.seasons (
  id             bigint generated always as identity primary key,
  number         int not null unique,
  started_at     timestamptz not null default now(),
  ends_at        timestamptz not null default now() + interval '30 days',
  ended_at       timestamptz,
  throw_target   int not null default 5000 check (throw_target > 0),
  per_player_cap int not null default 500 check (per_player_cap > 0),
  counted_throws int not null default 0
);

create table if not exists public.players (
  user_id    uuid primary key references auth.users on delete cascade,
  username   text not null,
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.throws (
  id         bigint generated always as identity primary key,
  season_id  bigint not null references public.seasons on delete cascade,
  user_id    uuid not null references public.players on delete cascade,
  created_at timestamptz not null default now(),
  resistance real not null,
  held_ms    int not null,
  corners    smallint not null,
  perfects   smallint not null,
  best_miss  real   -- closest corner miss in this throw, in sphere radii (null = no corner)
);
create index if not exists throws_user_created on public.throws (user_id, created_at desc);

create table if not exists public.season_stats (
  season_id      bigint not null references public.seasons on delete cascade,
  user_id        uuid not null references public.players on delete cascade,
  throws         int not null default 0,
  perfect_throws int not null default 0,
  perfects       int not null default 0,
  counted        int not null default 0,   -- throws that counted toward the season target
  last_throw_at  timestamptz,
  primary key (season_id, user_id)
);

-- The first season.
insert into public.seasons (number) select 1 where not exists (select 1 from public.seasons);

-- ---------- access rules ----------
-- Everyone can read seasons, players and stats. Nobody can write directly;
-- raw throws are not readable at all.

alter table public.seasons      enable row level security;
alter table public.players      enable row level security;
alter table public.throws       enable row level security;
alter table public.season_stats enable row level security;

drop policy if exists "read seasons" on public.seasons;
create policy "read seasons" on public.seasons for select using (true);
drop policy if exists "read players" on public.players;
create policy "read players" on public.players for select using (true);
drop policy if exists "read stats" on public.season_stats;
create policy "read stats" on public.season_stats for select using (true);

grant select on public.seasons, public.players, public.season_stats to anon, authenticated;
revoke insert, update, delete, truncate on public.seasons, public.players, public.season_stats from anon, authenticated;
revoke all on public.throws from anon, authenticated;

-- ---------- rating ----------

create or replace function public.wilson_lower(k int, n int)
returns double precision language sql immutable as $$
  select case when n <= 0 then 0 else
    ((k::float8 / n) + 1.645 ^ 2 / (2 * n)
      - 1.645 * sqrt((k::float8 / n) * (1 - k::float8 / n) / n + 1.645 ^ 2 / (4 * n::float8 * n)))
    / (1 + 1.645 ^ 2 / n)
  end
$$;

-- ---------- views ----------

drop view if exists public.season_winners;
drop view if exists public.leaderboard;
create view public.leaderboard with (security_invoker = true) as
  select st.season_id, st.user_id, p.username, p.avatar_url,
         st.throws, st.perfect_throws, st.perfects,
         public.wilson_lower(st.perfect_throws, st.throws) as rating
  from public.season_stats st
  join public.players p using (user_id);

create view public.season_winners with (security_invoker = true) as
  select * from (
    select s.number as season_number, s.ended_at, l.username, l.avatar_url,
           l.rating, l.throws, l.perfect_throws,
           row_number() over (partition by s.id order by l.rating desc, l.perfects desc, l.throws desc) as place
    from public.seasons s
    join public.leaderboard l on l.season_id = s.id
    where s.ended_at is not null
  ) ranked
  where place <= 3;

grant select on public.leaderboard, public.season_winners to anon, authenticated;

-- ---------- submitting a throw ----------

drop function if exists public.submit_throw(real, int, int, int, real);
create function public.submit_throw(p_resistance real, p_held_ms int, p_corners int, p_perfects int, p_best_miss real)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  ident     jsonb;
  s         public.seasons;
  st        public.season_stats;
  min_held  int;
  counts    boolean;
begin
  if uid is null then
    raise exception 'Sign in with GitHub first' using errcode = '28000';
  end if;

  -- Plausibility. These match the game's rules, with some slack.
  if p_resistance is null or p_resistance < 0 or p_resistance > 1 then
    raise exception 'Implausible throw: resistance' using errcode = '22023';
  end if;
  -- the grip yields at (2.2 - 1.7 × resistance) strain per second, and breaks at 1
  min_held := floor(850 / (2.2 - 1.7 * p_resistance));
  if p_held_ms is null or p_held_ms < min_held or p_held_ms > 600000 then
    raise exception 'Implausible throw: pulled too fast' using errcode = '22023';
  end if;
  if p_corners is null or p_perfects is null or p_corners < 0 or p_corners > 12 or p_perfects < 0 or p_perfects > p_corners then
    raise exception 'Implausible throw: corners' using errcode = '22023';
  end if;
  if (p_corners > 0) <> (p_best_miss is not null) or p_best_miss < 0 or (p_perfects > 0 and p_best_miss > 0.2) then
    raise exception 'Implausible throw: corner distance' using errcode = '22023';
  end if;

  -- Name and avatar come from the GitHub identity, which players can't edit themselves.
  select identity_data into ident
  from auth.identities where user_id = uid and provider = 'github'
  order by created_at limit 1;
  if ident is null then
    raise exception 'Sign in with GitHub first' using errcode = '28000';
  end if;
  insert into public.players (user_id, username, avatar_url, updated_at)
  values (uid, coalesce(ident->>'user_name', ident->>'preferred_username', 'player'), ident->>'avatar_url', now())
  on conflict (user_id) do update
    set username = excluded.username, avatar_url = excluded.avatar_url, updated_at = now();

  -- Current season; locked so only one throw at a time can close it.
  select * into s from public.seasons where ended_at is null order by number desc limit 1 for update;
  if not found or now() >= s.ends_at or s.counted_throws >= s.throw_target then
    if found then
      update public.seasons set ended_at = now() where id = s.id;
    end if;
    insert into public.seasons (number, throw_target, per_player_cap)
    values (coalesce(s.number, 0) + 1, coalesce(s.throw_target, 5000), coalesce(s.per_player_cap, 500))
    returning * into s;
  end if;

  -- One throw takes at least ~3 seconds to play (pull, flight, respawn).
  select * into st from public.season_stats where season_id = s.id and user_id = uid for update;
  if exists (select 1 from public.throws t where t.user_id = uid and t.created_at > now() - interval '2.5 seconds') then
    raise exception 'Too many throws, slow down' using errcode = '54000';
  end if;

  insert into public.throws (season_id, user_id, resistance, held_ms, corners, perfects, best_miss)
  values (s.id, uid, p_resistance, p_held_ms, p_corners, p_perfects, p_best_miss);

  counts := coalesce(st.counted, 0) < s.per_player_cap;
  insert into public.season_stats as ss (season_id, user_id, throws, perfect_throws, perfects, counted, last_throw_at)
  values (s.id, uid, 1, (p_perfects > 0)::int, p_perfects, counts::int, now())
  on conflict (season_id, user_id) do update
    set throws = ss.throws + 1,
        perfect_throws = ss.perfect_throws + (p_perfects > 0)::int,
        perfects = ss.perfects + p_perfects,
        counted = ss.counted + counts::int,
        last_throw_at = now()
  returning * into st;

  if counts then
    update public.seasons set counted_throws = counted_throws + 1 where id = s.id returning * into s;
  end if;

  return json_build_object(
    'season', s.number,
    'counted_throws', s.counted_throws,
    'throw_target', s.throw_target,
    'throws', st.throws,
    'perfect_throws', st.perfect_throws,
    'rating', public.wilson_lower(st.perfect_throws, st.throws)
  );
end
$$;

revoke all on function public.submit_throw(real, int, int, int, real) from public, anon;
grant execute on function public.submit_throw(real, int, int, int, real) to authenticated;
