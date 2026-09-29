# CRM do Hugo

CRM comercial, operacional e financeiro com contatos, campanhas de WhatsApp, alterações de sites, tarefas, contas a pagar e receber, fluxo de caixa e relatórios.

## Áreas

- Visão geral das prioridades e do caixa.
- Contatos e histórico de atendimento.
- Mensagens de ofertas para abertura assistida no WhatsApp.
- QR Codes para avaliação direta no Google e acesso ao perfil do Instagram, com download em PNG.
- Pedidos e versões de textos dos sites.
- Contas a pagar e receber, atrasos, recorrências e separação entre empresa e pessoal.
- Fluxo de caixa previsto e realizado.
- Tarefas, agenda, relatórios, histórico e backup.

## Vercel

O repositório oficial é `https://github.com/Gravv-studios/casastudart-crm`. Ele está conectado ao projeto `casastudart-crm` da Vercel: cada commit enviado à branch `master` dispara automaticamente uma nova publicação.

O arquivo `vercel.json` configura a publicação da versão estática na Vercel a partir desse repositório.

Com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configuradas na Vercel, o CRM pede login e salva tudo no Supabase (mesmos dados em qualquer aparelho). Sem elas, roda em modo demonstração, com dados no navegador. Passo a passo em `COMO-PUBLICAR.md`; banco em `supabase/schema.sql`.

Em **Avaliações e QR**, os destinos oficiais da Casa Studart já vêm preenchidos: a ficha identificada no Google Maps e `@casastudart` no Instagram. Os QR Codes são gerados no navegador, sem serviço externo. Alterações manuais dos links ficam salvas somente no navegador usado para configurá-los. Teste cada link no celular antes de compartilhar a imagem com clientes.

## Desenvolvimento local

Requisitos: Node 22.13 ou superior e npm.

1. `npm ci`
2. `npm run dev`
3. Abra `http://localhost:3000`

O banco local fica em `.wrangler/state` e é separado do armazenamento da edição publicada.

## Verificações

- `npm run check`: validação de tipos.
- `npm test`: regras, cálculos e reconciliação financeira.
- `npm run test:api`: persistência e mutações da API local.
- `npm run build`: aplicação completa com servidor.
- `npm run build:pages`: edição estática preparada para GitHub Pages.
- `npm run build:vercel`: edição estática preparada para Vercel.

## Limites

O CRM prepara mensagens e abre a conversa; não dispara WhatsApp automaticamente. Integrações bancárias, WordPress/WooCommerce e API oficial do WhatsApp exigem credenciais e serviços externos. No modo demonstração os registros iniciais são exemplos; no modo banco o CRM começa vazio e recebe a base pela importação.
