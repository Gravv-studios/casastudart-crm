# CRM do Hugo — publicar com banco e login (Supabase + Vercel)

O CRM tem dois modos:

- **Demonstração** (sem variáveis): dados de exemplo, salvos só no navegador.
- **Banco** (com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na Vercel): tela de login, dados no Supabase do Hugo, os mesmos em qualquer aparelho. É o modo de entrega.

## 1. Criar o banco (uma vez, ~10 min)

1. Em https://supabase.com crie a conta da Casa Studart e um projeto (plano grátis, região São Paulo). Guarde a senha do banco num lugar seguro.
2. **SQL Editor → New query** → cole todo o arquivo `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers**: deixe **E-mail** ligado e **desligue "Allow new users to sign up"** (ninguém cria conta sozinho).
4. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do CRM (hoje `https://casastudart-crm.vercel.app`; depois o domínio definitivo) e adicione o mesmo em *Redirect URLs*. É para onde o link de "Esqueci a senha" leva.
5. **Authentication → Users → Add user → Create new user**: crie o usuário do Hugo (e o seu), com senha, marcando *Auto confirm*.
6. Libere os e-mails no CRM (SQL Editor):
   ```sql
   insert into public.crm_members (email, name) values
     ('email-do-hugo@...', 'Hugo'),
     ('maxsfigueiredo@gmail.com', 'Marcos (GRAVV)')
   on conflict do nothing;
   ```
   Usuário que faz login sem estar nessa lista vê "Acesso não liberado" e não lê nada (regra no próprio banco, RLS).

## 2. Ligar na Vercel

1. Supabase → **Project Settings → API**: copie a **Project URL** e a chave **anon / publishable** (a pública). **Nunca** use a `service_role` / secret no site.
2. Vercel → projeto `casastudart-crm` → **Settings → Environment Variables** → adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Production e Preview).
3. **Deployments → ⋯ → Redeploy** (as variáveis entram no build).

## 3. Carregar os clientes

1. Entre no CRM com o seu usuário.
2. **Configurações e guia → Importar base de clientes** → escolha `casa-studart-importar-no-crm.json` (fica na pasta privada `CASA-STUDART-PARA-CLAUDE/02-DADOS-PRIVADOS/etapa-3-duplicados/`, **não** no GitHub).
3. Pode importar de novo quando a base for atualizada: atualiza pelo e-mail, não duplica e mantém o que o Hugo já editou (gênero, situação, responsável, observações).

## 4. Domínio definitivo

Vercel → Settings → Domains → adicione o domínio (ex.: `crm.casastudart.com.br`) e crie o CNAME que a Vercel mostrar no DNS do Hugo. Depois atualize o *Site URL* / *Redirect URLs* no Supabase (passo 1.4). Nada no código muda.

## Segurança

- Chave pública no site + RLS no banco: sem login liberado, a API não devolve nenhum registro.
- Histórico (`crm_activity`) não pode ser editado nem apagado pelo app.
- Dados pessoais só no Supabase; o repositório não tem nenhum cliente real.
