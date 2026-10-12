import type { Entry } from './model';
import { contactGender } from './name-estimate';
import { remoteEnabled, supabase } from './remote-store';

/* ---------------- Telefones (mesma regra do servidor em api/_lib/wa.js) ---------------- */
export function canonicalPhone(value: string) {
  const raw = String(value || '').trim();
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return '';
  let digits = raw.replace(/\D/g, '').replace(/^00/, '');
  if (!raw.startsWith('+') && (digits.length === 10 || digits.length === 11)) digits = '55' + digits;
  if (digits.startsWith('55') && digits.length === 12 && /[6-9]/.test(digits[4])) digits = digits.slice(0, 4) + '9' + digits.slice(4);
  if (digits.startsWith('55') && !(digits.length === 12 || digits.length === 13)) return '';
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : '';
}
export function contactPhone(data: Record<string, string>) {
  return [data.phone, ...String(data.altPhones || '').split(/[;,|\n]/)].map(canonicalPhone).find(Boolean) || '';
}
export function prettyPhone(p: string) {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(p);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : '+' + p;
}
export const firstName = (name: string) => {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first ? first[0].toLocaleUpperCase('pt-BR') + first.slice(1).toLocaleLowerCase('pt-BR') : '';
};

/* ---------------- Público do disparo ---------------- */
export type AudienceFilters = { states: string[]; noState: boolean; genders: string[]; consentOnly: boolean; excludeDays: number };
export type Recipient = { id: string; name: string; phone: string; state: string; city: string; gender: string };
export type Excluded = { semTelefone: number; foraDoFiltro: number; semAutorizacao: number; sairam: number; recentes: number; repetidos: number };

export function recentSet(lastSent: Map<string, string>, days: number) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return new Set([...lastSent].filter(([, at]) => at >= since).map(([p]) => p));
}
export function buildAudience(entries: Entry[], f: AudienceFilters, consents: Map<string, string>, recentPhones: Set<string>) {
  const excluded: Excluded = { semTelefone: 0, foraDoFiltro: 0, semAutorizacao: 0, sairam: 0, recentes: 0, repetidos: 0 };
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  const contacts = entries.filter(e => e.kind === 'contact' && e.data.status === 'Ativo');
  for (const e of contacts) {
    const state = e.data.state || '';
    const inState = state ? f.states.includes(state) : f.noState;
    const gender = contactGender(e.data).label;
    if (!inState || (f.genders.length && !f.genders.includes(gender))) { excluded.foraDoFiltro++; continue; }
    const phone = contactPhone(e.data);
    if (!phone) { excluded.semTelefone++; continue; }
    if (consents.get(phone) === 'saiu') { excluded.sairam++; continue; }
    if (f.consentOnly && consents.get(phone) !== 'autorizou' && !/whatsapp:\s*autorizou/i.test(e.data.consent || '')) { excluded.semAutorizacao++; continue; }
    if (f.excludeDays > 0 && recentPhones.has(phone)) { excluded.recentes++; continue; }
    if (seen.has(phone)) { excluded.repetidos++; continue; }
    seen.add(phone);
    recipients.push({ id: e.id, name: e.data.name, phone, state, city: e.data.city || '', gender });
  }
  recipients.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name, 'pt-BR'));
  return { recipients, excluded };
}

/** Regiões do Brasil: atalho para juntar vários estados de uma vez. */
export const REGIONS: [string, string[]][] = [
  ['Sudeste', ['ES', 'MG', 'RJ', 'SP']],
  ['Sul', ['PR', 'RS', 'SC']],
  ['Centro-Oeste', ['DF', 'GO', 'MT', 'MS']],
  ['Nordeste', ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']],
  ['Norte', ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO']],
];
export const UF_NAME: Record<string, string> = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };

/** Contagem de contatos ativos com WhatsApp válido por UF (para os botões de estado). */
export function phonesByState(entries: Entry[]) {
  const counts = new Map<string, number>();
  for (const e of entries) if (e.kind === 'contact' && e.data.status === 'Ativo' && contactPhone(e.data)) counts.set(e.data.state || '', (counts.get(e.data.state || '') || 0) + 1);
  return counts;
}

/* ---------------- Modelos (templates) ---------------- */
export type Template = {
  name: string; language: string; status: string; category: string; named: boolean;
  header: { format: string; text: string; vars: string[] } | null;
  body: string; bodyVars: string[]; footer: string;
  buttons: { index: number; type: string; text: string; url: string; dynamic: boolean }[];
};
export type VarSource = 'first_name' | 'full_name' | 'city' | 'state' | 'fixed';
export type VarMap = { key: string; source: VarSource; value: string };
export type Params = { named: boolean; header: { format: string; var?: VarMap; link?: string }; body: VarMap[]; buttons: { index: number; value: string }[] };
export const SOURCE_LABEL: Record<VarSource, string> = { first_name: 'Primeiro nome do cliente', full_name: 'Nome completo', city: 'Cidade', state: 'Estado (UF)', fixed: 'Texto fixo' };

export function defaultParams(t: Template): Params {
  const guess = (key: string, i: number): VarMap => ({ key, source: i === 0 || /nome|name/i.test(key) ? 'first_name' : 'fixed', value: '' });
  return {
    named: t.named,
    header: { format: t.header?.format || '', ...(t.header?.format === 'TEXT' && t.header.vars[0] ? { var: { key: t.header.vars[0], source: 'fixed' as VarSource, value: '' } } : {}), link: '' },
    body: t.bodyVars.map(guess),
    buttons: t.buttons.filter(b => b.dynamic).map(b => ({ index: b.index, value: '' })),
  };
}
export function fillValue(v: VarMap, r: { name: string; city: string; state: string }) {
  switch (v.source) {
    case 'first_name': return firstName(r.name) || 'cliente';
    case 'full_name': return r.name || 'cliente';
    case 'city': return (r.city || '').split(',')[0].trim() || 'sua cidade';
    case 'state': return r.state || 'seu estado';
    default: return v.value.trim() || '…';
  }
}
export function renderText(text: string, vars: VarMap[], r: { name: string; city: string; state: string }) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => { const v = vars.find(x => x.key === key); return v ? fillValue(v, r) : `{{${key}}}`; });
}
export function paramsProblem(t: Template, p: Params) {
  if (p.body.some(v => v.source === 'fixed' && !v.value.trim())) return 'Preencha o texto fixo de todas as variáveis.';
  if (p.header.var && p.header.var.source === 'fixed' && !p.header.var.value.trim()) return 'Preencha a variável do título.';
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t.header?.format || '') && !/^https:\/\/\S+$/.test(p.header.link || '')) return 'Cole o link (https) da imagem, vídeo ou documento do cabeçalho.';
  if (p.buttons.some(b => !b.value.trim())) return 'Preencha o final do link do botão.';
  return '';
}

/* ---------------- Chamadas ao servidor ---------------- */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!remoteEnabled()) throw new Error('Os disparos funcionam só com o banco (Supabase) ligado.');
  const { data } = await supabase().auth.getSession();
  const res = await fetch('/api/whatsapp/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${data.session?.access_token || ''}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  // Sem a versão nova publicada, a Vercel devolve a página do CRM (HTML) no lugar da função.
  const out: (T & { error?: string }) | null = /json/i.test(res.headers.get('content-type') || '') ? await res.json().then(v => v as T & { error?: string }, () => null) : null;
  if (!out) throw new Error(res.ok || res.status === 404 ? 'Função do servidor não encontrada. Publique a versão nova do CRM na Vercel.' : 'Resposta inválida do servidor.');
  if (!res.ok) throw Object.assign(new Error(out.error || 'Falha no servidor.'), { data: out });
  return out;
}

export type Campaign = { id: string; name: string; template_name: string; template_language: string; status: string; pause_reason: string | null; created_by: string | null; created_at: string; started_at: string | null; finished_at: string | null; filters: Record<string, unknown> };
export type Stats = { campaign_id: string; total: number; fila: number; enviadas: number; entregues: number; lidas: number; falhas: number; puladas: number };
export type Message = { id: string; direction: 'in' | 'out'; phone: string; name: string | null; body: string; kind: string; created_at: string; read_by_crm: boolean; campaign_id: string | null; status: string | null };
export type RecipientRow = { id: string; name: string; phone: string; state: string | null; status: string; error: string | null; sent_at: string | null };

function check<T>(r: { data: T | null; error: { message: string } | null }) { if (r.error) throw new Error(r.error.message); return (r.data ?? []) as T; }

export async function loadWhatsapp() {
  const sb = supabase();
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const [campaigns, stats, consents, messages, recent] = await Promise.all([
    sb.from('wa_campaigns').select('*').order('created_at', { ascending: false }).limit(100),
    sb.from('wa_campaign_stats').select('*'),
    sb.from('wa_consents').select('phone,status'),
    sb.from('wa_messages').select('*').order('created_at', { ascending: false }).limit(1000),
    sb.from('wa_recipients').select('phone,sent_at').in('status', ['enviada', 'entregue', 'lida']).gte('sent_at', since).limit(10000),
  ]);
  return {
    campaigns: check(campaigns) as Campaign[],
    stats: new Map((check(stats) as Stats[]).map(s => [s.campaign_id, s])),
    consents: new Map((check(consents) as { phone: string; status: string }[]).map(c => [c.phone, c.status])),
    messages: check(messages) as Message[],
    lastSent: (check(recent) as { phone: string; sent_at: string }[]).reduce((m, r) => (r.sent_at > (m.get(r.phone) || '') ? m.set(r.phone, r.sent_at) : m), new Map<string, string>()),
  };
}
export async function loadRecipients(campaignId: string) {
  const out: RecipientRow[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await supabase().from('wa_recipients').select('id,name,phone,state,status,error,sent_at').eq('campaign_id', campaignId).order('name').range(from, from + 999);
    const rows = check(r) as RecipientRow[]; out.push(...rows); if (rows.length < 1000) break;
  }
  return out;
}

export const STATUS_LABEL: Record<string, string> = { pronta: 'Pronta', enviando: 'Enviando', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada', fila: 'Na fila', enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida', falhou: 'Falhou', pulada: 'Não enviada' };
/** Preço de referência por mensagem de marketing no Brasil (conferir a tabela da Meta). */
export const PRICE_MARKETING_BRL = 0.35;
