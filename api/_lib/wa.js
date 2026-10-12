// Código compartilhado das funções /api/whatsapp/* (roda só no servidor da Vercel).
// Pastas/arquivos começando com "_" não viram rota na Vercel.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const env = (name) => (process.env[name] || '').trim();
const GRAPH = () => `https://graph.facebook.com/${env('WHATSAPP_API_VERSION') || 'v23.0'}`;
const SB_URL = () => (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, '');
const SB_KEY = () => env('SUPABASE_SERVICE_ROLE_KEY');

export const REQUIRED = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_WABA_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY'];
export function missingEnv() {
  const missing = REQUIRED.filter((name) => !env(name));
  if (!SB_URL()) missing.push('VITE_SUPABASE_URL');
  return missing;
}

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export function handle(fn) {
  return async (request) => {
    try { return await fn(request); } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
      console.error('[whatsapp]', e);
      return json({ error: 'Erro inesperado no servidor. Tente de novo em instantes.' }, 500);
    }
  };
}
export async function readJson(request) {
  try { const body = await request.json(); if (body && typeof body === 'object') return body; } catch { /* corpo inválido */ }
  throw new HttpError(400, 'Requisição inválida.');
}

/* ---------------- Supabase (chave service_role, só no servidor) ---------------- */
export async function sb(path, { method = 'GET', body, prefer } = {}) {
  if (!SB_URL() || !SB_KEY()) throw new HttpError(503, 'Banco não configurado no servidor (SUPABASE_SERVICE_ROLE_KEY).');
  const res = await fetch(`${SB_URL()}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY(), authorization: `Bearer ${SB_KEY()}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) { console.error('[supabase]', res.status, text); throw new HttpError(502, 'O banco recusou a operação.'); }
  return data;
}
export const inList = (values) => `(${values.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')})`;

/** Confere o login do Supabase e se o e-mail está liberado em crm_members. */
export async function requireMember(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Faça login no CRM.');
  if (!SB_URL() || !SB_KEY()) throw new HttpError(503, 'Banco não configurado no servidor (SUPABASE_SERVICE_ROLE_KEY).');
  const res = await fetch(`${SB_URL()}/auth/v1/user`, { headers: { apikey: SB_KEY(), authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(401, 'Sessão expirada. Entre de novo no CRM.');
  const user = await res.json();
  const email = String(user?.email || '').toLowerCase();
  const rows = email ? await sb(`crm_members?select=email&email=eq.${encodeURIComponent(email)}`) : [];
  if (!rows?.length) throw new HttpError(403, 'Acesso não liberado para este usuário.');
  return email;
}

/* ---------------- Telefones ---------------- */
/** Normaliza para o formato do WhatsApp (só dígitos, com DDI). Celular BR antigo sem o 9 ganha o 9. */
export function canonicalPhone(value) {
  const raw = String(value || '').trim();
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return '';
  let digits = raw.replace(/\D/g, '').replace(/^00/, '');
  if (!raw.startsWith('+') && (digits.length === 10 || digits.length === 11)) digits = '55' + digits;
  if (digits.startsWith('55') && digits.length === 12 && /[6-9]/.test(digits[4])) digits = digits.slice(0, 4) + '9' + digits.slice(4);
  if (digits.startsWith('55') && !(digits.length === 12 || digits.length === 13)) return '';
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : '';
}
export const firstName = (name) => {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first ? first[0].toLocaleUpperCase('pt-BR') + first.slice(1).toLocaleLowerCase('pt-BR') : '';
};

/* ---------------- Meta / WhatsApp Cloud API ---------------- */
export async function graph(path, { method = 'GET', body, query } = {}) {
  if (!env('WHATSAPP_TOKEN')) throw new HttpError(503, 'WhatsApp ainda não configurado (WHATSAPP_TOKEN).');
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${GRAPH()}/${path}${qs}`, {
    method,
    headers: { authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = data.error || {};
    const code = Number(err.code) || res.status;
    throw Object.assign(new HttpError(502, metaMessage(code, err)), { meta: { code, subcode: err.error_subcode, detail: err.error_data?.details || err.message } });
  }
  return data;
}

/** Erros da Meta que devem PAUSAR a campanha inteira (não adianta continuar). */
export const FATAL_CODES = new Set([0, 3, 10, 190, 200, 368, 80007, 130429, 130472, 131031, 131042, 131048, 131056, 131057, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 133010, 135000]);
/** Cliente pediu para não receber marketing desta empresa (vira descadastro). */
export const OPTOUT_CODES = new Set([131050]);

export function metaMessage(code, err = {}) {
  const map = {
    190: 'O token do WhatsApp expirou ou é inválido. Gere o token permanente de novo (passo 6 do guia).',
    10: 'O token não tem permissão para esta conta do WhatsApp.',
    200: 'O token não tem permissão para esta conta do WhatsApp.',
    368: 'A Meta bloqueou temporariamente o número por violação de política.',
    80007: 'Limite de chamadas da conta atingido. Aguarde alguns minutos.',
    130429: 'Limite de velocidade de envio atingido. Aguarde um minuto e continue.',
    131031: 'A conta do WhatsApp está bloqueada pela Meta.',
    131042: 'Problema de pagamento na conta do WhatsApp. Confira a forma de pagamento no Gerenciador do WhatsApp.',
    131048: 'A Meta limitou envios por excesso de bloqueios/denúncias. Pause e revise o público e a mensagem.',
    131056: 'Muitas mensagens para o mesmo número em pouco tempo.',
    131026: 'Número sem WhatsApp ou mensagem não entregável.',
    131049: 'A Meta não entregou para manter a experiência do cliente (limite de mensagens de marketing por pessoa). Tente esse contato em outro dia.',
    131050: 'O cliente parou de receber mensagens de marketing desta empresa.',
    131047: 'Fora da janela de 24 h: use um modelo aprovado.',
    131051: 'Tipo de mensagem não suportado.',
    131009: 'Valor de parâmetro inválido.',
    132000: 'A quantidade de variáveis não bate com o modelo.',
    132001: 'Modelo não existe nesse idioma ou ainda não foi aprovado.',
    132007: 'O conteúdo das variáveis viola a política do modelo.',
    132012: 'Formato das variáveis não bate com o modelo.',
    132015: 'Modelo pausado pela Meta por baixa qualidade.',
    132016: 'Modelo desativado pela Meta.',
    133010: 'Número do WhatsApp ainda não registrado na API (passo 5 do guia).',
    100: 'Parâmetro inválido enviado à Meta.',
  };
  return map[code] || `Erro da Meta (${code}): ${err.error_data?.details || err.message || 'sem detalhes'}`;
}

/* ---------------- Montagem do modelo ---------------- */
const clean = (text, max = 1000) => String(text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, max);
function value(source, fixed, r) {
  switch (source) {
    case 'first_name': return firstName(r.name) || 'cliente';
    case 'full_name': return clean(r.name, 60) || 'cliente';
    case 'city': return clean(String(r.city || '').split(',')[0]) || 'sua cidade';
    case 'state': return clean(r.state) || 'seu estado';
    default: return clean(fixed) || '-';
  }
}
/** params = {named, header:{format, var?:{source,value}, link?}, body:[{key,source,value}], buttons:[{index,value}]} */
export function buildComponents(params = {}, r = {}) {
  const components = [];
  const p = (key, v) => (params.named ? { type: 'text', parameter_name: key, text: v } : { type: 'text', text: v });
  const h = params.header || {};
  if (h.format === 'TEXT' && h.var) components.push({ type: 'header', parameters: [p(h.var.key, value(h.var.source, h.var.value, r))] });
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(h.format)) {
    if (!/^https:\/\//.test(h.link || '')) throw new HttpError(400, 'Informe o link (https) da imagem/vídeo/documento do cabeçalho.');
    const type = h.format.toLowerCase();
    components.push({ type: 'header', parameters: [{ type, [type]: { link: h.link } }] });
  }
  const body = Array.isArray(params.body) ? params.body : [];
  if (body.length) components.push({ type: 'body', parameters: body.map((b) => p(b.key, value(b.source, b.value, r))) });
  for (const b of Array.isArray(params.buttons) ? params.buttons : []) {
    components.push({ type: 'button', sub_type: 'url', index: String(b.index), parameters: [{ type: 'text', text: clean(b.value, 200) || '-' }] });
  }
  return components;
}

export async function sendTemplate({ to, template, language, params, recipient }) {
  const data = await graph(`${env('WHATSAPP_PHONE_ID')}/messages`, {
    method: 'POST',
    body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name: template, language: { code: language }, components: buildComponents(params, recipient) } },
  });
  return data.messages?.[0]?.id || '';
}

export async function getApprovedTemplate(name, language) {
  const data = await graph(`${env('WHATSAPP_WABA_ID')}/message_templates`, { query: { name, fields: 'name,language,status,category,components,parameter_format', limit: '50' } });
  const t = (data.data || []).find((x) => x.name === name && x.language === language);
  if (!t) throw new HttpError(400, 'Modelo não encontrado nesse idioma.');
  if (t.status !== 'APPROVED') throw new HttpError(400, `O modelo "${name}" está com status ${t.status}. Só modelos aprovados podem ser enviados.`);
  return t;
}

/* ---------------- Webhook ---------------- */
export function validSignature(raw, header) {
  const secret = env('WHATSAPP_APP_SECRET');
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function consentFromText(text) {
  const t = norm(text);
  if (/^(sair|parar|pare|stop|cancelar|descadastrar|remover|bloquear)\b/.test(t) || /nao (quero|desejo) (mais )?receber/.test(t)) return 'saiu';
  if (/^(quero receber|sim,? quero|aceito receber|pode enviar)/.test(t)) return 'autorizou';
  return '';
}
