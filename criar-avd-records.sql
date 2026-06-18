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
  duplicate_key text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.avd_records
drop constraint if exists avd_records_duplicate_key_key;

alter table public.avd_records add column if not exists avaliacao text;
alter table public.avd_records add column if not exists unidade text;
alter table public.avd_records add column if not exists ano text;
alter table public.avd_records add column if not exists turma text;
alter table public.avd_records add column if not exists disciplina text;
alter table public.avd_records add column if not exists nome text;
alter table public.avd_records add column if not exists email text;
alter table public.avd_records add column if not exists nivel text;
alter table public.avd_records add column if not exists raca text;
alter table public.avd_records add column if not exists inclusao text;
alter table public.avd_records add column if not exists pontos numeric default 0;
alter table public.avd_records add column if not exists pontos_possiveis numeric default 0;
alter table public.avd_records add column if not exists percentual_acertos numeric default 0;
alter table public.avd_records add column if not exists q1 text;
alter table public.avd_records add column if not exists q2 text;
alter table public.avd_records add column if not exists q3 text;
alter table public.avd_records add column if not exists q4 text;
alter table public.avd_records add column if not exists q5 text;
alter table public.avd_records add column if not exists q6 text;
alter table public.avd_records add column if not exists q7 text;
alter table public.avd_records add column if not exists q8 text;
alter table public.avd_records add column if not exists q9 text;
alter table public.avd_records add column if not exists q10 text;
alter table public.avd_records add column if not exists q11 text;
alter table public.avd_records add column if not exists q12 text;
alter table public.avd_records add column if not exists q13 text;
alter table public.avd_records add column if not exists q14 text;
alter table public.avd_records add column if not exists q15 text;
alter table public.avd_records add column if not exists q16 text;
alter table public.avd_records add column if not exists q17 text;
alter table public.avd_records add column if not exists q18 text;
alter table public.avd_records add column if not exists q19 text;
alter table public.avd_records add column if not exists q20 text;
alter table public.avd_records add column if not exists pt_q1 numeric default 0;
alter table public.avd_records add column if not exists pt_q2 numeric default 0;
alter table public.avd_records add column if not exists pt_q3 numeric default 0;
alter table public.avd_records add column if not exists pt_q4 numeric default 0;
alter table public.avd_records add column if not exists pt_q5 numeric default 0;
alter table public.avd_records add column if not exists pt_q6 numeric default 0;
alter table public.avd_records add column if not exists pt_q7 numeric default 0;
alter table public.avd_records add column if not exists pt_q8 numeric default 0;
alter table public.avd_records add column if not exists pt_q9 numeric default 0;
alter table public.avd_records add column if not exists pt_q10 numeric default 0;
alter table public.avd_records add column if not exists pt_q11 numeric default 0;
alter table public.avd_records add column if not exists pt_q12 numeric default 0;
alter table public.avd_records add column if not exists pt_q13 numeric default 0;
alter table public.avd_records add column if not exists pt_q14 numeric default 0;
alter table public.avd_records add column if not exists pt_q15 numeric default 0;
alter table public.avd_records add column if not exists pt_q16 numeric default 0;
alter table public.avd_records add column if not exists pt_q17 numeric default 0;
alter table public.avd_records add column if not exists pt_q18 numeric default 0;
alter table public.avd_records add column if not exists pt_q19 numeric default 0;
alter table public.avd_records add column if not exists pt_q20 numeric default 0;

create index if not exists avd_records_importacao_idx
on public.avd_records (importacao_id);

create index if not exists avd_records_duplicate_key_idx
on public.avd_records (duplicate_key);

create index if not exists avd_records_filtros_idx
on public.avd_records (avaliacao, unidade, ano, turma, disciplina);

create index if not exists avd_records_nivel_idx
on public.avd_records (nivel);

create index if not exists avd_records_email_idx
on public.avd_records (email);

update public.avd_records
set
  avaliacao = coalesce(avaliacao, data->>'AVALIACAO'),
  unidade = coalesce(unidade, data->>'UNIDADE'),
  ano = coalesce(ano, data->>'ANO'),
  turma = coalesce(turma, data->>'TURMA'),
  disciplina = coalesce(disciplina, data->>'DISCIPLINA'),
  nome = coalesce(nome, data->>'NOME'),
  email = coalesce(email, data->>'EMAIL'),
  nivel = coalesce(nivel, data->>'NIVEL'),
  raca = coalesce(raca, data->>'RAÇA'),
  inclusao = coalesce(inclusao, data->>'INCLUSÃO'),
  pontos = case when replace(data->>'PONTOS', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PONTOS', ',', '.')::numeric else coalesce(pontos, 0) end,
  pontos_possiveis = case when replace(data->>'PONTOS POSSIVEIS', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PONTOS POSSIVEIS', ',', '.')::numeric else coalesce(pontos_possiveis, 0) end,
  percentual_acertos = case when replace(data->>'% ACERTOS', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'% ACERTOS', ',', '.')::numeric else coalesce(percentual_acertos, 0) end,
  q1 = coalesce(q1, data->>'Q1'), q2 = coalesce(q2, data->>'Q2'), q3 = coalesce(q3, data->>'Q3'), q4 = coalesce(q4, data->>'Q4'), q5 = coalesce(q5, data->>'Q5'),
  q6 = coalesce(q6, data->>'Q6'), q7 = coalesce(q7, data->>'Q7'), q8 = coalesce(q8, data->>'Q8'), q9 = coalesce(q9, data->>'Q9'), q10 = coalesce(q10, data->>'Q10'),
  q11 = coalesce(q11, data->>'Q11'), q12 = coalesce(q12, data->>'Q12'), q13 = coalesce(q13, data->>'Q13'), q14 = coalesce(q14, data->>'Q14'), q15 = coalesce(q15, data->>'Q15'),
  q16 = coalesce(q16, data->>'Q16'), q17 = coalesce(q17, data->>'Q17'), q18 = coalesce(q18, data->>'Q18'), q19 = coalesce(q19, data->>'Q19'), q20 = coalesce(q20, data->>'Q20'),
  pt_q1 = case when replace(data->>'PT_Q1', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q1', ',', '.')::numeric else coalesce(pt_q1, 0) end,
  pt_q2 = case when replace(data->>'PT_Q2', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q2', ',', '.')::numeric else coalesce(pt_q2, 0) end,
  pt_q3 = case when replace(data->>'PT_Q3', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q3', ',', '.')::numeric else coalesce(pt_q3, 0) end,
  pt_q4 = case when replace(data->>'PT_Q4', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q4', ',', '.')::numeric else coalesce(pt_q4, 0) end,
  pt_q5 = case when replace(data->>'PT_Q5', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q5', ',', '.')::numeric else coalesce(pt_q5, 0) end,
  pt_q6 = case when replace(data->>'PT_Q6', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q6', ',', '.')::numeric else coalesce(pt_q6, 0) end,
  pt_q7 = case when replace(data->>'PT_Q7', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q7', ',', '.')::numeric else coalesce(pt_q7, 0) end,
  pt_q8 = case when replace(data->>'PT_Q8', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q8', ',', '.')::numeric else coalesce(pt_q8, 0) end,
  pt_q9 = case when replace(data->>'PT_Q9', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q9', ',', '.')::numeric else coalesce(pt_q9, 0) end,
  pt_q10 = case when replace(data->>'PT_Q10', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q10', ',', '.')::numeric else coalesce(pt_q10, 0) end,
  pt_q11 = case when replace(data->>'PT_Q11', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q11', ',', '.')::numeric else coalesce(pt_q11, 0) end,
  pt_q12 = case when replace(data->>'PT_Q12', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q12', ',', '.')::numeric else coalesce(pt_q12, 0) end,
  pt_q13 = case when replace(data->>'PT_Q13', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q13', ',', '.')::numeric else coalesce(pt_q13, 0) end,
  pt_q14 = case when replace(data->>'PT_Q14', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q14', ',', '.')::numeric else coalesce(pt_q14, 0) end,
  pt_q15 = case when replace(data->>'PT_Q15', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q15', ',', '.')::numeric else coalesce(pt_q15, 0) end,
  pt_q16 = case when replace(data->>'PT_Q16', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q16', ',', '.')::numeric else coalesce(pt_q16, 0) end,
  pt_q17 = case when replace(data->>'PT_Q17', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q17', ',', '.')::numeric else coalesce(pt_q17, 0) end,
  pt_q18 = case when replace(data->>'PT_Q18', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q18', ',', '.')::numeric else coalesce(pt_q18, 0) end,
  pt_q19 = case when replace(data->>'PT_Q19', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q19', ',', '.')::numeric else coalesce(pt_q19, 0) end,
  pt_q20 = case when replace(data->>'PT_Q20', ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(data->>'PT_Q20', ',', '.')::numeric else coalesce(pt_q20, 0) end
where data is not null;

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
