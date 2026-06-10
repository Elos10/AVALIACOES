create table if not exists public.avd_app_state (
  id text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.avd_app_state enable row level security;

drop policy if exists "AVD leitura publica" on public.avd_app_state;
drop policy if exists "AVD insercao publica" on public.avd_app_state;
drop policy if exists "AVD atualizacao publica" on public.avd_app_state;
drop policy if exists "AVD exclusao publica" on public.avd_app_state;

grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.avd_app_state to anon;
grant select, insert, update, delete on table public.avd_app_state to authenticated;

create policy "AVD leitura publica"
on public.avd_app_state
for select
to anon, authenticated
using (id = 'db');

create policy "AVD insercao publica"
on public.avd_app_state
for insert
to anon, authenticated
with check (id = 'db');

create policy "AVD atualizacao publica"
on public.avd_app_state
for update
to anon, authenticated
using (id = 'db')
with check (id = 'db');

create policy "AVD exclusao publica"
on public.avd_app_state
for delete
to anon, authenticated
using (id = 'db');

insert into public.avd_app_state (id, value)
values ('db', '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists public.avd_records (
  id text primary key,
  importacao_id text,
  duplicate_key text unique,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists avd_records_importacao_idx
on public.avd_records (importacao_id);

create index if not exists avd_records_duplicate_key_idx
on public.avd_records (duplicate_key);

alter table public.avd_records enable row level security;

drop policy if exists "AVD registros leitura publica" on public.avd_records;
drop policy if exists "AVD registros insercao publica" on public.avd_records;
drop policy if exists "AVD registros atualizacao publica" on public.avd_records;
drop policy if exists "AVD registros exclusao publica" on public.avd_records;

grant select, insert, update, delete on table public.avd_records to anon;
grant select, insert, update, delete on table public.avd_records to authenticated;

create policy "AVD registros leitura publica"
on public.avd_records
for select
to anon, authenticated
using (true);

create policy "AVD registros insercao publica"
on public.avd_records
for insert
to anon, authenticated
with check (true);

create policy "AVD registros atualizacao publica"
on public.avd_records
for update
to anon, authenticated
using (true)
with check (true);

create policy "AVD registros exclusao publica"
on public.avd_records
for delete
to anon, authenticated
using (true);
