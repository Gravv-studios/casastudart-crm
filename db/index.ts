import { env } from 'cloudflare:workers';
export function getDb() {
  if (!env.DB) throw new Error('Banco de demonstração indisponível.');
  return env.DB;
}