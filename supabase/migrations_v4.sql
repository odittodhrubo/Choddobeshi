-- Choddobeshi schema v4: words and questions live in the database.
-- Run AFTER schema.sql, migrations_v2.sql and migrations_v3.sql.
-- Then load your existing content once with:  npm run seed

-- ------------------------------------------------------------------ packs
create table if not exists public.word_packs (
  id text primary key,                 -- e.g. 'en-food'
  name text not null,                  -- shown in the lobby
  language text not null default 'en',
  sort integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Holding pack for AI-generated suggestions. Inactive, so it is never played.
insert into public.word_packs (id, name, sort, active)
values ('ai-suggested', 'AI suggestions', 999, false)
on conflict (id) do nothing;

-- ------------------------------------------------------------- word pairs
create table if not exists public.word_pairs (
  id bigint generated always as identity primary key,
  pack_id text not null references public.word_packs (id) on delete cascade,
  civilian text not null,
  doppelganger text not null,
  aliases text[] not null default '{}',
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  active boolean not null default true,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'curated' check (source in ('curated', 'player', 'ai')),
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (pack_id, civilian, doppelganger),
  check (length(civilian) between 1 and 40),
  check (length(doppelganger) between 1 and 40)
);
create index if not exists word_pairs_play_idx on public.word_pairs (pack_id) where active and status = 'approved';
create index if not exists word_pairs_pending_idx on public.word_pairs (created_at) where status = 'pending';

-- --------------------------------------------------------- question pairs
create table if not exists public.question_pairs (
  id bigint generated always as identity primary key,
  civilian text not null,
  imposter text not null,
  active boolean not null default true,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'curated' check (source in ('curated', 'player', 'ai')),
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (civilian, imposter),
  check (length(civilian) between 3 and 100),
  check (length(imposter) between 3 and 100)
);
create index if not exists question_pairs_pending_idx on public.question_pairs (created_at) where status = 'pending';

-- ------------------------------------------------------------------ access
-- Content is server-only: the game server reads and writes with the secret key.
-- No policies, so the browser (publishable key) cannot read the answer lists.
alter table public.word_packs enable row level security;
alter table public.word_pairs enable row level security;
alter table public.question_pairs enable row level security;

-- ------------------------------------------------------ reviewing content
-- Approve a player/AI suggestion in Table Editor: open word_pairs, filter
-- status = pending, set pack_id to a real pack, set status = approved.
-- To retire a pair without deleting it, set active = false.
-- Changes go live within 5 minutes (the server refreshes on a timer).
