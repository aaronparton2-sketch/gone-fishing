-- DAVO'S BOARD - schema
-- RLS is ON with NO policies on every table. That means the anon key can do
-- nothing at all; the only way in is the service role, which lives exclusively
-- in the serverless functions. Same shape as the task board.

create table if not exists gf_groups (
  code        text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists gf_anglers (
  id             uuid primary key default gen_random_uuid(),
  group_code     text not null references gf_groups(code) on delete cascade,
  name           text not null,
  photo          text,                       -- data URL, downscaled client-side, capped server-side
  favourite_fish text,
  ip_hash        text,                       -- sha256, never the raw IP
  created_at     timestamptz not null default now()
);
create index if not exists gf_anglers_group_idx on gf_anglers (group_code);
create unique index if not exists gf_anglers_group_name_idx
  on gf_anglers (group_code, lower(name));

create table if not exists gf_catches (
  id         uuid primary key default gen_random_uuid(),
  angler_id  uuid not null references gf_anglers(id) on delete cascade,
  species    text not null,
  length_cm  numeric,
  points     integer not null default 0,
  photo      text,
  caught_at  timestamptz not null default now()
);
create index if not exists gf_catches_angler_idx on gf_catches (angler_id);
create index if not exists gf_catches_time_idx   on gf_catches (caught_at desc);

alter table gf_groups  enable row level security;
alter table gf_anglers enable row level security;
alter table gf_catches enable row level security;

insert into gf_groups (code, name) values ('BOYS', 'The Boys')
  on conflict (code) do nothing;
