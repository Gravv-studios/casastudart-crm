// POST {action:'read', phone} marca a conversa como lida.
// POST {action:'consent', phones:[...], status:'autorizou'|'saiu'|'limpar'} registra autorização/descadastro manual.
import { canonicalPhone, handle, HttpError, inList, json, readJson, requireMember, sb } from '../_lib/wa.js';

export const POST = handle(async (request) => {
  const email = await requireMember(request);
  const b = await readJson(request);
  if (b.action === 'read') {
    const phone = canonicalPhone(b.phone);
    if (!phone) throw new HttpError(400, 'Telefone inválido.');
    await sb(`wa_messages?phone=eq.${phone}&direction=eq.in&read_by_crm=eq.false`, { method: 'PATCH', body: { read_by_crm: true } });
    return json({ ok: true });
  }
  if (b.action === 'consent') {
    const phones = [...new Set((Array.isArray(b.phones) ? b.phones : [b.phone]).map(canonicalPhone).filter(Boolean))].slice(0, 5000);
    if (!phones.length) throw new HttpError(400, 'Nenhum telefone válido.');
    if (b.status === 'limpar') {
      for (let i = 0; i < phones.length; i += 150) await sb(`wa_consents?phone=in.${inList(phones.slice(i, i + 150))}`, { method: 'DELETE' });
    } else {
      if (!['autorizou', 'saiu'].includes(b.status)) throw new HttpError(400, 'Situação inválida.');
      const now = new Date().toISOString();
      for (let i = 0; i < phones.length; i += 500) {
        await sb('wa_consents?on_conflict=phone', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: phones.slice(i, i + 500).map((phone) => ({ phone, status: b.status, source: String(b.source || 'Marcado no CRM').slice(0, 120), updated_by: email, updated_at: now })) });
      }
    }
    return json({ ok: true, count: phones.length });
  }
  throw new HttpError(400, 'Ação inválida.');
});
