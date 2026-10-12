// POST {template, language, params, phone, sample}: envia UMA mensagem de teste para o número informado.
import { canonicalPhone, getApprovedTemplate, handle, HttpError, json, readJson, requireMember, sendTemplate } from '../_lib/wa.js';

export const POST = handle(async (request) => {
  await requireMember(request);
  const b = await readJson(request);
  const to = canonicalPhone(b.phone);
  if (!to) throw new HttpError(400, 'Informe um WhatsApp de teste válido, com DDD.');
  await getApprovedTemplate(String(b.template || ''), String(b.language || ''));
  try {
    const id = await sendTemplate({ to, template: b.template, language: b.language, params: b.params, recipient: { name: b.sample?.name || 'Hugo', city: b.sample?.city || '', state: b.sample?.state || '' } });
    return json({ ok: true, id, to });
  } catch (e) { throw new HttpError(400, e.message); }
});
