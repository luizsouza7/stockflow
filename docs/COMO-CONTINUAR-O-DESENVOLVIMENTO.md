# Como Continuar o Desenvolvimento do StockFlow

> Guia de retomada atualizado em 14/07/2026. Deve ser usado pelo desenvolvedor, parceiro de TCC, outra sessão do Codex ou outra IA. Nenhuma conversa anterior é necessária se os arquivos abaixo forem lidos e o repositório for verificado.

## Ordem obrigatória de leitura

1. `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md`
2. `docs/ESTADO-ATUAL-DO-PROJETO.md`
3. `docs/ROADMAP-TCC.md`
4. `docs/ARQUITETURA-ATUAL.md`
5. ADRs relevantes em `docs/arquitetura/adrs`

Depois, leia o código e os testes apenas da área que será alterada. O Prompt Mestre é a fonte oficial de direção; os documentos de continuidade registram a fotografia e a sequência operacional atual.

## Ponto de retomada atual

- Raiz esperada nesta fotografia: `C:/Users/lufel/Desktop/TCC/StockFlow`.
- Branch de trabalho nesta fotografia: `develop`.
- Commit de código de referência: `928d124`.
- Schema Dexie atual: versão 9.
- Estado de testes comprovado: 11 arquivos, 90 testes aprovados em 14/07/2026.
- Última etapa de código: robustez de consultas, formulários e rotas de produtos.
- Parte principal atual: **final da Parte 3**, praticamente concluída após busca, filtros e ordenação do núcleo local.
- Próximo passo recomendado: mapear lacunas e ampliar testes do núcleo local; em seguida endurecer PWA/offline. Não antecipar Supabase ou sincronização.

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
- Não tratar `syncStatus` ou `syncPendingData()` como sincronização funcional.
- Não afirmar que Supabase, Auth, PostgreSQL, RLS, outbox, conflitos ou multiusuário existem antes do código e dos testes correspondentes.
- Não inventar credenciais, resultados acadêmicos, estatísticas, testes executados ou funcionalidades concluídas.

## Como escolher a próxima mudança

1. Comece pelo próximo item da parte principal atual no roadmap.
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

A versão atual é 9. Uma mudança futura de schema deve começar em versão superior e preservar a sequência existente.

## Regras específicas para estoque

- Entrada e saída passam por `stockMovementService` e `calculateStockSnapshot`.
- Atualização do produto e criação da movimentação devem permanecer na mesma transação.
- Saída maior que o disponível deve falhar sem alteração parcial.
- Quantidade deve ser inteira e positiva.
- Produto excluído não recebe nova movimentação.
- Correção de estoque deve preferir uma nova movimentação de ajuste quando esse requisito for formalmente introduzido.
- Evite alterar `currentQuantity` por caminhos que não preservem auditabilidade; o formulário atual permite isso e a questão deve ser tratada em etapa própria.

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

Até lá, não transformar o stub atual em sincronização simulada apresentada como pronta.

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
- O primeiro arquivo de ADR chama-se `ADR-001...`, mas o título interno diz “ADR-006”.
- O README ainda representa principalmente a Etapa 1 inicial e não detalha schema v9, UUIDs, migrations e a suíte atual.
- O banner offline promete sincronização ao reconectar, embora a sincronização não exista.

Essas divergências devem ser consideradas ao retomar. Não corrija todas automaticamente em uma tarefa de escopo diferente.

# Prompt mínimo para retomar o projeto em outra IA

> Leia primeiro `docs/prompt/PROMPT-MESTRE-STOCKFLOW.md`, `docs/ESTADO-ATUAL-DO-PROJETO.md`, `docs/ROADMAP-TCC.md`, `docs/ARQUITETURA-ATUAL.md` e os ADRs relevantes. Considere o Prompt Mestre como planejamento oficial e os documentos de continuidade como fotografia verificável do StockFlow. Antes de alterar qualquer arquivo, execute `git status`, `git branch --show-current` e `git rev-parse --show-toplevel`, confirme raiz, branch e mudanças locais. Continue exatamente da próxima etapa indicada — atualmente o encerramento da Parte 3 — sem recriar o projeto, desfazer decisões consolidadas ou antecipar Supabase, Auth, sincronização e conflitos. Preserve schema/dados, soft delete, histórico, centavos, snapshots, UUIDs e a arquitetura `UI → Service → Repository → Dexie`, usando `Domain` para regras puras. Execute uma evolução principal por vez, valide-a, não faça commit nem push e devolva o controle ao usuário antes da etapa seguinte.
