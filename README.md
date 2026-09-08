# Casa Studart — CRM de demonstração

Demonstração administrativa independente do WordPress. Interface em português, identidade marrom e dourada, banco D1 próprio e base inicial fictícia. Não importa dados da loja nem envia mensagens.

## Áreas disponíveis

- Visão geral: indicadores financeiros históricos, participação de categorias ilustrativas e pendências administrativas.
- Contatos: criar, editar, pesquisar, filtrar, arquivar, exportar CSV, abrir ficha e adicionar anotações.
- Atendimentos: solicitações administrativas em Novo, Em andamento, Aguardando e Resolvido, com responsável, prioridade, prazo e contato vinculado.
- Tarefas: criar, editar, concluir, reabrir, excluir e filtrar por responsável ou situação.
- Agenda mensal: navegar entre meses, selecionar dias e criar compromissos; usa a mesma base das tarefas.
- Relatórios: receita bruta, estornos, valor líquido, médias, unidades, distribuição por origem e pagamento; exportação por período e impressão.
- Histórico: últimas 200 alterações persistidas.
- Configurações e guia: explicações, roteiro de apresentação e exportação JSON dos registros administrativos.

## Limites da demonstração

Os 90 registros financeiros, as quatro linhas A–D e os cadastros iniciais são fictícios. A referência temporal é 08/09/2026. O mês de setembro é parcial; não há comparação enganosa com meses completos. Valor líquido não significa lucro, pois não inclui custos, taxas ou tributos. O histórico financeiro é fixo, somente para leitura. Os registros administrativos são editáveis e persistentes.

Não há recuperação de carrinhos, campanhas, funil comercial, transações, envio de e-mail, WhatsApp, importação do WordPress ou conexão com pagamentos. O nome Hugo no canto identifica o perfil de apresentação; não constitui autenticação própria ou trilha de autoria individual. A publicação no Sites usa acesso privado do proprietário. Antes de uso real, definir usuários, autorização por função, minimização de dados, retenção, backups e integrações específicas.

## Desenvolvimento

Requisitos: Node 22.13 ou superior e npm. Instale com `npm ci`.

1. `npm exec wrangler d1 migrations apply DB -- --local --config wrangler.local.jsonc`
2. `npm run dev -- --host 127.0.0.1 --port 8911`
3. Abra `http://localhost:8911`.

O banco local fica em `.wrangler/state`. O banco publicado pertence ao projeto Sites indicado em `.openai/hosting.json`; são ambientes separados. A carga inicial usa inserções idempotentes e um marcador para não restaurar registros removidos em cada acesso.

## Verificações

- `npm run check`: tipos.
- `npm run lint`: código da aplicação. O catálogo vendorizado `components/ui` e o hook gerado `hooks/use-mobile.ts` permanecem sem alterações e fora do lint local.
- `npm test`: cálculos, reconciliação por mês, datas inválidas, campos e exportação CSV.
- `npm run test:api`: somente em localhost. Verifica persistência, duplicidade de e-mail, conflito de edição, rejeição de origem externa, remoção e registro de histórico. Remove o cadastro temporário ao terminar.
- `npm run build`: artefato para Cloudflare Workers / Sites.

Os registros são validados no servidor e as consultas usam parâmetros preparados. Atualizações usam controle por revisão. A API não usa cache; mutações exigem JSON e rejeitam origem externa. E-mails são verificados antes da criação para evitar duplicações comuns. Em produção multiusuário, reforçar a unicidade com índice dedicado e identidade real do autor.

## Publicação

O projeto tem repositório próprio, sem arquivos do WordPress ou dos backups do cliente. Usar Sites para salvar e publicar uma versão privada. As migrações Drizzle são incluídas no pacote. Não publicar com acesso aberto nem usar os dados desta demonstração como relatório real da loja.
