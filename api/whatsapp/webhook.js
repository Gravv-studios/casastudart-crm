// Webhook da Meta: confirma a URL (GET) e recebe status de entrega + mensagens dos clientes (POST).
// Configurar no app da Meta: URL = https://SEU-CRM/api/whatsapp/webhook, token = WHATSAPP_VERIFY_TOKEN, campo "messages".
import { canonicalPhone, consentFromText, env, sb, validSignature } from '../_lib/wa.js';

const RANK = { fila: 0, enviando: 1, enviada: 2, entregue: 3, lida: 4 };
const MAP = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' };

export function GET(request) {
  const u = new URL(request.url);
  const ok = u.searchParams.get('hub.mode') === 'subscribe' && env('WHATSAPP_VERIFY_TOKEN') && u.searchParams.get('hub.verify_token') === env('WHATSAPP_VERIFY_TOKEN');
  return ok ? new Response(u.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('forbidden', { status: 403 });
}

function textOf(m) {
  if (m.type === 'text') return m.text?.body || '';
  if (m.type === 'button') return m.button?.text || m.button?.payload || '';
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
  if (m.type === 'reaction') return `Reagiu ${m.reaction?.emoji || ''}`.trim();
  const cap = m[m.type]?.caption;
  return `[${{ image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', location: 'Localização', contacts: 'Contato' }[m.type] || m.type}]${cap ? ' ' + cap : ''}`;
}

async function onStatus(s) {
  const next = MAP[s.status];
  if (!next || !s.id) return;
  const [row] = await sb(`wa_recipients?select=id,status&wamid=eq.${encodeURIComponent(s.id)}`);
  if (row) {
    if (next === 'falhou') {
      const err = s.errors?.[0];
      await sb(`wa_recipients?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'falhou', error: (err ? `${err.code}: ${err.error_data?.details || err.title || err.message || ''}` : 'Falhou na entrega.').slice(0, 300), updated_at: new Date().toISOString() } });
      if (err?.code === 131050) await sb('wa_consents?on_conflict=phone', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { phone: canonicalPhone(s.recipient_id) || s.recipient_id, status: 'saiu', source: 'Meta: parou de receber marketing' } });
    } else if ((RANK[next] ?? 0) > (RANK[row.status] ?? 0) && row.status !== 'falhou') {
      await sb(`wa_recipients?id=eq.${row.id}`, { method: 'PATCH', body: { status: next, updated_at: new Date().toISOString() } });
    }
    return;
  }
  await sb(`wa_messages?wamid=eq.${encodeURIComponent(s.id)}`, { method: 'PATCH', body: { status: next } });
}

async function onMessage(m, contacts) {
  const phone = canonicalPhone(m.from) || m.from;
  const name = contacts.find((c) => c.wa_id === m.from)?.profile?.name || null;
  const body = textOf(m).slice(0, 4000);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [rec] = await sb(`wa_recipients?select=campaign_id&phone=eq.${phone}&sent_at=gte.${since}&order=sent_at.desc&limit=1`);
  await sb('wa_messages?on_conflict=wamid', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { direction: 'in', phone, name, body, kind: m.type, wamid: m.id, campaign_id: rec?.campaign_id || null } });
  const consent = consentFromText(body);
  if (consent) await sb('wa_consents?on_conflict=phone', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { phone, status: consent, source: `Cliente respondeu: "${body.slice(0, 60)}"`, updated_at: new Date().toISOString() } });
}

export async function POST(request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('x-hub-signature-256'))) return new Response('assinatura inválida', { status: 401 });
  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response('ok'); }
  try {
    for (const entry of payload.entry || []) for (const change of entry.changes || []) {
      const v = change.value || {};
      if (v.metadata?.phone_number_id && env('WHATSAPP_PHONE_ID') && v.metadata.phone_number_id !== env('WHATSAPP_PHONE_ID')) continue;
      for (const s of v.statuses || []) await onStatus(s);
      for (const m of v.messages || []) await onMessage(m, v.contacts || []);
    }
  } catch (e) {
    console.error('[webhook]', e); // devolve 500 para a Meta reenviar depois
    return new Response('erro', { status: 500 });
  }
  return new Response('ok');
}

