// Testes das funções /api/whatsapp/* com Supabase e Meta SIMULADOS (nenhuma mensagem real sai).
// Rodar: node --test tests/whatsapp-api.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';

process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.WHATSAPP_TOKEN = 'meta-token';
process.env.WHATSAPP_PHONE_ID = '111';
process.env.WHATSAPP_WABA_ID = '222';
process.env.WHATSAPP_APP_SECRET = 'segredo';
process.env.WHATSAPP_VERIFY_TOKEN = 'verifica';

const wa = await import('../api/_lib/wa.js');
const campaigns = await import('../api/whatsapp/campaigns.js');
const dispatch = await import('../api/whatsapp/dispatch.js');
const control = await import('../api/whatsapp/control.js');
const webhook = await import('../api/whatsapp/webhook.js');
const inbox = await import('../api/whatsapp/inbox.js');
const reply = await import('../api/whatsapp/reply.js');
const templates = await import('../api/whatsapp/templates.js');
const testRoute = await import('../api/whatsapp/test.js');

/* ---------- Banco falso (subconjunto do PostgREST usado pelas funções) ---------- */
let db, sentToMeta, metaFail;
const UNIQUE = { wa_consents: 'phone', wa_messages: 'wamid' };
function parseVal(v) { return v; }
function match(row, key, expr) {
  if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return true;
  const [op, ...rest] = expr.split('.'); const val = rest.join('.');
  const field = key.includes('->>') ? null : key;
  const cell = row[field];
  if (op === 'eq') return String(cell) === decodeURIComponent(val) || (val === 'false' && cell === false) || (val === 'true' && cell === true);
  if (op === 'in') return val.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(cell));
  if (op === 'lt') return cell != null && String(cell) < decodeURIComponent(val);
  if (op === 'gte') return cell != null && String(cell) >= decodeURIComponent(val);
  throw new Error('op não suportada ' + op);
}
function fakeSupabase(url, init) {
  const u = new URL(url);
  if (u.pathname === '/auth/v1/user') {
    const token = init.headers.authorization.replace('Bearer ', '');
    return token === 'ok' ? { email: 'Hugo@Casa.com' } : token === 'intruso' ? { email: 'x@y.com' } : null;
  }
  const table = u.pathname.replace('/rest/v1/', '');
  db[table] ??= [];
  const params = [...u.searchParams.entries()];
  const filt = (r) => params.every(([k, v]) => match(r, k, v));
  const method = init.method || 'GET';
  const prefer = init.headers.prefer || '';
  if (method === 'GET') {
    let rows = db[table].filter(filt);
    const order = u.searchParams.get('order'); if (order) { const [f, dir] = order.split('.'); rows = [...rows].sort((a, b) => String(a[f]).localeCompare(String(b[f])) * (dir === 'desc' ? -1 : 1)); }
    const limit = u.searchParams.get('limit'); if (limit) rows = rows.slice(0, Number(limit));
    return rows.map(r => ({ ...r }));
  }
  const body = init.body ? JSON.parse(init.body) : null;
  if (method === 'POST') {
    const list = Array.isArray(body) ? body : [body]; const out = [];
    for (const item of list) {
      const key = UNIQUE[table];
      const existing = key && item[key] != null && db[table].find(r => r[key] === item[key]);
      if (existing) { if (prefer.includes('merge-duplicates')) Object.assign(existing, item); out.push(existing); continue; }
      const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: table === 'wa_campaigns' ? 'pronta' : table === 'wa_recipients' ? 'fila' : item.status, read_by_crm: false, ...item };
      if (table === 'wa_recipients' && db[table].some(r => r.campaign_id === row.campaign_id && r.phone === row.phone)) throw new Error('unique');
      db[table].push(row); out.push(row);
    }
    return prefer.includes('return=representation') ? out : null;
  }
  if (method === 'PATCH') { const rows = db[table].filter(filt); rows.forEach(r => Object.assign(r, body)); return prefer.includes('return=representation') ? rows : null; }
  if (method === 'DELETE') { db[table] = db[table].filter(r => !filt(r)); return null; }
}
function fakeMeta(url, init) {
  const u = new URL(url);
  if (u.pathname.endsWith('/message_templates')) return { data: [
    { name: 'promo_estado', language: 'pt_BR', status: 'APPROVED', category: 'MARKETING', parameter_format: 'POSITIONAL', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Oi {{1}}! Promo em {{2}}: {{3}}' }, { type: 'FOOTER', text: 'Responda SAIR para não receber' }, { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://casastudart.com.br/{{1}}' }, { type: 'QUICK_REPLY', text: 'Não quero receber' }] }] },
    { name: 'em_analise', language: 'pt_BR', status: 'PENDING', category: 'MARKETING', components: [{ type: 'BODY', text: 'x' }] },
  ] };
  if (u.pathname.endsWith('/111/messages')) {
    const body = JSON.parse(init.body);
    if (metaFail?.(body)) return { __status: 400, error: metaFail(body) };
    sentToMeta.push(body); return { messages: [{ id: 'wamid.' + sentToMeta.length }] };
  }
  throw new Error('rota Meta não simulada ' + u.pathname);
}
globalThis.fetch = async (url, init = {}) => {
  init.headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  let data, status = 200;
  if (String(url).startsWith('https://fake.supabase.co')) { data = fakeSupabase(url, init); if (data === null && String(url).includes('/auth/')) status = 401; }
  else if (String(url).startsWith('https://graph.facebook.com')) { data = fakeMeta(url, init); if (data?.__status) { status = data.__status; delete data.__status; } }
  else throw new Error('rede bloqueada no teste: ' + url);
  return new Response(data === null || data === undefined ? '' : JSON.stringify(data), { status });
};

const req = (path, body, token = 'ok', headers = {}) => new Request('https://crm.test/api/whatsapp/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const PARAMS = { named: false, header: { format: 'IMAGE', link: 'https://casastudart.com.br/promo.jpg' }, body: [{ key: '1', source: 'first_name', value: '' }, { key: '2', source: 'state', value: '' }, { key: '3', source: 'fixed', value: '15% off\nsó hoje' }], buttons: [{ index: 0, value: 'outubro' }] };

beforeEach(() => {
  sentToMeta = []; metaFail = null;
  db = {
    crm_members: [{ email: 'hugo@casa.com' }],
    crm_entries: [
      { id: 'c1', kind: 'contact', data: { name: 'MARIA souza', phone: '+55 11 98888-0001', state: 'SP', city: 'São Paulo, SP' } },
      { id: 'c2', kind: 'contact', data: { name: 'João Lima', phone: '+55 21 8777-0002', state: 'RJ' } },          // celular antigo sem o 9
      { id: 'c3', kind: 'contact', data: { name: 'Ana', phone: '', altPhones: '(61) 99666-0003', state: 'DF' } },
      { id: 'c4', kind: 'contact', data: { name: 'Sem Fone', phone: '', state: 'DF' } },
      { id: 'c5', kind: 'contact', data: { name: 'Repetida', phone: '11988880001', state: 'SP' } },
      { id: 'c6', kind: 'contact', data: { name: 'Saiu', phone: '+55 61 99555-0006', state: 'DF' } },
    ],
    wa_consents: [{ phone: '5561995550006', status: 'saiu' }],
    wa_campaigns: [], wa_recipients: [], wa_messages: [],
  };
});

test('telefone: normaliza e coloca o 9 em celular antigo', () => {
  assert.equal(wa.canonicalPhone('+55 21 8777-0002'), '5521987770002');
  assert.equal(wa.canonicalPhone('(61) 99666-0003'), '5561996660003');
  assert.equal(wa.canonicalPhone('61 3333-4444'), '556133334444'); // fixo fica como está
  assert.equal(wa.canonicalPhone('abc'), '');
  assert.equal(wa.canonicalPhone('+1 415 555 0100'), '14155550100');
});

test('descadastro e autorização pelo texto do cliente', () => {
  assert.equal(wa.consentFromText('SAIR'), 'saiu');
  assert.equal(wa.consentFromText('Não quero receber'), 'saiu');
  assert.equal(wa.consentFromText('nao quero mais receber essas mensagens'), 'saiu');
  assert.equal(wa.consentFromText('Quero receber'), 'autorizou');
  assert.equal(wa.consentFromText('Qual o preço do sofá?'), '');
});

test('acesso: sem login, usuário não liberado', async () => {
  assert.equal((await campaigns.POST(req('campaigns', {}, ''))).status, 401);
  assert.equal((await campaigns.POST(req('campaigns', {}, 'invalido'))).status, 401);
  assert.equal((await campaigns.POST(req('campaigns', {}, 'intruso'))).status, 403);
});

test('modelos: lista aprovados com variáveis e botão dinâmico', async () => {
  const r = await (await templates.GET(req('templates'))).json();
  assert.equal(r.templates[0].name, 'promo_estado');
  assert.deepEqual(r.templates[0].bodyVars, ['1', '2', '3']);
  assert.equal(r.templates[0].buttons[0].dynamic, true);
  assert.equal(r.templates[1].status, 'PENDING');
});

test('teste: envia uma mensagem só para o número informado', async () => {
  const res = await testRoute.POST(req('test', { template: 'promo_estado', language: 'pt_BR', params: PARAMS, phone: '61 99999-1234', sample: { name: 'hugo studart', state: 'DF' } }));
  assert.equal(res.status, 200);
  assert.equal(sentToMeta.length, 1);
  assert.equal(sentToMeta[0].to, '5561999991234');
  const body = sentToMeta[0].template.components.find(c => c.type === 'body');
  assert.deepEqual(body.parameters.map(p => p.text), ['Hugo', 'DF', '15% off só hoje']); // sem quebra de linha (regra da Meta)
  assert.equal(sentToMeta[0].template.components[0].parameters[0].image.link, 'https://casastudart.com.br/promo.jpg');
  assert.equal(sentToMeta[0].template.components.find(c => c.type === 'button').parameters[0].text, 'outubro');
  const bad = await testRoute.POST(req('test', { template: 'em_analise', language: 'pt_BR', params: PARAMS, phone: '61999991234' }));
  assert.equal(bad.status, 400);
});

test('campanha: cria fila sem repetidos, sem quem saiu e sem quem não tem fone', async () => {
  const res = await campaigns.POST(req('campaigns', { name: 'Promo SP RJ DF', template: 'promo_estado', language: 'pt_BR', params: PARAMS, filters: { states: ['SP', 'RJ', 'DF'] }, contactIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'nao-existe'] }));
  const r = await res.json();
  assert.equal(res.status, 200, JSON.stringify(r));
  assert.equal(r.total, 3);
  assert.deepEqual(r.excluded, { semTelefone: 1, repetidos: 1, sairam: 1, naoEncontrados: 1 });
  assert.deepEqual(db.wa_recipients.map(x => x.phone).sort(), ['5511988880001', '5521987770002', '5561996660003']);
  assert.equal(db.wa_campaigns[0].created_by, 'hugo@casa.com');
  assert.equal(sentToMeta.length, 0, 'criar não envia nada');
});

test('disparo: envia em lotes até concluir e não reenvia', async () => {
  const { campaignId } = await (await campaigns.POST(req('campaigns', { name: 'P', template: 'promo_estado', language: 'pt_BR', params: PARAMS, contactIds: ['c1', 'c2', 'c3'] }))).json();
  const r = await (await dispatch.POST(req('dispatch', { campaignId }))).json();
  assert.equal(r.status, 'concluida');
  assert.equal(r.sent, 3);
  assert.equal(sentToMeta.length, 3);
  assert.ok(db.wa_recipients.every(x => x.status === 'enviada' && x.wamid));
  const again = await (await dispatch.POST(req('dispatch', { campaignId }))).json();
  assert.equal(again.status, 'concluida');
  assert.equal(sentToMeta.length, 3, 'nada é enviado duas vezes');
});

test('disparo: quem respondeu SAIR depois de criado é pulado', async () => {
  const { campaignId } = await (await campaigns.POST(req('campaigns', { name: 'P', template: 'promo_estado', language: 'pt_BR', params: PARAMS, contactIds: ['c1', 'c2'] }))).json();
  db.wa_consents.push({ phone: '5521987770002', status: 'saiu' });
  const r = await (await dispatch.POST(req('dispatch', { campaignId }))).json();
  assert.equal(r.sent, 1); assert.equal(r.skipped, 1);
  assert.deepEqual(sentToMeta.map(m => m.to), ['5511988880001']);
});

test('disparo: erro de número pula só aquele; erro grave pausa e mantém na fila', async () => {
  const { campaignId } = await (await campaigns.POST(req('campaigns', { name: 'P', template: 'promo_estado', language: 'pt_BR', params: PARAMS, contactIds: ['c1', 'c2', 'c3'] }))).json();
  metaFail = (b) => (b.to === '5521987770002' ? { code: 131026, message: 'undeliverable' } : null);
  let r = await (await dispatch.POST(req('dispatch', { campaignId }))).json();
  assert.equal(r.status, 'concluida'); assert.equal(r.sent, 2); assert.equal(r.failed, 1);
  assert.match(db.wa_recipients.find(x => x.phone === '5521987770002').error, /sem WhatsApp/);

  const second = await (await campaigns.POST(req('campaigns', { name: 'P2', template: 'promo_estado', language: 'pt_BR', params: PARAMS, contactIds: ['c1', 'c2', 'c3'] }))).json();
  sentToMeta = []; metaFail = () => ({ code: 131048, message: 'spam rate limit' });
  r = await (await dispatch.POST(req('dispatch', { campaignId: second.campaignId }))).json();
  assert.equal(r.status, 'pausada'); assert.match(r.reason, /limitou envios/);
  assert.ok(db.wa_recipients.filter(x => x.campaign_id === second.campaignId).every(x => x.status === 'fila'), 'ninguém marcado como enviado');
  // pausado não envia
  metaFail = null;
  r = await (await dispatch.POST(req('dispatch', { campaignId: second.campaignId }))).json();
  assert.equal(r.status, 'pausada'); assert.equal(sentToMeta.length, 0);
  // continuar
  await control.POST(req('control', { campaignId: second.campaignId, action: 'resume' }));
  r = await (await dispatch.POST(req('dispatch', { campaignId: second.campaignId }))).json();
  assert.equal(r.status, 'concluida'); assert.equal(sentToMeta.length, 3);
});

test('disparo: cliente que bloqueou marketing (131050) vira descadastro', async () => {
  const { campaignId } = await (await campaigns.POST(req('campaigns', { name: 'P', template: 'promo_estado', language: 'pt_BR', params: PARAMS, contactIds: ['c1'] }))).json();
  metaFail = () => ({ code: 131050, message: 'stopped marketing' });
  await dispatch.POST(req('dispatch', { campaignId }));
  assert.equal(db.wa_consents.find(c => c.phone === '5511988880001')?.status, 'saiu');
});

test('cancelar: o que estava na fila não sai mais', async () => {
  const { campaignId } = await (await campaigns.POST(req('campaigns', { name: 'P', template: 'promo_estado', language: 'pt_BR', params: PARAMS, contactIds: ['c1', 'c2'] }))).json();
  await control.POST(req('control', { campaignId, action: 'cancel' }));
  const r = await (await dispatch.POST(req('dispatch', { campaignId }))).json();
  assert.equal(r.status, 'cancelada'); assert.equal(sentToMeta.length, 0);
  assert.ok(db.wa_recipients.every(x => x.status === 'pulada'));
});

const signed = (payload, secret = 'segredo') => { const raw = JSON.stringify(payload); return new Request('https://crm.test/api/whatsapp/webhook', { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') }, body: raw }); };

test('webhook: verificação da URL', async () => {
  const ok = await webhook.GET(new Request('https://crm.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=123'));
  assert.equal(ok.status, 200); assert.equal(await ok.text(), '123');
  assert.equal((await webhook.GET(new Request('https://crm.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1'))).status, 403);
});

test('webhook: recusa assinatura falsa', async () => {
  const res = await webhook.POST(signed({ entry: [] }, 'outro'));
  assert.equal(res.status, 401);
});

test('webhook: status de entrega/leitura e resposta SAIR', async () => {
  const { campaignId } = await (await campaigns.POST(req('campaigns', { name: 'P', template: 'promo_estado', language: 'pt_BR', params: PARAMS, contactIds: ['c1', 'c2'] }))).json();
  await dispatch.POST(req('dispatch', { campaignId }));
  const [a, b] = db.wa_recipients;
  const value = (v) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '111' }, ...v } }] }] });
  await webhook.POST(signed(value({ statuses: [{ id: a.wamid, status: 'read' }, { id: b.wamid, status: 'failed', recipient_id: '552187770002', errors: [{ code: 131049, title: 'ecosystem' }] }] })));
  await webhook.POST(signed(value({ statuses: [{ id: a.wamid, status: 'delivered' }] }))); // chega atrasado: não volta de "lida"
  assert.equal(a.status, 'lida'); assert.equal(b.status, 'falhou'); assert.match(b.error, /131049/);
  // cliente do RJ (wa_id sem o 9) responde SAIR pelo botão
  const res = await webhook.POST(signed(value({ contacts: [{ wa_id: '552187770002', profile: { name: 'João' } }], messages: [{ from: '552187770002', id: 'wamid.in1', type: 'button', button: { text: 'Não quero receber', payload: 'Não quero receber' } }] })));
  assert.equal(res.status, 200);
  assert.equal(db.wa_consents.find(c => c.phone === '5521987770002')?.status, 'saiu');
  const msg = db.wa_messages.find(m => m.wamid === 'wamid.in1');
  assert.equal(msg.phone, '5521987770002'); assert.equal(msg.campaign_id, campaignId); assert.equal(msg.name, 'João');
  // reenvio da mesma mensagem pela Meta não duplica
  await webhook.POST(signed(value({ messages: [{ from: '552187770002', id: 'wamid.in1', type: 'text', text: { body: 'x' } }] })));
  assert.equal(db.wa_messages.filter(m => m.wamid === 'wamid.in1').length, 1);
});

test('respostas: só responde dentro de 24 h; autorização manual', async () => {
  db.wa_messages.push({ id: 'm1', direction: 'in', phone: '5561996660003', body: 'Tem em azul?', created_at: new Date().toISOString(), read_by_crm: false });
  let res = await reply.POST(req('reply', { phone: '(61) 99666-0003', text: 'Temos sim!' }));
  assert.equal(res.status, 200);
  assert.equal(sentToMeta.at(-1).type, 'text');
  db.wa_messages.push({ id: 'm2', direction: 'in', phone: '5511988880001', body: 'oi', created_at: new Date(Date.now() - 25 * 3600e3).toISOString() });
  res = await reply.POST(req('reply', { phone: '5511988880001', text: 'Oi' }));
  assert.equal(res.status, 409);
  await inbox.POST(req('inbox', { action: 'read', phone: '61996660003' }));
  assert.equal(db.wa_messages.find(m => m.id === 'm1').read_by_crm, true);
  await inbox.POST(req('inbox', { action: 'consent', status: 'autorizou', phones: ['11 98888-0001', 'lixo', '21 98777-0002'] }));
  assert.equal(db.wa_consents.find(c => c.phone === '5511988880001').status, 'autorizou');
  assert.equal(db.wa_consents.find(c => c.phone === '5521987770002').status, 'autorizou');
});

test('disparo: base grande sai em vários lotes', async () => {
  for (let i = 0; i < 60; i++) db.crm_entries.push({ id: 'g' + i, kind: 'contact', data: { name: 'Cliente ' + i, phone: '+55 11 97000-' + String(1000 + i), state: 'SP' } });
  const { campaignId, total } = await (await campaigns.POST(req('campaigns', { name: 'G', template: 'promo_estado', language: 'pt_BR', params: PARAMS, contactIds: db.crm_entries.filter(e => e.id.startsWith('g')).map(e => e.id) }))).json();
  assert.equal(total, 60);
  const statuses = [];
  for (let i = 0; i < 10; i++) { const r = await (await dispatch.POST(req('dispatch', { campaignId }))).json(); statuses.push(r.status); if (r.status !== 'enviando') break; }
  assert.deepEqual(statuses, ['enviando', 'enviando', 'concluida']);
  assert.equal(sentToMeta.length, 60);
  assert.equal(new Set(sentToMeta.map(m => m.to)).size, 60);
});
