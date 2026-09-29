-- CRM do Hugo (Casa Studart) — banco no Supabase
-- Rodar uma vez no SQL Editor do projeto do Hugo. Pode rodar de novo sem quebrar (idempotente).
-- Acesso: só usuários logados cujo e-mail está em crm_members. Cadastro público desligado no painel (Auth > Sign In / Up).

create extension if not exists pgcrypto;

create table if not exists public.crm_members (
  email text primary key check (email = lower(email)),
  name text,
  role text not null default 'admin' check (role in ('admin','equipe')),
  created_at timestamptz not null default now()
);

create table if not exists public.crm_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('contact','ticket','task','note','campaign','site','expense','income')),
  data jsonb not null default '{}'::jsonb,
  email_key text generated always as (case when kind = 'contact' then lower(data->>'email') end) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create unique index if not exists crm_entries_contact_email on public.crm_entries (email_key);
create index if not exists crm_entries_kind on public.crm_entries (kind);

create table if not exists public.crm_activity (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  action text not null,
  label text not null default '',
  user_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index if not exists crm_activity_created on public.crm_activity (created_at desc);

-- updated_at sempre do servidor (controle de edição simultânea)
create or replace function public.crm_touch() returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists crm_entries_touch on public.crm_entries;
create trigger crm_entries_touch before update on public.crm_entries for each row execute function public.crm_touch();

-- quem pode usar o CRM
create or replace function public.crm_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_members where email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.crm_is_member() from public;
grant execute on function public.crm_is_member() to authenticated;

alter table public.crm_members enable row level security;
alter table public.crm_entries enable row level security;
alter table public.crm_activity enable row level security;

drop policy if exists "membro ve o proprio cadastro" on public.crm_members;
create policy "membro ve o proprio cadastro" on public.crm_members for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "membros usam registros" on public.crm_entries;
create policy "membros usam registros" on public.crm_entries for all to authenticated
  using (public.crm_is_member()) with check (public.crm_is_member());

drop policy if exists "membros leem historico" on public.crm_activity;
create policy "membros leem historico" on public.crm_activity for select to authenticated using (public.crm_is_member());
drop policy if exists "membros gravam historico" on public.crm_activity;
create policy "membros gravam historico" on public.crm_activity for insert to authenticated with check (public.crm_is_member());
-- histórico não se edita nem se apaga pelo app

revoke all on public.crm_members, public.crm_entries, public.crm_activity from anon;
grant select on public.crm_members to authenticated;
grant select, insert, update, delete on public.crm_entries to authenticated;
grant select, insert on public.crm_activity to authenticated;

-- Depois de criar os usuários em Authentication > Users, libere cada e-mail:
-- insert into public.crm_members (email, name) values ('email-do-hugo@exemplo.com', 'Hugo') on conflict do nothing;
-- insert into public.crm_members (email, name) values ('maxsfigueiredo@gmail.com', 'Marcos (GRAVV)') on conflict do nothing;
