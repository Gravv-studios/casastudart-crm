-- CRM do Hugo (Casa Studart) — disparos pela API oficial do WhatsApp
-- Rodar no SQL Editor DEPOIS do schema.sql. Pode rodar de novo sem quebrar (idempotente).
-- Leitura: membros do CRM (RLS). Gravação: só o servidor (funções da Vercel com a chave service_role).

-- Campanhas (cada disparo)
create table if not exists public.wa_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_name text not null,
  template_language text not null,
  template_category text,
  params jsonb not null default '{}'::jsonb,      -- como preencher as variáveis do modelo
  filters jsonb not null default '{}'::jsonb,     -- estados, gênero etc. (só para registro)
  status text not null default 'pronta' check (status in ('pronta','enviando','pausada','concluida','cancelada')),
  pause_reason text,
  created_by text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists wa_campaigns_created on public.wa_campaigns (created_at desc);

-- Destinatários de cada campanha (uma linha por telefone)
create table if not exists public.wa_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.wa_campaigns(id) on delete cascade,
  contact_id text,
  name text not null default '',
  phone text not null check (phone ~ '^[1-9][0-9]{9,14}$'),
  state text,
  city text,
  status text not null default 'fila' check (status in ('fila','enviando','enviada','entregue','lida','falhou','pulada')),
  wamid text unique,
  error text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (campaign_id, phone)
);
create index if not exists wa_recipients_campaign_status on public.wa_recipients (campaign_id, status);
create index if not exists wa_recipients_phone_sent on public.wa_recipients (phone, sent_at desc);

-- Autorização / descadastro por telefone (SAIR, PARAR, botão "Não quero receber"...)
create table if not exists public.wa_consents (
  phone text primary key check (phone ~ '^[1-9][0-9]{9,14}$'),
  status text not null check (status in ('autorizou','saiu')),
  source text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Mensagens recebidas (respostas dos clientes) e respostas enviadas pelo CRM
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in','out')),
  phone text not null,
  name text,
  body text not null default '',
  kind text not null default 'text',
  wamid text unique,
  campaign_id uuid references public.wa_campaigns(id) on delete set null,
  status text,
  read_by_crm boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_phone_created on public.wa_messages (phone, created_at desc);
create index if not exists wa_messages_created on public.wa_messages (created_at desc);

-- Resumo por campanha (respeita a RLS de quem consulta)
create or replace view public.wa_campaign_stats with (security_invoker = true) as
  select campaign_id,
    count(*)::int as total,
    count(*) filter (where status = 'fila')::int as fila,
    count(*) filter (where status in ('enviada','entregue','lida'))::int as enviadas,
    count(*) filter (where status in ('entregue','lida'))::int as entregues,
    count(*) filter (where status = 'lida')::int as lidas,
    count(*) filter (where status = 'falhou')::int as falhas,
    count(*) filter (where status = 'pulada')::int as puladas
  from public.wa_recipients group by campaign_id;

alter table public.wa_campaigns enable row level security;
alter table public.wa_recipients enable row level security;
alter table public.wa_consents enable row level security;
alter table public.wa_messages enable row level security;

drop policy if exists "membros leem campanhas" on public.wa_campaigns;
create policy "membros leem campanhas" on public.wa_campaigns for select to authenticated using (public.crm_is_member());
drop policy if exists "membros leem destinatarios" on public.wa_recipients;
create policy "membros leem destinatarios" on public.wa_recipients for select to authenticated using (public.crm_is_member());
drop policy if exists "membros leem autorizacoes" on public.wa_consents;
create policy "membros leem autorizacoes" on public.wa_consents for select to authenticated using (public.crm_is_member());
drop policy if exists "membros leem mensagens" on public.wa_messages;
create policy "membros leem mensagens" on public.wa_messages for select to authenticated using (public.crm_is_member());

revoke all on public.wa_campaigns, public.wa_recipients, public.wa_consents, public.wa_messages, public.wa_campaign_stats from anon;
revoke insert, update, delete on public.wa_campaigns, public.wa_recipients, public.wa_consents, public.wa_messages from authenticated;
grant select on public.wa_campaigns, public.wa_recipients, public.wa_consents, public.wa_messages, public.wa_campaign_stats to authenticated;
-- Toda gravação passa pelas funções /api/whatsapp/* da Vercel (chave service_role só no servidor).
