# Como Continuar o Desenvolvimento do StockFlow

> Guia de retomada consolidado em 17/07/2026. Deve ser usado pelo desenvolvedor, parceiro de TCC, outra sessão do Codex ou outra IA. Nenhuma conversa anterior é necessária se os arquivos abaixo forem lidos e o repositório for verificado.

O StockFlow é o TCC real. Não o trate, planeje ou adapte como Projeto Integrador sem uma nova solicitação explícita do responsável.

## Ordem obrigatória de leitura

1. `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md`
2. `docs/ESTADO-ATUAL-DO-PROJETO.md`
3. `docs/ROADMAP-TCC.md`
4. `docs/ARQUITETURA-ATUAL.md`
5. `docs/RELATORIO-TECNICO-PARTE-6-SINCRONIZACAO.md`, quando a tarefa envolver sincronização
6. ADRs relevantes em `docs/arquitetura/adrs`

Depois, leia o código e os testes apenas da área que será alterada. O Prompt Mestre é a fonte oficial de direção; os documentos de continuidade registram a fotografia e a sequência operacional atual.

## Ponto de retomada atual

- Raiz esperada nesta fotografia: `C:/Users/lufel/Desktop/TCC/StockFlow`.
- Branch de trabalho nesta fotografia: `develop`.
- Etapa atual: 6F validada em Supabase real, loading corrigido em etapa posterior e 6G encerrada pela opção C. O pull funcional está bloqueado porque o domínio local ainda é device-scoped; não existe central de conflitos ou sincronização automática.
- Schema Dexie atual: versão 10.
- Estado de testes comprovado: 45 arquivos, 461 testes aprovados na revisão da 6G.
- Evolução mais recente consolidada: Parte 6G encerrada pela opção C, com guarda manual e pull funcional bloqueado até existir scoping local por `businessId`. A Parte 3 permanece concluída.
- Parte principal atual: **Parte 6 em andamento pelas fatias 6A–6G; regras 43–54 permanecem parcialmente atendidas**.
- Pendências conhecidas das regras 19–29: nenhuma.
- Próximo passo recomendado: preservar 6D/6F e criar uma etapa anterior de scoping local por `businessId`, com decisão explícita sobre os dados legados device-scoped, antes de retomar pull/cursor.

Esses dados devem ser verificados novamente na retomada; não devem ser copiados como verdade eterna.

## Protocolo obrigatório antes de alterar código

Execute, a partir do diretório em que a sessão foi aberta:

```bash
git status
git branch --show-current
git rev-parse --show-toplevel
```

Se os comandos falharem, localize a raiz real sem criar arquivos e repita os três comandos nela. Não suponha que a pasta aberta é o repositório correto.

Depois:

1. confirme a raiz retornada por `git rev-parse --show-toplevel`;
2. confirme a branch e se ela é a branch esperada para a tarefa;
3. registre o estado inicial do worktree;
4. se houver alterações locais, identifique-as e não as misture, sobrescreva ou reverta;
5. confirme `package.json`, lockfile, schema Dexie e migrations atuais;
6. leia somente a área de código, testes e ADRs necessária para a evolução;
7. compare a tarefa com `docs/ROADMAP-TCC.md` e confirme que ela é a próxima parte autorizada.

## Regras de continuidade

- Não repetir auditorias já concluídas sem mudança relevante ou motivo concreto.
- Não recriar o projeto nem substituir sua estrutura funcional.
- Não reverter decisões consolidadas sem evidência, impacto analisado e ADR quando necessário.
- Não adicionar tecnologia apenas para impressionar ou ampliar artificialmente o TCC.
- Executar uma evolução principal por vez e parar ao concluí-la para revisão do usuário.
- Não avançar automaticamente para outra grande etapa.
- Preservar compatibilidade com dados locais existentes.
- Toda alteração de schema Dexie deve receber nova versão e migration adequada; nunca editar silenciosamente uma versão já usada.
- Testar fresh install e upgrades relevantes quando o schema mudar.
- Preservar soft delete e referências históricas.
- Não apagar ou reescrever movimentações antigas para facilitar implementação.
- Preservar valores monetários em centavos inteiros.
- Preservar snapshots de estoque; registros legados sem dados suficientes continuam legados.
- Preservar UUIDs de Produto, Movimentação e Categoria.
- Preservar a arquitetura `UI → Service → Repository → Dexie`.
- Usar `Domain` para regras puras, sem React ou Dexie.
- Manter a transação de movimento atômica.
- Evitar overengineering, camadas genéricas e dependências sem necessidade comprovada.
- Não tratar `syncStatus`, outbox ou `getLocalSyncPreparationStatus()` como sincronização funcional.
- Não afirmar que push, pull, retry com rede/automático, conflitos reais ou multiusuário existem antes do código e dos testes correspondentes.
- Não inventar credenciais, resultados acadêmicos, estatísticas, testes executados ou funcionalidades concluídas.

## Como escolher a próxima mudança

1. Comece pelo próximo item da parte principal atual no roadmap oficial de 15 partes.
2. Priorize integridade de dados, regras de estoque, funcionamento local, estabilidade, usabilidade e testes.
3. Se uma prática transversal for necessária — teste, ADR ou critério de qualidade — use-a sem declarar a parte posterior como concluída.
4. Se a mudança depender de decisão acadêmica, credencial ou requisito não verificável, documente o bloqueio e peça direção.
5. Se surgir uma dívida fora do escopo, registre-a; não transforme a etapa atual em uma refatoração ampla.

## Regras específicas para schema e histórico

Antes de qualquer mudança persistida:

- leia todas as versões em `src/services/db/localDb.ts`;
- leia `src/services/db/localDb.migration.test.ts`;
- identifique quais versões antigas podem existir em navegadores reais;
- defina o que pode ser convertido deterministicamente;
- aborte a migration quando a conversão segura não for possível;
- nunca invente snapshot, associação ou valor histórico;
- documente contexto, decisão e consequências em ADR quando a mudança for arquitetural.

A versão atual é 10. Uma mudança futura de schema deve começar em versão superior e preservar a sequência v1 → v10 existente.

## Regras específicas para estoque

- Entrada e saída passam por `stockMovementService` e `calculateStockSnapshot`.
- Atualização do produto e criação da movimentação devem permanecer na mesma transação.
- Saída maior que o disponível deve falhar sem alteração parcial.
- Quantidade deve ser inteira e positiva.
- Produto excluído não recebe nova movimentação.
- Correção de estoque deve preferir uma nova movimentação de ajuste quando esse requisito for formalmente introduzido.
- Saldo inicial é permitido somente na criação; edição comum não altera `currentQuantity`.
- Alterações posteriores passam pelo `stockMovementService` e pela operação explícita `productRepository.updateStock()` dentro da transação.

## Regras específicas para código do produto

- `code` é referência interna opcional, não código de barras;
- ausência é persistida como string vazia;
- o valor salvo recebe trim externo sem conversão obrigatória para maiúsculas;
- códigos não vazios são logicamente únicos entre produtos ativos, com comparação case-insensitive;
- produto excluído não bloqueia reutilização e duplicidades legadas não são reescritas automaticamente.

## Regras específicas para sync e nuvem futura

A arquitetura futura é:

```text
React/PWA → IndexedDB/Dexie → futura sincronização → Supabase/PostgreSQL/Auth/RLS
```

Ao chegar às partes autorizadas:

- Auth, modelo de estabelecimento e RLS devem ser projetados antes de dados multiusuário;
- a outbox deve ser persistente e criada atomicamente com a mutação local;
- push deve confirmar antes de marcar como sincronizado;
- pull deve validar e aplicar dados em transação;
- retry deve guardar tentativas/erro sem loop agressivo;
- conflitos devem ser detectados e armazenados, não sobrescritos silenciosamente;
- o service worker não deve cachear respostas privadas indiscriminadamente.

A 6B fornece claim/retry local. A 6C liga um executor remoto somente ao botão da Conta, após reconfirmar sessão, business e membership. Eventos device-scoped precisam de ação separada para receber `userId`/`businessId`. Categorias/produtos usam RPC idempotente/versionada; updates sem versão-base ficam em erro. A 6E acrescenta a RPC exclusiva para movimentos rastreados. Não ligar push ao boot, Auth, eventos online/offline, timer ou Service Worker. `conflict` continua somente previsto; não há resolução.

A 6D comprovou esse fluxo em Supabase real de teste, incluindo migrations, Auth, business/membership, push de categorias/produtos, `sync_operations` e o bloqueio então vigente de movimentos. O registro sanitizado está em `docs/VALIDACAO-SUPABASE-6D.md` e não deve ser reescrito retroativamente.

A 6E adiciona `register_stock_movement` em migration nova e libera somente `movement.created` rastreado no push manual. A RPC usa RLS/`SECURITY INVOKER`, Auth e membership explícitos, lock do produto, snapshots, cálculo remoto, proteção contra estoque negativo e ledger idempotente na mesma transação. Movimentos legados, snapshots inválidos e divergências permanecem na outbox com erro/backoff; isso não cria resolução real de conflitos.

A 6F validou a RPC em Supabase real com entrada e saída, atualização atômica do saldo, incremento de versão, ledger de idempotência e recusa de snapshot divergente. O registro sanitizado está em `docs/VALIDACAO-SUPABASE-6F.md`. Naquele momento houve uma ressalva visual no botão “Enviando...”, corrigida em etapa posterior.

A ressalva visual foi corrigida posteriormente. Na 6G, a auditoria confirmou que apenas eventos da outbox podem receber `userId`/`businessId`; entidades, stores, repositories e listagens locais continuam globais ao dispositivo. A opção C bloqueia qualquer pull funcional. A Conta expõe somente uma verificação manual, que valida configuração, sessão, business, conectividade e membership, mas não possui gateway de leitura, cursor, Dexie v11 ou aplicação local. Não transformar esse bloqueio em pull funcional antes do scoping local.

Até lá, não transformar o resumo local atual em sincronização simulada apresentada como pronta.

## Validação ao final de cada etapa

Execute na raiz real:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
git status
```

Registre resultados reais, inclusive falhas. Não altere código somente para esconder uma limitação de ambiente. Para etapa exclusivamente documental, cumpra os comandos expressamente solicitados pela tarefa; não faça mudanças de produção para forçar validações.

Revise também:

- `git diff --stat` e `git diff` para garantir que somente o escopo autorizado mudou;
- se novos arquivos não planejados foram criados;
- se schema/lockfile/package foram alterados involuntariamente;
- se números de testes e versões da documentação continuam corretos.

## Git e revisão humana

- Codex ou outra IA **não deve fazer commit**.
- Codex ou outra IA **não deve fazer push**.
- Codex ou outra IA **não deve trocar/rebasear/mesclar branch** sem pedido explícito.
- Codex ou outra IA **não deve avançar automaticamente para outra grande etapa**.
- O usuário revisa o diff, escolhe a mensagem, realiza commit e push manualmente.
- Uma mensagem de commit pode ser sugerida, mas nunca executada automaticamente.

## Saída esperada de cada etapa

O relatório de entrega deve informar:

- raiz, branch e estado inicial;
- objetivo e escopo executado;
- arquivos lidos, criados e alterados;
- decisões e regras preservadas;
- testes adicionados/alterados;
- comandos executados e seus resultados;
- limitações, inconsistências e pendências;
- estado final do Git;
- próximo passo recomendado, sem executá-lo.

## Sinais de documentação desatualizada já conhecidos

- `docs/auditoria-fase-0.md` contém uma raiz anterior e retrata lacunas de 12/07/2026, algumas já resolvidas.
- O ADR-001 teve sua numeração interna corrigida na consolidação documental de 15/07/2026.
- O README representa o estado funcional, schema v10, migrations, arquitetura, limitações, suíte e roadmap atuais.
- O primeiro reload offline e o ciclo de atualização A → B já foram validados manualmente; a coordenação de abas deve ser conferida novamente quando houver um upgrade de schema legítimo.
- O identificador de build é derivado automaticamente dos artefatos gerados; não deve ser substituído por incremento manual de cache.

Essas divergências devem ser consideradas ao retomar. Não corrija todas automaticamente em uma tarefa de escopo diferente.

# Prompt mínimo para retomar o projeto em outra IA

> Leia primeiro `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md`, `docs/ESTADO-ATUAL-DO-PROJETO.md`, `docs/ROADMAP-TCC.md`, `docs/ARQUITETURA-ATUAL.md`, `docs/VALIDACAO-SUPABASE-6D.md`, `docs/VALIDACAO-SUPABASE-6F.md` e os ADRs relevantes. O StockFlow é o TCC real e o Prompt Mestre, dividido oficialmente em 15 partes, é o plano oficial. Confirme raiz, branch e worktree antes de alterar arquivos. As Partes 3, 4 e 5 estão concluídas; 6D/6F preservam as validações reais e o loading já foi corrigido. A 6G escolheu a opção C porque entidades locais não possuem scoping por business: a guarda de pull é manual e não baixa dados. Preserve schema, dados e arquitetura; o próximo passo é projetar o scoping local e os dados legados antes de retomar pull/cursor; não faça commit ou push.
