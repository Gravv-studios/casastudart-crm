// POST {phone, text}: responde um cliente que escreveu nas últimas 24 h (mensagem livre, sem custo de modelo).
import { canonicalPhone, env, graph, handle, HttpError, json, readJson, requireMember, sb } from '../_lib/wa.js';

export const POST = handle(async (request) => {
  const email = await requireMember(request);
  const b = await readJson(request);
  const phone = canonicalPhone(b.phone);
  const text = String(b.text || '').trim();
  if (!phone || !text) throw new HttpError(400, 'Escreva a resposta.');
  if (text.length > 4000) throw new HttpError(400, 'Mensagem muito longa.');
  const [last] = await sb(`wa_messages?select=created_at,wamid&phone=eq.${phone}&direction=eq.in&order=created_at.desc&limit=1`);
  if (!last || Date.now() - Date.parse(last.created_at) > 24 * 3600 * 1000) {
    throw new HttpError(409, 'Passaram mais de 24 h desde a última mensagem do cliente. Pela regra do WhatsApp, agora só dá para enviar um modelo aprovado.');
  }
  let data;
  try {
    data = await graph(`${env('WHATSAPP_PHONE_ID')}/messages`, { method: 'POST', body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'text', text: { body: text, preview_url: true } } });
  } catch (e) { throw new HttpError(400, e.message); }
  const wamid = data.messages?.[0]?.id || null;
  await sb('wa_messages', { method: 'POST', prefer: 'return=minimal', body: { direction: 'out', phone, body: text, wamid, status: 'enviada', read_by_crm: true, created_by: email } });
  return json({ ok: true });
});
