// GET: modelos de mensagem da conta (aprovados e em análise), já com as variáveis identificadas.
import { env, graph, handle, json, requireMember } from '../_lib/wa.js';

function vars(text = '') { return [...new Set([...text.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((m) => m[1]))]; }

export const GET = handle(async (request) => {
  await requireMember(request);
  const list = [];
  let after = '';
  for (let page = 0; page < 5; page++) {
    const data = await graph(`${env('WHATSAPP_WABA_ID')}/message_templates`, { query: { fields: 'name,language,status,category,components,parameter_format', limit: '100', ...(after ? { after } : {}) } });
    list.push(...(data.data || []));
    after = data.paging?.cursors?.after && data.paging?.next ? data.paging.cursors.after : '';
    if (!after) break;
  }
  const templates = list.map((t) => {
    const comps = t.components || [];
    const header = comps.find((c) => c.type === 'HEADER');
    const body = comps.find((c) => c.type === 'BODY');
    const footer = comps.find((c) => c.type === 'FOOTER');
    const buttons = comps.find((c) => c.type === 'BUTTONS')?.buttons || [];
    return {
      name: t.name, language: t.language, status: t.status, category: t.category,
      named: t.parameter_format === 'NAMED',
      header: header ? { format: header.format, text: header.text || '', vars: vars(header.text) } : null,
      body: body?.text || '', bodyVars: vars(body?.text),
      footer: footer?.text || '',
      buttons: buttons.map((b, index) => ({ index, type: b.type, text: b.text, url: b.url || '', dynamic: b.type === 'URL' && /\{\{/.test(b.url || '') })),
    };
  }).sort((a, b) => (a.status === 'APPROVED' ? 0 : 1) - (b.status === 'APPROVED' ? 0 : 1) || a.name.localeCompare(b.name));
  return json({ templates });
});
