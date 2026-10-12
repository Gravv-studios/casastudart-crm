// POST {campaignId}: envia o PRÓXIMO LOTE da campanha. A tela chama em sequência até acabar.
// Cada chamada é curta (cabe no limite de tempo da Vercel) e pode ser retomada a qualquer momento.
import { FATAL_CODES, OPTOUT_CODES, handle, HttpError, inList, json, readJson, requireMember, sb, sendTemplate } from '../_lib/wa.js';

const BATCH = 25;
const PARALLEL = 5;
const now = () => new Date().toISOString();

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const item = items[i++]; await fn(item); } }));
}

export const POST = handle(async (request) => {
  await requireMember(request);
  const { campaignId } = await readJson(request);
  const [c] = await sb(`wa_campaigns?select=*&id=eq.${encodeURIComponent(String(campaignId || ''))}`);
  if (!c) throw new HttpError(404, 'Disparo não encontrado.');
  if (c.status === 'cancelada' || c.status === 'concluida') return json({ status: c.status, sent: 0, failed: 0, skipped: 0, remaining: 0 });
  if (c.status === 'pausada') return json({ status: 'pausada', reason: c.pause_reason, sent: 0, failed: 0, skipped: 0, remaining: -1 });
  if (c.status === 'pronta') await sb(`wa_campaigns?id=eq.${c.id}`, { method: 'PATCH', body: { status: 'enviando', started_at: c.started_at || now() } });

  // Linhas presas em "enviando" (chamada anterior caiu no meio): não reenviamos para não duplicar.
  const stale = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await sb(`wa_recipients?campaign_id=eq.${c.id}&status=eq.enviando&updated_at=lt.${stale}`, { method: 'PATCH', body: { status: 'falhou', error: 'Envio interrompido; confira no WhatsApp se chegou.', updated_at: now() } });

  // Reserva o lote (só pega quem ainda está na fila, evita envio duplo se duas abas estiverem abertas).
  const next = await sb(`wa_recipients?select=id&campaign_id=eq.${c.id}&status=eq.fila&order=name.asc&limit=${BATCH}`);
  const claimed = next.length ? await sb(`wa_recipients?id=in.${inList(next.map((r) => r.id))}&status=eq.fila`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'enviando', updated_at: now() } }) : [];

  const optedOut = new Set();
  if (claimed.length) (await sb(`wa_consents?select=phone&status=eq.saiu&phone=in.${inList(claimed.map((r) => r.phone))}`)).forEach((r) => optedOut.add(r.phone));

  let sent = 0, failed = 0, skipped = 0, fatal = null;
  await pool(claimed, PARALLEL, async (r) => {
    if (fatal) { await sb(`wa_recipients?id=eq.${r.id}`, { method: 'PATCH', body: { status: 'fila', updated_at: now() } }); return; }
    if (optedOut.has(r.phone)) { skipped++; await sb(`wa_recipients?id=eq.${r.id}`, { method: 'PATCH', body: { status: 'pulada', error: 'Pediu para não receber.', updated_at: now() } }); return; }
    try {
      const wamid = await sendTemplate({ to: r.phone, template: c.template_name, language: c.template_language, params: c.params, recipient: r });
      sent++;
      await sb(`wa_recipients?id=eq.${r.id}`, { method: 'PATCH', body: { status: 'enviada', wamid: wamid || null, sent_at: now(), error: null, updated_at: now() } });
    } catch (e) {
      const code = e.meta?.code;
      if (FATAL_CODES.has(code) || !e.meta) {
        fatal = fatal || e.message;
        await sb(`wa_recipients?id=eq.${r.id}`, { method: 'PATCH', body: { status: 'fila', updated_at: now() } });
        return;
      }
      failed++;
      await sb(`wa_recipients?id=eq.${r.id}`, { method: 'PATCH', body: { status: 'falhou', error: e.message.slice(0, 300), updated_at: now() } });
      if (OPTOUT_CODES.has(code)) await sb('wa_consents?on_conflict=phone', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { phone: r.phone, status: 'saiu', source: 'Meta: parou de receber marketing', updated_at: now() } });
    }
  });

  if (fatal) {
    await sb(`wa_campaigns?id=eq.${c.id}`, { method: 'PATCH', body: { status: 'pausada', pause_reason: fatal } });
    return json({ status: 'pausada', reason: fatal, sent, failed, skipped, remaining: -1 });
  }
  const left = await sb(`wa_recipients?select=id&campaign_id=eq.${c.id}&status=in.(fila,enviando)&limit=1`);
  if (!left.length) {
    await sb(`wa_campaigns?id=eq.${c.id}`, { method: 'PATCH', body: { status: 'concluida', finished_at: now() } });
    return json({ status: 'concluida', sent, failed, skipped, remaining: 0 });
  }
  return json({ status: 'enviando', sent, failed, skipped, remaining: -1 });
});
