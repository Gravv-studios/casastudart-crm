import type { Entry } from './model';

export function segmentContacts(entries: Entry[], state: string) {
  return entries.filter(e => e.kind === 'contact' && e.data.status === 'Ativo' &&
    (state === 'all' || (state === 'unknown' ? !e.data.state : e.data.state === state)));
}
export function testPhone(value: string) {
  if (!/^[+\d\s().-]+$/.test(value)) return '';
  const digits = value.replace(/\D/g, '');
  const normalized = value.trim().startsWith('+') ? digits : digits.length === 10 || digits.length === 11 ? '55' + digits : digits;
  return /^[1-9]\d{9,14}$/.test(normalized) ? normalized : '';
}
export function testEmail(value: string) {
  return /^[^\s,@?&#%:]+@[^\s,@?&#%:]+\.[^\s,@?&#%:]+$/.test(value) ? value : '';
}
export function previewMessage(template: string, name: string) {
  return template.replaceAll('{nome}', name.trim().split(/\s+/)[0] || 'cliente');
}
