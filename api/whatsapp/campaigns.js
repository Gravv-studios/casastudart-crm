// POST: cria a campanha e a fila de destinatários (a partir dos contatos escolhidos na tela).
// O servidor relê os contatos do banco, normaliza os telefones, tira repetidos e quem pediu para sair.
import { canonicalPhone, getApprovedTemplate, handle, HttpError, inList, json, readJson, requireMember, sb } from '../_lib/wa.js';

const MAX = 5000;

export const POST = handle(async (request) => {
  const email = await requireMember(request);
  const b = await readJson(request);
  const name = String(b.name || '').trim().slice(0, 120);
  const ids = [...new Set((Array.isArray(b.contactIds) ? b.contactIds : []).map(String))];
  if (!name) throw new HttpError(400, 'Dê um nome para o disparo.');
  if (!ids.length) throw new HttpError(400, 'Nenhum contato selecionado.');
  if (ids.length > MAX) throw new HttpError(400, `Máximo de ${MAX} contatos por disparo.`);
  const template = await getApprovedTemplate(String(b.template || ''), String(b.language || ''));

  const contacts = [];
  for (let i = 0; i < ids.length; i += 150) {
    const rows = await sb(`crm_entries?select=id,data&kind=eq.contact&id=in.${inList(ids.slice(i, i + 150))}`);
    contacts.push(...rows);
  }
  const optedOut = new Set();
  const phones = [];
  const excluded = { semTelefone: 0, repetidos: 0, sairam: 0, naoEncontrados: ids.length - contacts.length };
  const seen = new Set();
  const recipients = [];
  for (const c of contacts) {
    const d = c.data || {};
    const candidates = [d.phone, ...String(d.altPhones || '').split(/[;,|\n]/)];
    const phone = candidates.map(canonicalPhone).find(Boolean);
    if (!phone) { excluded.semTelefone++; continue; }
    if (seen.has(phone)) { excluded.repetidos++; continue; }
    seen.add(phone); phones.push(phone);
    recipients.push({ contact_id: c.id, name: String(d.name || '').slice(0, 120), phone, state: d.state || null, city: d.city || null });
  }
  for (let i = 0; i < phones.length; i += 150) {
    const rows = await sb(`wa_consents?select=phone&status=eq.saiu&phone=in.${inList(phones.slice(i, i + 150))}`);
    rows.forEach((r) => optedOut.add(r.phone));
  }
  const final = recipients.filter((r) => !optedOut.has(r.phone));
  excluded.sairam = recipients.length - final.length;
  if (!final.length) throw new HttpError(400, 'Nenhum contato com WhatsApp válido para enviar.', { excluded });

  const [campaign] = await sb('wa_campaigns', {
    method: 'POST', prefer: 'return=representation',
    body: { name, template_name: template.name, template_language: template.language, template_category: template.category, params: b.params || {}, filters: b.filters || {}, created_by: email },
  });
  for (let i = 0; i < final.length; i += 500) {
    await sb('wa_recipients', { method: 'POST', prefer: 'return=minimal', body: final.slice(i, i + 500).map((r) => ({ ...r, campaign_id: campaign.id })) });
  }
  return json({ campaignId: campaign.id, total: final.length, excluded });
});
