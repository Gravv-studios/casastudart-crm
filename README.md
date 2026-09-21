# CRM do Hugo

CRM comercial, operacional e financeiro com contatos, campanhas de WhatsApp, alterações de sites, tarefas, contas a pagar e receber, fluxo de caixa e relatórios.

## Áreas

- Visão geral das prioridades e do caixa.
- Contatos e histórico de atendimento.
- Mensagens de ofertas para abertura assistida no WhatsApp.
- Pedidos e versões de textos dos sites.
- Contas a pagar e receber, atrasos, recorrências e separação entre empresa e pessoal.
- Fluxo de caixa previsto e realizado.
- Tarefas, agenda, relatórios, histórico e backup.

## GitHub Pages

O workflow `.github/workflows/pages.yml` valida e publica automaticamente a versão estática a cada envio para `master` ou `main`.

Na edição do GitHub Pages, os dados ficam salvos no navegador de cada dispositivo. Use o backup em **Configurações e guia** para preservar os registros. Um banco compartilhado exige uma API/banco externo porque o GitHub Pages não executa servidor.

## Desenvolvimento local

Requisitos: Node 22.13 ou superior e npm.

1. `npm ci`
2. `npm run dev`
3. Abra `http://localhost:3000`

O banco local fica em `.wrangler/state` e é separado do armazenamento do GitHub Pages.

## Verificações

- `npm run check`: validação de tipos.
- `npm test`: regras, cálculos e reconciliação financeira.
- `npm run test:api`: persistência e mutações da API local.
- `npm run build`: aplicação completa com servidor.
- `npm run build:pages`: edição estática hospedável no GitHub Pages.

## Limites

O CRM prepara mensagens e abre a conversa; não dispara WhatsApp automaticamente. Integrações bancárias, WordPress e banco compartilhado exigem credenciais e serviços externos. Os registros iniciais são exemplos e devem ser substituídos por dados reais autorizados antes do uso operacional.
