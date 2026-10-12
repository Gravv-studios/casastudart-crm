// GET: situação da integração (variáveis, número, limite, webhook).
// POST {action:'subscribe'}: liga o webhook na conta. POST {action:'register', pin}: ativa o número na API.
import { env, graph, handle, json, missingEnv, readJson, requireMember, HttpError } from '../_lib/wa.js';

export const GET = handle(async (request) => {
  await requireMember(request);
  const missing = missingEnv();
  const out = { missing, webhookUrl: new URL('/api/whatsapp/webhook', request.url).toString(), phone: null, subscribed: null, errors: [] };
  if (env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_ID')) {
    const base = 'display_phone_number,verified_name,quality_rating,name_status,code_verification_status,platform_type,throughput';
    try { out.phone = await graph(env('WHATSAPP_PHONE_ID'), { query: { fields: base + ',whatsapp_business_manager_messaging_limit' } }); }
    catch { try { out.phone = await graph(env('WHATSAPP_PHONE_ID'), { query: { fields: base } }); } catch (e) { out.errors.push('Número: ' + e.message); } }
  }
  if (env('WHATSAPP_TOKEN') && env('WHATSAPP_WABA_ID')) {
    try { const s = await graph(`${env('WHATSAPP_WABA_ID')}/subscribed_apps`); out.subscribed = (s.data || []).length > 0; }
    catch (e) { out.errors.push('Webhook: ' + e.message); }
  }
  return json(out);
});

export const POST = handle(async (request) => {
  await requireMember(request);
  const body = await readJson(request);
  if (body.action === 'subscribe') {
    await graph(`${env('WHATSAPP_WABA_ID')}/subscribed_apps`, { method: 'POST' });
    return json({ ok: true });
  }
  if (body.action === 'register') {
    // Ativa o número na API. O PIN de 6 dígitos vira a "confirmação em duas etapas" do número: guarde-o.
    const pin = String(body.pin || '');
    if (!/^\d{6}$/.test(pin)) throw new HttpError(400, 'O PIN precisa ter 6 números.');
    try { await graph(`${env('WHATSAPP_PHONE_ID')}/register`, { method: 'POST', body: { messaging_product: 'whatsapp', pin } }); }
    catch (e) { throw new HttpError(400, e.message); }
    return json({ ok: true });
  }
  throw new HttpError(400, 'Ação inválida.');
});
