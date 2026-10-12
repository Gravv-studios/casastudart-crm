// POST {campaignId, action}: pausar, continuar ou cancelar um disparo.
import { handle, HttpError, json, readJson, requireMember, sb } from '../_lib/wa.js';

export const POST = handle(async (request) => {
  await requireMember(request);
  const { campaignId, action } = await readJson(request);
  const [c] = await sb(`wa_campaigns?select=id,status&id=eq.${encodeURIComponent(String(campaignId || ''))}`);
  if (!c) throw new HttpError(404, 'Disparo não encontrado.');
  if (['concluida', 'cancelada'].includes(c.status)) throw new HttpError(409, 'Este disparo já terminou.');
  if (action === 'pause') await sb(`wa_campaigns?id=eq.${c.id}`, { method: 'PATCH', body: { status: 'pausada', pause_reason: 'Pausado no CRM.' } });
  else if (action === 'resume') await sb(`wa_campaigns?id=eq.${c.id}`, { method: 'PATCH', body: { status: 'enviando', pause_reason: null } });
  else if (action === 'cancel') {
    await sb(`wa_recipients?campaign_id=eq.${c.id}&status=eq.fila`, { method: 'PATCH', body: { status: 'pulada', error: 'Disparo cancelado.', updated_at: new Date().toISOString() } });
    await sb(`wa_campaigns?id=eq.${c.id}`, { method: 'PATCH', body: { status: 'cancelada', finished_at: new Date().toISOString() } });
  } else throw new HttpError(400, 'Ação inválida.');
  return json({ ok: true });
});
