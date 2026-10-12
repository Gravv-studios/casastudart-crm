# Disparos de WhatsApp no CRM do Hugo: o que comprar e o que configurar

O CRM já tem a tela **Disparos WhatsApp**. Nela o Hugo escolhe os estados (por exemplo SP, RJ e DF), o gênero e as regras. Depois escolhe a mensagem, faz um teste no próprio celular e dispara. O envio usa a **API oficial da Meta (WhatsApp Cloud API)** no número novo da Casa Studart, então não tem risco de banimento por "disparo pirata".

Para funcionar, falta ligar as contas: chip, Meta, Supabase e Vercel. Este guia mostra a ordem. Leva de 1 a 2 horas, mais a espera de aprovação da Meta (minutos a 2 dias).

---

## Resumo do que o Hugo precisa ter

| Item | Para quê | Custo |
|---|---|---|
| Chip novo (qualquer operadora), ativo e com recarga | Ser o número oficial da Casa no WhatsApp | O do chip |
| Um celular qualquer para pôr o chip no dia da configuração | Receber o código por SMS ou ligação | — |
| Conta no Facebook do Hugo (pessoal) | Ser administrador do Gerenciador de Negócios | Grátis |
| CNPJ e documento da empresa, e acesso ao domínio casastudart.com.br | Verificar a empresa na Meta (sobe o limite acima de 250 pessoas/dia) | Grátis |
| Cartão de crédito | A Meta cobra por mensagem de marketing entregue | ≈ R$ 0,31 a 0,38 por mensagem de marketing |

**Importante sobre o chip:** **não** instale o WhatsApp (nem o Business) nesse número. Um número que está na API não funciona no aplicativo do celular. Se o chip já vier com WhatsApp, apague a conta nele antes (WhatsApp → Configurações → Conta → Apagar conta). As conversas com clientes ficam na aba **Respostas** do CRM. (Existe um modo da Meta chamado "coexistência", que mantém o WhatsApp Business no celular junto com a API, mas ele só vale para número que já está em uso no aplicativo e é ligado por um parceiro da Meta. Este guia não usa esse modo.)

---

## 1. Gerenciador de Negócios (Meta Business) da Casa Studart

1. Com o Facebook do Hugo, acesse https://business.facebook.com e crie o portfólio **Casa Studart** (se ainda não existir).
2. Em **Configurações → Pessoas**, adicione o Marcos como **administrador**.
3. **Recomendado:** em **Configurações → Central de segurança → Verificação da empresa**, envie CNPJ, comprovante e domínio. Isso aumenta o limite diário acima das 250 pessoas iniciais (o novo teto aparece na aba Conexão do CRM) e ajuda a aprovar o nome "Casa Studart".

## 2. App da Meta com WhatsApp

1. Acesse https://developers.facebook.com/apps → **Criar app** → tipo **Empresa (Business)** → ligue ao portfólio Casa Studart.
2. No painel do app, adicione o produto **WhatsApp** e clique em **Configurar**. Isso cria a **conta do WhatsApp Business (WABA)**.
3. Em **Configurações do app → Básico**:
   - copie a **Chave secreta do aplicativo** (é o `WHATSAPP_APP_SECRET`);
   - preencha a URL da política de privacidade (ex.: `https://casastudart.com.br/politica-de-privacidade`);
   - depois **publique o app** (modo "Ao vivo"/Live).

## 3. Colocar o número novo

1. No app: **WhatsApp → Configuração da API → Adicionar número de telefone**.
2. Nome de exibição: **Casa Studart**. Escolha a categoria (Varejo / Casa e decoração).
3. Escolha receber o código por **SMS** ou **ligação** no chip novo e digite o código.
4. Na mesma página, copie:
   - **Identificação do número de telefone** → `WHATSAPP_PHONE_ID`
   - **Identificação da conta do WhatsApp Business** → `WHATSAPP_WABA_ID`
5. A ativação final do número (PIN de 6 dígitos) se faz **pelo próprio CRM**, na aba **Disparos WhatsApp → Conexão** (passo 9).

## 4. Forma de pagamento

No **Gerenciador do WhatsApp** (business.facebook.com/wa/manage) → **Configurações da conta → Pagamento**, cadastre o cartão. Sem isso, as mensagens de marketing são recusadas (o CRM avisa "Problema de pagamento").

## 5. Token permanente

1. business.facebook.com → **Configurações → Usuários → Usuários do sistema → Adicionar**: nome "CRM Casa Studart", função **Administrador**.
2. **Atribuir ativos**: o **app** (controle total) e a **conta do WhatsApp** (controle total).
3. **Gerar token** → escolha o app → validade **Nunca** → permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
4. Copie o token (aparece uma vez só). Ele é o `WHATSAPP_TOKEN`.

## 6. Supabase (banco do CRM)

1. No projeto do Supabase da Casa: **SQL Editor → New query** → cole todo o arquivo `supabase/whatsapp.sql` → **Run**. Ele cria as tabelas de disparos, autorizações e respostas.
2. **Project Settings → API Keys**: copie a chave **service_role / secret**. Ela é o `SUPABASE_SERVICE_ROLE_KEY`.
   - Ela dá acesso total ao banco: só pode ir na Vercel, **nunca** no código nem com prefixo `VITE_`.

## 7. Vercel

Projeto `casastudart-crm` → **Settings → Environment Variables** (marque Production e Preview):

| Variável | Valor |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | chave do passo 6 |
| `WHATSAPP_TOKEN` | token do passo 5 |
| `WHATSAPP_PHONE_ID` | do passo 3 |
| `WHATSAPP_WABA_ID` | do passo 3 |
| `WHATSAPP_APP_SECRET` | do passo 2 |
| `WHATSAPP_VERIFY_TOKEN` | invente uma senha (ex.: `casastudart-webhook-2026`) |

`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` já existem e continuam iguais. Depois de salvar: **Deployments → ⋯ → Redeploy**.

## 8. Webhook (entregas, leituras e respostas)

1. No app da Meta: **WhatsApp → Configuração → Webhook → Editar**:
   - URL de retorno: `https://casastudart-crm.vercel.app/api/whatsapp/webhook` (troque pelo domínio definitivo se mudar)
   - Token de verificação: o mesmo `WHATSAPP_VERIFY_TOKEN`
2. Em **Campos do webhook**, assine **messages**.

## 9. Conferir tudo no CRM

Entre no CRM → **Disparos WhatsApp → Conexão → Verificar**. Tudo deve ficar verde:

- Variáveis na Vercel: todas configuradas.
- Número: aparece "+55 … · Casa Studart". Se aparecer **Ativar o número na API**, crie um PIN de 6 números, **guarde-o** (ele protege o número) e clique em **Ativar**.
- Webhook: se estiver amarelo, clique em **Ligar webhook na conta**.

## 10. Criar os modelos de mensagem (templates)

Promoção pela API oficial **só sai com modelo aprovado pela Meta**. Crie em **Gerenciador do WhatsApp → Modelos de mensagem → Criar modelo**, categoria **Marketing**, idioma **Português (BR)**. A aprovação costuma levar de minutos a algumas horas. Sugestões prontas:

**a) `convite_ofertas`**: pede autorização para mandar ofertas. Use primeiro.
> Olá, {{1}}! Aqui é a Casa Studart. 🏡 Quer receber nossas ofertas e novidades por aqui no WhatsApp? É só tocar em uma opção abaixo.
> Botões de resposta rápida: **Quero receber** · **Não quero receber**

**b) `promo_estado`**: a promoção por estado.
> Cabeçalho: **Imagem**
> Oi, {{1}}! Temos uma condição especial para clientes de {{2}}: {{3}}. Válido até {{4}}. Quer garantir o seu? Responda esta mensagem que a gente te atende.
> Rodapé: *Para não receber mais, toque em "Não quero receber".*
> Botões: **Ver ofertas** (link `https://casastudart.com.br/{{1}}`) · **Não quero receber** (resposta rápida)

**c) `novidades_casa`**: novidades sem desconto.
> Olá, {{1}}! Chegaram novidades na Casa Studart que combinam com você: {{2}}. Quer ver as fotos? É só responder aqui.
> Botão: **Não quero receber**

Na hora de disparar, o CRM pergunta como preencher cada `{{n}}`: primeiro nome do cliente, nome completo, cidade, estado ou um texto fixo (ex.: "15% de desconto em sofás"). A imagem do cabeçalho é um link https; pode ser uma foto já publicada no site.

Quando o cliente toca **Quero receber**, ele vira **autorizado** sozinho. Quando toca **Não quero receber**, ou escreve SAIR ou PARAR, sai da lista para sempre e nenhum disparo futuro inclui ele.

---

## Como o Hugo dispara (depois de tudo ligado)

1. **Disparos WhatsApp → Novo disparo**.
2. **Para quem:** clique nos estados (ex.: SP, RJ e DF). Opcionalmente, escolha o gênero. Deixe ligado "Só quem autorizou receber" e "Não enviar para quem recebeu nos últimos 7 dias".
3. **Mensagem:** escolha o modelo aprovado, preencha as variáveis e veja a prévia.
4. **Teste:** digite o WhatsApp do Hugo e clique em **Enviar teste**. Confira no celular.
5. **Confirmar:** confira o número de pessoas e o custo estimado, marque "Conferi" e clique em **Disparar**.
6. O CRM envia em lotes e mostra o progresso. Dá para **pausar**, **continuar** ou **cancelar o restante**. A lista final mostra quem recebeu, entregou, leu ou falhou, e pode ser baixada.
7. As respostas dos clientes aparecem em **Respostas**. Dá para responder por ali em até 24 h depois da última mensagem do cliente (regra do WhatsApp).

O envio roda **enquanto a tela está aberta**. Se fechar no meio, abra o disparo e clique em **Continuar envio**: ninguém recebe duas vezes.

---

## Regras que evitam problema

- **Autorização:** a Meta exige que o cliente tenha aceitado receber mensagens da empresa. A base importada (Wix + WooCommerce) **não tem** essa autorização registrada para WhatsApp. Por isso a regra "Só quem autorizou" vem ligada. Caminhos para formar a lista:
  1. Registrar à mão em **Respostas → Autorizações** quem aceitou no balcão, no site ou numa conversa (cole os números, um por linha).
  2. Pôr no site e no checkout uma caixa "Quero receber ofertas pelo WhatsApp".
  3. Mandar o modelo `convite_ofertas`. Atenção: ele mesmo já é uma mensagem de marketing para quem ainda não autorizou. Se muita gente bloquear ou denunciar, a Meta baixa a qualidade do número. Comece com um estado pequeno e veja a reação.
  Desmarcar a regra é decisão do Hugo, por conta e risco dele.
- **Limite diário:** um número novo começa podendo falar com **250 pessoas por 24 h**. Com a empresa verificada ou com bom uso, o limite sobe sozinho; a Meta mudou os degraus em 2026, então vale o número que aparece na aba **Conexão**. O limite é do portfólio inteiro, não de cada número. Se o disparo passar do limite, o CRM **pausa sozinho** e mostra o motivo. É só clicar em Continuar no dia seguinte.
- **Frequência:** no máximo 1 promoção por semana para a mesma pessoa. A Meta também segura mensagens de marketing quando a pessoa recebe demais (aparece como "A Meta não entregou…" na lista).
- **Qualidade:** a aba Conexão mostra a qualidade do número (verde, amarelo ou vermelho). No amarelo, diminua a frequência. No vermelho, pare e revise público e mensagem.
- **Custo:** cerca de R$ 0,31 a 0,38 por mensagem de marketing entregue (tabela da Meta para o Brasil; confira em developers.facebook.com → WhatsApp → Pricing). As respostas do Hugo dentro de 24 h são grátis.

## O que já está pronto no código

- Tela **Disparos WhatsApp** (`components/dispatch.tsx`), com 4 abas: Novo disparo, Disparos feitos, Respostas e Conexão. Em Novo disparo dá para clicar em um estado, juntar vários, ou marcar uma região inteira (Sudeste, Sul, Centro-Oeste, Nordeste, Norte); a tela soma quantos contatos entram por estado.
- Funções do servidor em `api/whatsapp/*` (Vercel): modelos, teste, criar disparo, enviar em lotes, pausar/continuar/cancelar, webhook, respostas e autorizações. O token da Meta fica só no servidor.
- Banco: `supabase/whatsapp.sql`.
- Testes com Meta e Supabase simulados: `npm run test:whatsapp` (16 cenários, sem envio real).
