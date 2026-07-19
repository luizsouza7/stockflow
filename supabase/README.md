# Supabase — preparação da Parte 5

Este diretório contém SQL versionado para a futura camada de nuvem do StockFlow. A migration não é executada pelo aplicativo e não transfere dados do IndexedDB.

## Configuração local do frontend

1. Copie `.env.example` para `.env.local`.
2. Preencha `VITE_SUPABASE_URL` com a URL pública do projeto.
3. Preencha `VITE_SUPABASE_ANON_KEY` com a chave pública anon/publishable.
4. Reinicie o Vite.

Nunca coloque chave `service_role`, chave secreta, senha do banco ou token administrativo em variáveis `VITE_*`. Tudo que usa o prefixo `VITE_` pode ser incluído no bundle do navegador.

Sem essas variáveis, a página Conta informa que o ambiente não está configurado e todo o funcionamento local permanece disponível.

## Migration PostgreSQL

`migrations/202607170001_part5_auth_rls.sql` pode ser revisada e aplicada futuramente pelo painel SQL do Supabase ou pela CLI oficial, se ela vier a ser adotada. O projeto não a executa automaticamente.

O modelo contém perfis, estabelecimentos, memberships, categorias, produtos e movimentações. As tabelas de negócio usam `business_id`; RLS autoriza somente usuários com membership ativa, usando `auth.uid()`. Exclusão física não é liberada pelas policies: o modelo preserva `deleted_at` para soft delete.

Auth e RLS não significam sincronização. Não existem upload/download automático, outbox, push, pull, retry ou resolução de conflitos nesta parte.
