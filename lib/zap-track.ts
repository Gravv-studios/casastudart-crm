import type { Entry } from './model';
import { supabase } from './remote-store';

/**
 * Acompanhamento dos disparos assistidos: quem recebeu cada mensagem e o que aconteceu depois.
 * Fica gravado no próprio registro da mensagem (campo `log`), para valer em qualquer aparelho.
 * Formato: { "<telefone>": ["<situação>", <quando foi marcada>, <quando foi enviada>] }, em segundos desde 1970.
 */
export type Track = Record<string, [string, number, number?]>;
/** Data do envio: não muda quando a situação é atualizada depois. */
export const sentAt = (item: [string, number, number?]) => item[2] ?? item[1];
/** x = desmarcado (mantido para a mesclagem entre aparelhos saber que foi desfeito). */
export const STATUS: [string, string][] = [['e', 'Enviada'], ['v', 'Visualizou'], ['r', 'Respondeu'], ['c', 'Comprou']];
export const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS);
const RANK: Record<string, number> = { e: 1, v: 2, r: 3, c: 4 };
export const reached = (status: string | undefined, at: string) => (RANK[status || ''] || 0) >= RANK[at];

export function parseLog(raw?: string): Track {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Track = {};
    for (const [phone, item] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'number') out[phone] = typeof item[2] === 'number' ? [item[0], item[1], item[2]] : [item[0], item[1]];
    }
    return out;
  } catch { return {}; }
}
/** Junta dois registros; para o mesmo telefone vale a marcação mais recente. */
export function mergeLogs(base: Track, changes: Track): Track {
  const out: Track = { ...base };
  for (const [phone, item] of Object.entries(changes)) if (!out[phone] || item[1] >= out[phone][1]) out[phone] = item;
  return out;
}
export const activeLog = (log: Track) => Object.fromEntries(Object.entries(log).filter(([, item]) => item[0] !== 'x')) as Track;
export const optedOut = (data: Record<string, string>) => /whatsapp:\s*n[aã]o quer/i.test(data.consent || '');

/**
 * Grava só o registro da mensagem, relendo antes para não apagar o que outro aparelho marcou.
 * Não passa pelo fluxo geral de salvar (que recarrega a base inteira e escreve no histórico).
 */
export async function patchCampaign(id: string, apply: (data: Record<string, string>) => Record<string, string>): Promise<Entry> {
  const sb = supabase();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await sb.from('crm_entries').select('id,kind,data,updated_at').eq('id', id).eq('kind', 'campaign').maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error('Mensagem não encontrada. Atualize o painel.');
    const next = apply((row.data ?? {}) as Record<string, string>);
    const { data: rows, error: failed } = await sb.from('crm_entries').update({ data: next }).eq('id', id).eq('updated_at', row.updated_at).select('id,kind,data,updated_at');
    if (failed) throw new Error(failed.message);
    if (rows?.length) return { id: rows[0].id, kind: rows[0].kind, updatedAt: rows[0].updated_at, data: rows[0].data ?? {} };
  }
  throw new Error('Não foi possível salvar agora. Tente de novo.');
}

/** Reduz a foto para caber no registro e carregar rápido no celular. */
export function shrinkImage(file: File, max = 1080, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!ctx) { reject(new Error('Não foi possível preparar a foto.')); return; }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Este arquivo não é uma imagem que eu consiga abrir.')); };
    img.src = url;
  });
}
/** A área de transferência só aceita PNG. */
export function pngBlob(dataUrl: string): Promise<Blob | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0); canvas.toBlob(blob => resolve(blob), 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
