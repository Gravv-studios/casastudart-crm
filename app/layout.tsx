import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Casa Studart | CRM de demonstração', description: 'Gestão de contatos, atendimentos e relatórios históricos. Demonstração com dados fictícios.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}