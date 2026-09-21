import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'CRM do Hugo | Gestão comercial e financeira', description: 'Contatos, WhatsApp, sites, contas a pagar e receber e fluxo de caixa em um só lugar.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
