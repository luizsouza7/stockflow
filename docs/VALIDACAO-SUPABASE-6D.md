# Validação operacional Supabase — Etapa 6D

## 1. Objetivo

Esta etapa registrou a validação operacional, em um ambiente Supabase real de teste, da integração preparada na Parte 5 e do push remoto manual implementado na Parte 6C. A validação abrangeu autenticação, Row Level Security (RLS), contexto de estabelecimento, membership, aplicação das migrations, RPCs de push, envio protegido de categorias e produtos e idempotência remota.

O objetivo não foi implementar uma nova funcionalidade, mas comprovar que o fluxo já implementado funciona fora dos mocks e testes automatizados, preservando os limites declarados da Parte 6.

## 2. Escopo validado

Foram validados operacionalmente:

- configuração local do frontend por `.env.local`;
- conexão da Supabase CLI com um projeto real de teste;
- conferência e aplicação das migrations das Partes 5 e 6C;
- criação e login de usuário real pela página Conta;
- criação ou confirmação de business e membership;
- listagem e seleção do estabelecimento no aplicativo;
- associação explícita das pendências locais ao business;
- push manual de categorias e produtos;
- chegada dos dados às tabelas remotas protegidas por RLS;
- registro das operações em `sync_operations`;
- comportamento idempotente do protocolo remoto;
- bloqueio seguro de `movement.created`.

## 3. Escopo não validado nesta etapa

A etapa 6D não implementou nem validou:

- pull remoto;
- sincronização bidirecional completa;
- detecção e resolução real de conflitos;
- central de conflitos;
- RPC atômica para movimentações de estoque;
- sincronização segura de `movement.created`;
- concorrência de estoque entre múltiplos dispositivos;
- sincronização automática;
- retry automático acionado por rede, login ou Service Worker.

## 4. Ambiente utilizado

A validação utilizou:

- aplicação StockFlow executada localmente em ambiente de desenvolvimento;
- projeto Supabase real destinado a teste controlado;
- Supabase CLI executada por `npx`;
- autenticação da CLI realizada pelo fluxo oficial;
- projeto local vinculado por project ref;
- arquivo `.env.local` contendo localmente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

Representação sanitizada da configuração:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key omitida>
```

O project ref, a URL real, a anon key, tokens da CLI, senhas e UUIDs reais não são registrados neste documento. O `.env.local` permaneceu fora do Git e não foi commitado.

## 5. Migrations aplicadas

Foram conferidos os arquivos:

- `supabase/migrations/202607170001_part5_auth_rls.sql`;
- `supabase/migrations/202607190001_part6c_manual_push.sql`.

Com o projeto local vinculado a `<project-ref omitido>`, foram executados:

```powershell
npx supabase db push --dry-run
npx supabase db push
```

O dry-run informou que as duas migrations seriam aplicadas. Em seguida, o push aplicou ambas com sucesso.

## 6. Resultado da aplicação das migrations

O comando de aplicação terminou com sucesso. Durante a execução foi observado o aviso:

```text
NOTICE (42710): extension "pgcrypto" already exists, skipping
```

O aviso foi considerado normal e não impeditivo: a extensão `pgcrypto` já existia no projeto Supabase, portanto sua criação idempotente foi ignorada e a execução prosseguiu.

Com isso, ficaram disponíveis no ambiente real de teste:

- modelo de Auth, businesses e memberships;
- tabelas de categorias, produtos e movimentações protegidas por RLS;
- ledger `sync_operations`;
- RPCs versionadas e idempotentes para o push de categorias e produtos.

## 7. Validação de autenticação

A confirmação de e-mail do Supabase foi desativada no ambiente controlado para simplificar o teste operacional. Nenhuma alteração dessa configuração integra o código-fonte do StockFlow.

Um usuário foi criado e conseguiu realizar login pelo aplicativo. A página Conta reconheceu a sessão autenticada e disponibilizou o fluxo manual de estabelecimento e push. Assim, o Auth preparado na Parte 5 foi validado operacionalmente contra o Supabase real.

Nenhuma senha utilizada no teste é registrada neste documento.

## 8. Validação de business e membership

Um business foi criado ou confirmado no Supabase e a membership do usuário autenticado foi verificada. Os identificadores são representados somente pelos placeholders seguros:

- usuário: `<user-id>`;
- estabelecimento: `<business-id>`.

Uma tentativa adicional de inserir a mesma membership retornou erro de `duplicate key`. Esse resultado foi interpretado corretamente como evidência de que a relação já existia, e não como ausência de acesso.

Após a confirmação da membership, o estabelecimento foi listado e selecionado na página Conta. O contexto ativo permaneceu condicionado à sessão e à validação de membership.

## 9. Validação do push manual

O fluxo operacional foi executado na seguinte ordem:

1. categoria local criada;
2. produto local criado;
3. pendências locais associadas explicitamente ao business selecionado;
4. ação manual de envio executada;
5. categoria e produto recebidos pelo Supabase;
6. operações correspondentes registradas em `sync_operations`.

A associação das pendências não realizou envio por si só. O acesso remoto ocorreu somente na ação manual separada. A presença dos registros de operação e o resultado observado confirmaram operacionalmente a idempotência baseada em `business_id` e `idempotency_key`.

O usuário responsável pela validação concluiu o roteiro e declarou: “tudo ok”.

## 10. Validação de bloqueios de segurança

Também foram confirmados os limites de segurança da 6C:

- o push não ocorre automaticamente;
- associar pendências não envia dados;
- o envio depende de ação manual na página Conta;
- a sessão e o estabelecimento são pré-requisitos;
- `movement.created` permanece bloqueado e não é enviado às tabelas remotas;
- login não dispara push;
- retorno online não dispara push;
- Service Worker não dispara sincronização;
- pull remoto não existe;
- conflitos reais não são resolvidos nesta etapa.

O bloqueio de movimentações é intencional e permanece necessário até existir uma RPC atômica capaz de validar e atualizar o estoque remoto com segurança.

## 11. Problemas encontrados e soluções

### Versão antiga por cache/Service Worker

Inicialmente, o aplicativo exibiu uma versão antiga que ainda não apresentava o fluxo atual da página Conta. A solução foi limpar o cache e o Service Worker antigo e abrir a versão atual do aplicativo. Essa ação foi operacional e não exigiu alteração no Service Worker do repositório.

### Confirmação de e-mail no ambiente de teste

O uso inicial de um e-mail fictício dificultou o login devido à confirmação de e-mail. Para o ambiente controlado, a confirmação foi desativada e o usuário foi recriado ou autenticado novamente. Nenhuma senha ou endereço utilizado é registrado.

### Membership duplicada

Uma nova tentativa de inserir a membership retornou `duplicate key`. A consulta do estado confirmou que a membership já estava criada; não foi necessário duplicá-la.

### Limpeza de arquivos temporários

Ao final, foi tentada a remoção de `supabase/.temp`, mas o caminho já não existia. O fato não exigiu correção adicional. A verificação Git final apresentou worktree limpo.

## 12. Evidências textuais

Trechos sanitizados observados durante a validação:

```text
Would push these migrations:
 • 202607170001_part5_auth_rls.sql
 • 202607190001_part6c_manual_push.sql

Applying migration 202607170001_part5_auth_rls.sql...
NOTICE (42710): extension "pgcrypto" already exists, skipping
Applying migration 202607190001_part6c_manual_push.sql...
Finished supabase db push.

nothing to commit, working tree clean
```

Após a limpeza operacional:

- `.env.local` permaneceu ignorado e fora do versionamento;
- `supabase/.temp` não estava presente;
- `git status` indicou `working tree clean`.

## 13. Conclusão

A etapa 6D confirmou que a base de nuvem do StockFlow funciona em ambiente Supabase real para autenticação, business/membership, aplicação das migrations, RLS, push manual protegido de categorias e produtos e idempotência remota por `sync_operations`.

A validação também confirmou que as salvaguardas de escopo continuam ativas: movimentações não são enviadas, a associação de pendências não realiza upload, e nenhum fluxo automático foi introduzido.

A Parte 6 ainda não está concluída integralmente. Pull remoto, conflitos reais, RPC atômica para movimentações, concorrência de estoque entre dispositivos e central de conflitos permanecem pendentes e exigem etapas futuras separadas.
