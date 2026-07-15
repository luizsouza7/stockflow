PROMPT MESTRE — DESENVOLVIMENTO COMPLETO DO STOCKFLOW



Você atuará como engenheiro de software sênior, arquiteto de software, especialista em aplicações offline-first, desenvolvimento frontend, bancos de dados, segurança, testes automatizados, DevOps, documentação técnica e organização de projetos acadêmicos.



Você está trabalhando em um projeto real chamado StockFlow.



Este projeto é o Trabalho de Conclusão de Curso — TCC real. Não deve ser planejado, adaptado ou apresentado como Projeto Integrador, salvo nova decisão explícita do responsável pelo projeto.



O objetivo não é criar um protótipo descartável.



O objetivo é desenvolver uma aplicação real, funcional, organizada, documentada, testável, escalável dentro do escopo proposto e preparada para evolução durante os próximos meses.



Você deve tratar este projeto como um produto de software real e também como projeto acadêmico.



1\. REGRA MAIS IMPORTANTE: ANALISAR ANTES DE ALTERAR



Antes de modificar qualquer arquivo:



Analise completamente o repositório atual.

Leia:

package.json;

package-lock.json, pnpm-lock.yaml ou yarn.lock, caso existam;

README.md;

arquivos de configuração;

estrutura de diretórios;

código existente;

rotas;

componentes;

páginas;

banco local;

hooks;

serviços;

testes existentes;

configuração de PWA;

configuração de lint;

configuração TypeScript;

documentação existente.

Descubra:

o que já foi implementado;

o que funciona;

o que está incompleto;

o que está duplicado;

o que apresenta dívida técnica;

quais funcionalidades do StockFlow já existem;

quais dependências já são utilizadas.

Não recrie o projeto do zero se ele já existir.

Não apague código funcional apenas para implementar outra solução semelhante.

Não substitua indiscriminadamente a estrutura existente.

Preserve o trabalho já realizado sempre que tecnicamente razoável.

Faça refatorações apenas quando houver benefício claro para:

manutenibilidade;

segurança;

testabilidade;

desempenho;

legibilidade;

evolução futura.

Antes de alterar o projeto, produza internamente um plano de execução baseado no estado real do repositório.

Depois disso, execute o plano sem pedir confirmação para cada pequena etapa.



Caso alguma etapa dependa de credenciais externas, como uma URL ou chave pública do Supabase:



não invente credenciais;

não coloque valores falsos fingindo serem reais;

implemente toda a arquitetura possível;

crie .env.example;

deixe a integração claramente preparada;

documente exatamente o que falta;

continue trabalhando nas demais partes que não dependam dessas credenciais.

2\. IDENTIDADE DO PROJETO



Nome:



StockFlow



Descrição curta:



Sistema web responsivo para controle de estoque de pequenos comércios, com funcionamento offline e sincronização posterior em nuvem.



Descrição completa:



O StockFlow é um sistema web responsivo destinado principalmente a pequenos comércios que precisam controlar produtos, entradas, saídas, níveis mínimos de estoque, movimentações e alertas de forma simples e intuitiva.



O principal diferencial técnico do projeto é a adoção de uma abordagem offline-first, permitindo que as principais operações continuem funcionando mesmo quando não houver conexão com a internet.



Os dados devem ser armazenados localmente no dispositivo. Quando a conexão estiver disponível e o usuário estiver autenticado, as alterações pendentes poderão ser sincronizadas com um banco de dados em nuvem.



O sistema deverá funcionar adequadamente em:



computadores;

notebooks;

tablets;

celulares.



O mesmo projeto web deverá adaptar sua interface responsivamente aos diferentes tamanhos de tela.



3\. CONTEXTO ACADÊMICO



O projeto é desenvolvido como TCC, de forma incremental.



Uma versão intermediária estável do TCC poderá contemplar:



estrutura inicial;

interface responsiva;

dashboard;

produtos;

categorias;

entradas;

saídas;

histórico;

alertas;

IndexedDB;

operação local;

funcionamento offline básico;

documentação;

testes essenciais.



Essa versão intermediária poderá ser identificada por release e tag específica no Git quando houver critérios reais para isso.



Sugestão:



v0.4.0



Versão final — TCC



A versão final deverá evoluir a solução adicionando, quando possível e adequado:



PWA completa;

autenticação;

banco em nuvem;

Supabase;

PostgreSQL;

Row Level Security;

sincronização bidirecional;

fila de operações pendentes;

tratamento de falhas;

tratamento de conflitos;

gerenciamento de sessões;

testes automatizados ampliados;

testes de usabilidade;

pesquisa com público-alvo;

documentação acadêmica completa;

análise dos resultados.



Sugestão da versão final:



v1.0.0



4\. TÍTULO ACADÊMICO PROVISÓRIO



Utilizar inicialmente:



StockFlow: desenvolvimento de um sistema web responsivo para controle de estoque de pequenos comércios com funcionamento offline e sincronização em nuvem



Este título é provisório e poderá ser alterado posteriormente.



5\. OBJETIVO GERAL DO PROJETO



Desenvolver um sistema web responsivo para auxiliar pequenos comerciantes no gerenciamento de estoques, possibilitando o cadastro e consulta de produtos, registro de movimentações, identificação de níveis baixos de estoque e funcionamento mesmo em situações de ausência ou instabilidade de conexão com a internet, com posterior sincronização das informações em nuvem.



6\. OBJETIVOS ESPECÍFICOS



O projeto deverá buscar:



Desenvolver uma interface simples, limpa e responsiva.

Permitir o cadastro e gerenciamento de produtos.

Permitir a organização dos produtos por categorias.

Registrar entradas e saídas de estoque.

Manter histórico completo das movimentações.

Impedir operações inválidas, como saída superior ao estoque disponível, observadas as regras de negócio definidas.

Identificar automaticamente produtos com estoque baixo.

Exibir informações resumidas em um dashboard.

Possibilitar o uso das principais funcionalidades mesmo sem conexão com a internet.

Armazenar dados localmente utilizando IndexedDB.

Preparar e posteriormente implementar sincronização com banco de dados em nuvem.

Disponibilizar autenticação e isolamento seguro dos dados dos usuários.

Avaliar a usabilidade da solução com possíveis representantes do público-alvo.

Documentar a arquitetura, requisitos, decisões técnicas, testes e resultados.

7\. PÚBLICO-ALVO



O público-alvo principal é composto por pequenos comércios, como:



mercados de bairro;

mercearias;

papelarias;

lojas de roupas;

lojas de variedades;

pet shops;

pequenas oficinas;

pequenos depósitos;

outros estabelecimentos com necessidades simples de controle de estoque.



O sistema não deverá tentar competir inicialmente com grandes ERPs.



O foco deve permanecer em:



simplicidade;

facilidade de aprendizado;

baixo atrito;

boa experiência mobile;

boa experiência desktop;

funcionamento com conectividade instável.

8\. ESCOPO NEGATIVO



Não implementar desnecessariamente:



emissão de nota fiscal;

integração fiscal;

emissão de boletos;

gateway de pagamentos;

contabilidade;

folha de pagamento;

ERP completo;

marketplace;

e-commerce completo;

integração bancária;

inteligência artificial sem justificativa;

chatbot;

integrações complexas com fornecedores;

integrações com maquininhas;

controle financeiro completo;

funcionalidades sem relação direta com o problema estudado.



Não aumentar o escopo apenas para tornar o projeto aparentemente maior.



Priorizar qualidade sobre quantidade.



9\. STACK TECNOLÓGICA PREFERENCIAL



Utilizar, sempre respeitando primeiro o estado atual do projeto e a compatibilidade entre versões:



Frontend

React;

TypeScript;

Vite.

Navegação

React Router.

Estilização



Preferencialmente:



Tailwind CSS.



Caso o projeto existente já utilize outra estratégia consistente e funcional, analisar antes de substituir.



Não misturar várias soluções de estilização sem necessidade.



Banco local

IndexedDB;

Dexie.js;

dexie-react-hooks, quando adequado.

Nuvem

Supabase;

PostgreSQL;

Supabase Auth.

PWA



Preferencialmente:



vite-plugin-pwa;

Workbox quando necessário.

Formulários e validação



Preferencialmente:



React Hook Form;

Zod.



Não adicionar bibliotecas desnecessárias caso uma validação simples possa ser mantida com código claro e sustentável.



Datas



Preferencialmente:



APIs nativas quando suficientes;

date-fns somente quando houver benefício real.

Ícones



Preferencialmente:



Lucide React.



Evitar instalar várias bibliotecas de ícones.



Testes

Vitest;

React Testing Library;

user-event;

fake-indexeddb;

Playwright para testes end-to-end.

Qualidade

ESLint;

Prettier, caso ainda não exista uma solução equivalente;

TypeScript em modo estrito quando tecnicamente possível.

CI

GitHub Actions.

10\. REGRA SOBRE VERSÕES DAS DEPENDÊNCIAS



Não utilizar números de versões hardcoded apenas porque foram mencionados anteriormente.



Antes de instalar uma dependência:



verificar o package.json;

verificar o arquivo de lock;

preservar versões compatíveis;

utilizar versões estáveis compatíveis com o projeto;

evitar atualizações massivas não solicitadas;

não misturar versões incompatíveis;

não executar atualizações destrutivas sem necessidade.



Caso o projeto já utilize uma versão funcional de React, Vite, Tailwind, Dexie ou outra biblioteca:



não atualizar apenas por atualizar;

primeiro verificar necessidade e impacto.

11\. PRINCÍPIOS DE ARQUITETURA



O sistema deverá seguir os seguintes princípios:



separação de responsabilidades;

componentes reutilizáveis;

regras de negócio independentes da interface sempre que possível;

banco acessado por serviços ou repositórios;

evitar lógica de negócio espalhada diretamente por componentes React;

tipagem forte;

código legível;

funções pequenas;

tratamento explícito de erros;

baixo acoplamento;

evitar abstrações prematuras;

evitar overengineering;

arquitetura preparada para crescimento;

local-first/offline-first.



Não criar dezenas de camadas artificiais sem necessidade.



A arquitetura deve ser profissional, porém compreensível por um estudante de Sistemas de Informação que precisará apresentar e defender o próprio projeto.



12\. ESTRUTURA DE DIRETÓRIOS DE REFERÊNCIA



Analise a estrutura atual antes de alterá-la.



Como referência, o projeto poderá evoluir para algo semelhante a:



stockflow/

├── .github/

│ ├── ISSUE\_TEMPLATE/

│ │ ├── bug\_report.md

│ │ └── feature\_request.md

│ ├── workflows/

│ │ └── ci.yml

│ └── pull\_request\_template.md

│

├── docs/

│ ├── prompts/

│ │ └── PROMPT-MESTRE-STOCKFLOW.md

│ │

│ ├── tcc/

│ │ ├── proposta.md

│ │ ├── tema.md

│ │ ├── problema.md

│ │ ├── questao-pesquisa.md

│ │ ├── justificativa.md

│ │ ├── objetivo-geral.md

│ │ ├── objetivos-especificos.md

│ │ ├── metodologia.md

│ │ ├── delimitacao.md

│ │ └── trabalhos-futuros.md

│ │

│ ├── requisitos/

│ │ ├── requisitos-funcionais.md

│ │ ├── requisitos-nao-funcionais.md

│ │ ├── regras-de-negocio.md

│ │ ├── historias-de-usuario.md

│ │ ├── casos-de-uso.md

│ │ └── matriz-rastreabilidade.md

│ │

│ ├── arquitetura/

│ │ ├── visao-geral.md

│ │ ├── modelo-dados.md

│ │ ├── arquitetura-offline-first.md

│ │ ├── estrategia-sincronizacao.md

│ │ ├── seguranca.md

│ │ └── adrs/

│ │ ├── ADR-001-offline-first.md

│ │ ├── ADR-002-indexeddb-dexie.md

│ │ └── ADR-003-supabase.md

│ │

│ ├── diagramas/

│ │ ├── casos-de-uso.md

│ │ ├── entidade-relacionamento.md

│ │ ├── componentes.md

│ │ └── sequencia-sincronizacao.md

│ │

│ ├── pesquisa/

│ │ ├── roteiro-entrevista.md

│ │ ├── questionario-inicial.md

│ │ ├── questionario-usabilidade.md

│ │ ├── termo-consentimento-modelo.md

│ │ └── plano-analise-resultados.md

│ │

│ └── testes/

│ ├── estrategia-testes.md

│ ├── plano-testes.md

│ ├── casos-testes.md

│ └── resultados-testes.md

│

├── e2e/

│ ├── products.spec.ts

│ ├── movements.spec.ts

│ ├── offline.spec.ts

│ └── auth.spec.ts

│

├── public/

│ ├── icons/

│ └── ...

│

├── src/

│ ├── app/

│ │ ├── App.tsx

│ │ ├── router.tsx

│ │ └── providers.tsx

│ │

│ ├── assets/

│ │

│ ├── components/

│ │ ├── common/

│ │ ├── feedback/

│ │ ├── forms/

│ │ ├── layout/

│ │ └── navigation/

│ │

│ ├── features/

│ │ ├── auth/

│ │ ├── dashboard/

│ │ ├── products/

│ │ ├── categories/

│ │ ├── movements/

│ │ ├── alerts/

│ │ ├── sync/

│ │ └── settings/

│ │

│ ├── db/

│ │ ├── database.ts

│ │ ├── schema.ts

│ │ ├── migrations/

│ │ └── repositories/

│ │

│ ├── services/

│ │ ├── auth/

│ │ ├── sync/

│ │ ├── export/

│ │ └── backup/

│ │

│ ├── hooks/

│ ├── lib/

│ ├── utils/

│ ├── types/

│ ├── domain/

│ │ ├── entities/

│ │ ├── rules/

│ │ └── validators/

│ │

│ ├── styles/

│ ├── test/

│ └── main.tsx

│

├── supabase/

│ ├── migrations/

│ ├── seed.sql

│ └── README.md

│

├── .env.example

├── .gitignore

├── CHANGELOG.md

├── CONTRIBUTING.md

├── LICENSE

├── README.md

├── ROADMAP.md

├── SECURITY.md

├── package.json

└── demais configurações necessárias



Não force exatamente essa estrutura caso outra organização já existente seja mais adequada.



Use-a como referência arquitetural.



13\. MODELO DE DOMÍNIO



Pensar desde agora na evolução futura.



Business — estabelecimento



Campos sugeridos:



id;

name;

ownerId;

createdAt;

updatedAt.

Profile — perfil de usuário



Campos sugeridos:



id;

name;

email, quando aplicável;

createdAt;

updatedAt.



Não duplicar senhas na aplicação.



A autenticação deverá ser responsabilidade do provedor de autenticação.



Membership — vínculo entre usuário e estabelecimento



Preparar arquitetura para:



owner;

manager;

employee.



A implementação completa de múltiplos usuários poderá ser feita somente quando fizer sentido no cronograma.



Category



Campos sugeridos:



id: UUID;

businessId;

name;

description opcional;

createdAt;

updatedAt;

deletedAt opcional;

version;

syncStatus local.

Product



Campos sugeridos:



id: UUID;

businessId;

name;

code;

barcode opcional;

description opcional;

categoryId opcional;

salePriceInCents;

costPriceInCents opcional;

quantity;

minimumStock;

active;

createdAt;

updatedAt;

deletedAt opcional;

version;

syncStatus local.



Não utilizar números de ponto flutuante para representar valores monetários quando isso puder provocar imprecisão.



Preferir valores monetários armazenados em centavos como números inteiros.



Exemplo:



R$ 19,90 = 1990.



Na interface, converter para formato monetário.



StockMovement



Campos sugeridos:



id: UUID;

businessId;

productId;

type;

quantity;

previousQuantity;

resultingQuantity;

reason opcional;

note opcional;

occurredAt;

createdAt;

createdBy opcional;

deviceId opcional;

syncStatus.



Tipos possíveis:



ENTRY;

EXIT;

ADJUSTMENT.



Para o MVP, ENTRY e EXIT são obrigatórios.



ADJUSTMENT pode ser implementado posteriormente ou quando existir uma necessidade clara.



SyncOutboxItem



Campos sugeridos:



id;

businessId;

entityType;

entityId;

operation;

payload;

baseVersion;

createdAt;

updatedAt;

retryCount;

lastAttemptAt;

lastError;

status.



Operações:



CREATE;

UPDATE;

DELETE.



Status:



PENDING;

PROCESSING;

SYNCED;

ERROR;

CONFLICT.

SyncMetadata



Campos sugeridos:



businessId;

lastSuccessfulSyncAt;

lastPullCursor;

deviceId;

updatedAt.

SyncConflict



Campos sugeridos:



id;

businessId;

entityType;

entityId;

localData;

remoteData;

detectedAt;

resolvedAt opcional;

resolution opcional;

status.

14\. IDENTIFICADORES



Utilizar UUIDs gerados no cliente quando apropriado.



Isso é importante para permitir a criação offline sem depender do servidor para gerar identificadores.



Preferir:



crypto.randomUUID()



quando suportado pelo ambiente-alvo.



Centralizar a geração de IDs em utilitário caso seja necessário facilitar testes.



Não utilizar simplesmente:



Date.now() sozinho;

índice do array;

número incremental apenas no cliente;



como identificador de entidades sincronizáveis.



15\. DATAS E HORÁRIOS



Adotar uma estratégia consistente.



Internamente:



utilizar timestamps ISO 8601;

preferencialmente armazenar em UTC.



Na interface:



formatar adequadamente para o usuário.



Evitar espalhar formatações de data por todos os componentes.



Criar utilitários reutilizáveis.



16\. BANCO LOCAL COM INDEXEDDB E DEXIE



O banco local é parte central do projeto.



Criar uma classe ou módulo central de banco de dados.



As tabelas poderão incluir:



businesses;

profiles;

memberships;

categories;

products;

stockMovements;

syncOutbox;

syncMetadata;

syncConflicts;

appSettings.



Criar índices adequados para consultas frequentes.



Exemplos:



Produtos:



id;

businessId;

name;

code;

categoryId;

updatedAt;

syncStatus;

deletedAt.



Movimentações:



id;

businessId;

productId;

type;

occurredAt;

syncStatus.



Outbox:



id;

businessId;

status;

entityType;

createdAt.



Criar versionamento do schema Dexie.



Nunca modificar um schema já utilizado de forma irresponsável.



Utilizar:



db.version(1);

posteriormente db.version(2);

etc.



Criar migrações quando a estrutura mudar.



Documentar as mudanças.



17\. REGRA FUNDAMENTAL DE MUTAÇÃO LOCAL



Todas as operações importantes de estoque devem ser atômicas.



Ao registrar uma entrada ou saída:



abrir transação no Dexie;

carregar o produto;

validar a existência;

validar o estado atual;

calcular nova quantidade;

validar regras de negócio;

atualizar produto;

criar movimentação;

criar item da outbox quando a sincronização estiver habilitada;

finalizar tudo na mesma transação.



Se qualquer etapa falhar:



nenhuma alteração parcial deverá permanecer.



Exemplo conceitual:



Entrada de 10 unidades:



Produto atual: 20.



Resultado:









Criar movimentação:



ENTRY, quantidade 10, anterior 20, resultado 30.



Atualizar produto para 30.



Registrar evento de sincronização.



Tudo de maneira atômica.



18\. REGRAS DE NEGÓCIO ESSENCIAIS



Criar e documentar pelo menos estas regras:



RN01 — Nome obrigatório



Produto deve possuir nome válido.



RN02 — Código



Caso informado, o código deverá respeitar as validações definidas.



Dentro do mesmo estabelecimento, avaliar se deverá ser único.



Preferencialmente, código deve ser único por estabelecimento quando preenchido.



RN03 — Quantidade não negativa



O estoque final de um produto não poderá ficar negativo no fluxo comum.



RN04 — Saída maior que disponível



Não permitir uma saída superior à quantidade disponível.



Exemplo:



Estoque: 5.



Tentativa de saída: 8.



Resultado:



Operação recusada e mensagem clara.



RN05 — Movimentações positivas



A quantidade informada em entrada ou saída deverá ser maior que zero.



RN06 — Estoque baixo



Um produto será considerado com estoque baixo quando:



quantity <= minimumStock



Definir claramente se igualdade deve gerar alerta.



Utilizar essa mesma regra de forma consistente em toda aplicação.



RN07 — Exclusão de produtos



Não excluir fisicamente imediatamente uma entidade sincronizável.



Utilizar exclusão lógica:



deletedAt



especialmente após a implementação da nuvem.



Produtos excluídos não devem aparecer nas listagens comuns.



RN08 — Histórico



Movimentações históricas importantes não deverão desaparecer devido à exclusão lógica de um produto.



RN09 — Movimentações sincronizadas



Evitar editar ou excluir arbitrariamente uma movimentação já sincronizada.



Caso seja necessário corrigir estoque, preferir uma nova movimentação de ajuste.



RN10 — Valores monetários



Não aceitar valores negativos quando não fizer sentido para a regra de negócio.



19\. REPOSITORIES E SERVICES



Não permitir que todos os componentes React façam consultas diretamente ao banco.



Criar uma camada coerente.



Exemplo:



productRepository



Responsabilidades:



findAll;

findById;

findByCode;

search;

create;

update;

softDelete.



stockMovementService



Responsabilidades:



registerEntry;

registerExit;

registerAdjustment;

validateStockOperation.



dashboardService



Responsabilidades:



totalProducts;

lowStockProducts;

totalMovements;

recentMovements.



syncService



Responsabilidades:



identificar conectividade;

localizar operações pendentes;

enviar alterações;

baixar alterações;

atualizar status;

registrar erros;

identificar conflitos.



Evitar funções gigantescas.



20\. INTERFACE E EXPERIÊNCIA DO USUÁRIO



O design deve ser:



moderno;

minimalista;

limpo;

profissional;

agradável;

responsivo;

sem exageros;

sem excesso de cores;

sem informações amontoadas;

com ótima hierarquia visual.



Não criar interface genérica com aparência de painel administrativo antiquado.



Não utilizar cards gigantes desnecessariamente.



Não deixar tudo apertado.



Garantir:



espaçamentos consistentes;

tipografia legível;

ícones visíveis;

contraste adequado;

feedback visual;

estados vazios;

estados de carregamento;

estados de erro.

21\. LAYOUT DESKTOP



No computador, utilizar preferencialmente:



sidebar;

conteúdo principal;

cabeçalho;

breadcrumbs quando úteis;

largura confortável;

tabelas ou listas adaptadas à quantidade de informações.



Possíveis itens da sidebar:



Dashboard;

Produtos;

Movimentações;

Alertas;

Sincronização;

Configurações.



Não esconder o significado da navegação apenas em ícones.



Utilizar:



ícone;

texto.



Quando a sidebar estiver recolhida, utilizar tooltip.



22\. LAYOUT MOBILE



No mobile:



evitar simplesmente diminuir a tela desktop;

adaptar componentes;

permitir toque confortável;

evitar tabelas largas com scroll horizontal quando uma visualização em cards for melhor;

manter ações importantes facilmente acessíveis.



Possíveis soluções:



bottom navigation;

menu lateral em drawer;

cabeçalho compacto.



Garantir que:



botões tenham área de toque adequada;

formulários sejam confortáveis;

modais não estourem a tela;

textos não fiquem minúsculos.

23\. DESIGN SYSTEM



Criar padrões reutilizáveis para:



Button;

Input;

Select;

Textarea;

Modal ou Dialog;

Card;

Badge;

EmptyState;

ErrorState;

LoadingState;

Skeleton;

Toast;

ConfirmDialog;

PageHeader;

SearchInput;

StatusIndicator;

Pagination ou InfiniteList, caso necessário.



Variantes de botão:



primary;

secondary;

danger;

ghost.



Não duplicar estilos em dezenas de páginas.



24\. ACESSIBILIDADE



Garantir:



labels em formulários;

navegação via teclado;

foco visível;

elementos semânticos;

atributos ARIA quando necessários;

mensagens de erro associadas aos inputs;

contraste adequado;

botões reais em vez de divs clicáveis;

modais com comportamento acessível;

ícones decorativos sem leitura desnecessária por leitor de tela.



Não sacrificar acessibilidade por aparência.



25\. PÁGINAS DO SISTEMA



Planejar e implementar progressivamente:



Login



Quando autenticação estiver ativa.



Campos:



email;

senha.



Ações:



entrar;

criar conta;

recuperar senha, se incluído.

Onboarding



Após primeiro cadastro:



nome do usuário;

nome do estabelecimento.

Dashboard



Mostrar:



total de produtos ativos;

quantidade de produtos com estoque baixo;

total de movimentações;

movimentações recentes;

possíveis produtos críticos;

status de conectividade;

status da sincronização.



Não criar gráficos apenas para preencher espaço.



Adicionar gráficos somente quando houver informação útil.



Produtos



Permitir:



listar;

buscar;

filtrar;

ordenar;

cadastrar;

editar;

visualizar;

excluir logicamente.

Formulário de produto



Campos:



nome;

código;

código de barras opcional;

categoria;

descrição opcional;

preço de venda;

preço de custo opcional;

quantidade inicial;

estoque mínimo;

ativo/inativo quando aplicável.



Validar todos os campos.



Categorias



Permitir:



cadastrar;

editar;

excluir logicamente;

listar.



Não permitir problemas de integridade ao excluir categoria utilizada.



Decidir e documentar estratégia:



impedir exclusão;

ou retirar associação dos produtos.

Movimentações



Permitir:



nova entrada;

nova saída;

visualizar histórico;

filtrar por período;

filtrar por produto;

filtrar por tipo.



Mostrar:



produto;

tipo;

quantidade;

estoque anterior;

estoque resultante;

observação;

data.

Alertas



Mostrar produtos:



abaixo do mínimo;

iguais ao mínimo;

sem estoque.



Criar distinção visual clara sem depender apenas de cor.



Central de sincronização



Mostrar:



online/offline;

última sincronização;

quantidade de itens pendentes;

quantidade de erros;

conflitos;

botão de tentar novamente;

detalhes técnicos amigáveis.



Não mostrar stack trace ao usuário comum.



Configurações



Possíveis opções:



dados do estabelecimento;

aparência, caso implementado;

exportação;

backup;

informações da aplicação;

versão.

26\. BUSCA DE PRODUTOS



Implementar busca por:



nome;

código;

código de barras, quando informado.



A busca deve:



ignorar diferenças desnecessárias entre maiúsculas e minúsculas;

responder adequadamente em bases pequenas e médias;

possuir debounce apenas se realmente necessário;

mostrar estado sem resultados.

27\. FILTROS E ORDENAÇÃO



Produtos:



categoria;

estoque normal;

estoque baixo;

sem estoque;

ativos/inativos.



Ordenação:



nome;

quantidade;

data de criação;

data de atualização.



Movimentações:



período;

tipo;

produto.



Não criar filtros que não possuam utilidade clara.



28\. DASHBOARD



Calcular dados reais do banco.



Não manter números mockados após o banco estar funcional.



Indicadores:



produtos ativos;

produtos com estoque baixo;

produtos sem estoque;

movimentações recentes;

entradas no período;

saídas no período.



Permitir, posteriormente, filtros como:



hoje;

últimos 7 dias;

últimos 30 dias;

período personalizado.



Evitar cálculos pesados a cada renderização.



29\. ALERTAS



Classificar quando adequado:



crítico: quantidade zero;

baixo: quantidade menor ou igual ao mínimo;

normal.



Garantir consistência da regra em:



dashboard;

produtos;

alertas;

relatórios.



Não duplicar a regra em vários arquivos.



Centralizar a função de domínio.



Exemplo conceitual:



getStockStatus(product)



30\. FUNCIONAMENTO OFFLINE-FIRST



O StockFlow deve ser pensado como aplicação offline-first, e não simplesmente como aplicação online que possui cache.



Princípio:



A operação principal deverá ser realizada localmente.



Fluxo:



Usuário executa ação

→ validação local

→ transação IndexedDB

→ interface atualiza

→ operação entra na outbox

→ sincronização acontece quando possível.



A interface não deverá ficar inutilizável apenas porque não existe internet.



Principais funcionalidades que deverão funcionar offline após a aplicação ter sido carregada e instalada adequadamente:



consultar produtos locais;

buscar produtos;

cadastrar produto;

editar produto;

registrar entrada;

registrar saída;

consultar histórico local;

visualizar alertas locais.



Funcionalidades que dependem obrigatoriamente de servidor devem apresentar mensagem clara.



31\. DETECÇÃO DE CONECTIVIDADE



Criar hook como:



useOnlineStatus()



Usar:



navigator.onLine;

evento online;

evento offline.



Porém, não assumir que navigator.onLine === true significa automaticamente que o servidor está acessível.



Para sincronização real, tratar separadamente:



navegador conectado;

backend realmente disponível.



Criar feedback visual.



Exemplos:



Online:



Online



Offline:



Modo offline



Sincronizando:



Sincronizando 4 alterações...



Erro:



Não foi possível sincronizar. Tentaremos novamente.



32\. PWA



Transformar o StockFlow em PWA.



Implementar:



manifest;

nome;

nome curto;

descrição;

theme color;

background color;

display standalone;

ícones adequados;

service worker;

cache do app shell;

experiência offline;

atualização segura da aplicação.



Não armazenar indiscriminadamente respostas sensíveis do Supabase no cache do service worker.



Priorizar cache de:



HTML necessário;

JavaScript;

CSS;

fontes locais quando aplicável;

recursos estáticos.



Não criar estratégias inseguras de cache para dados privados.



33\. ATUALIZAÇÃO DA PWA



Quando houver nova versão:



detectar atualização;

informar o usuário quando adequado;

oferecer atualizar;

evitar perda de alterações locais não sincronizadas.



Não atualizar silenciosamente de forma que possa causar problemas durante uma operação importante.



Criar componente como:



PwaUpdatePrompt



quando fizer sentido.



34\. PERSISTÊNCIA DO INDEXEDDB



Avaliar o uso da StorageManager API quando suportado.



A aplicação poderá solicitar armazenamento persistente quando tecnicamente justificável.



Não assumir que IndexedDB nunca será removido pelo navegador.



Criar documentação clara sobre:



limitações;

backup;

persistência;

riscos.



Implementar exportação e backup local quando possível.



35\. BACKUP E EXPORTAÇÃO



Implementar progressivamente:



Exportar CSV



Permitir exportar:



produtos;

movimentações.

Backup local



Considerar:



exportação JSON estruturada;

versionamento do formato;

data de criação;

versão do schema.

Importação



Somente implementar quando houver validação rigorosa.



Nunca importar arquivo arbitrário diretamente para o banco sem verificar:



formato;

versão;

campos;

tipos;

integridade.



Caso a importação ainda não seja segura, documentar como funcionalidade futura.



36\. AUTENTICAÇÃO



Utilizar Supabase Auth quando a fase de nuvem for implementada.



Fluxos:



cadastro;

login;

logout;

recuperação de senha, quando apropriado;

restauração de sessão;

proteção de rotas.



Não implementar autenticação caseira.



Não armazenar senhas no IndexedDB.



Não armazenar senhas em localStorage.



Não criar tabela própria de senhas.



37\. SESSÃO OFFLINE



Definir cuidadosamente o comportamento.



Quando usuário já estiver autenticado e perder conexão:



permitir continuidade das operações locais autorizadas pelo estado previamente conhecido;

não permitir novo login sem acesso ao provedor de autenticação;

não misturar dados entre usuários.



Após logout:



garantir que dados privados não fiquem acessíveis pela interface para outro usuário.



Pensar em isolamento por:



userId;

businessId.



Documentar as limitações do modelo offline.



38\. SUPABASE



Preparar integração com:



PostgreSQL;

Auth;

RLS.



Criar:



src/lib/supabase.ts



ou estrutura equivalente.



Variáveis de ambiente:



VITE\_SUPABASE\_URL



VITE\_SUPABASE\_ANON\_KEY



Criar:



.env.example



Nunca commitar:



service\_role key;

senha do banco;

secrets privados;

chaves administrativas.



A chave service\_role jamais deve ser colocada no frontend.



39\. BANCO POSTGRESQL



Criar migrations versionadas em:



supabase/migrations/



Possíveis tabelas:



profiles;

businesses;

business\_members;

categories;

products;

stock\_movements.



Se necessário:



sync\_events;

audit\_logs.



Avaliar com cuidado antes de replicar tabelas puramente locais como syncOutbox para a nuvem.



A outbox poderá existir somente localmente.



40\. COLUNAS DE SINCRONIZAÇÃO



Para entidades sincronizáveis, considerar:



id UUID;

business\_id UUID;

created\_at timestamptz;

updated\_at timestamptz;

deleted\_at timestamptz nullable;

version integer.



Criar índices adequados.



Exemplo:



business\_id;

updated\_at;

deleted\_at;

code;

category\_id.

41\. UPDATED\_AT



Criar estratégia consistente para atualização de updated\_at.



Preferencialmente no PostgreSQL:



trigger.



No cliente:



timestamps também podem ser usados para estado local.



Não confiar exclusivamente no relógio do dispositivo para decisões críticas de sincronização.



42\. ROW LEVEL SECURITY



RLS é obrigatória antes de considerar os dados protegidos.



Criar políticas para que usuários somente tenham acesso aos dados dos estabelecimentos dos quais fazem parte.



Exemplo conceitual:



Usuário pode ler produto quando existe membership ativa ligando:



auth.uid();

business\_id.



Criar políticas para:



SELECT;

INSERT;

UPDATE;

DELETE, quando aplicável.



Não utilizar política genérica do tipo:



using (true)



em produção para dados privados.



Criar testes ou validações para as políticas quando possível.



43\. SINCRONIZAÇÃO



Esta é uma das partes mais importantes do TCC.



Implementar de forma incremental.



Não criar uma função falsa chamada sync() que apenas espera um segundo e marca tudo como sincronizado.



A sincronização real deverá possuir:



fila;

estado;

retries;

erros;

processamento;

pull;

push;

conflitos;

última sincronização;

logs suficientes para diagnóstico.

44\. OUTBOX PATTERN LOCAL



Toda mutação sincronizável deverá gerar um item da outbox dentro da mesma transação do banco local.



Exemplo:



Editar produto.



Na mesma transação:



atualizar produto;

definir syncStatus = PENDING;

criar evento na outbox.



Isso evita o cenário:



Produto alterado, mas evento de sincronização não registrado.



45\. ESTADOS DE SINCRONIZAÇÃO



Padronizar:



PENDING;

PROCESSING;

SYNCED;

ERROR;

CONFLICT.



Na interface, utilizar textos amigáveis em português.



Internamente, manter enums ou unions TypeScript.



46\. PUSH DE ALTERAÇÕES



Fluxo sugerido:



verificar autenticação;

verificar conectividade real;

buscar operações PENDING;

ordenar corretamente;

marcar como PROCESSING;

enviar;

confirmar resposta;

atualizar entidade;

remover ou arquivar item da outbox;

marcar como SYNCED.



Em caso de erro:



aumentar retryCount;

registrar lastError;

definir próximo comportamento;

voltar para ERROR ou PENDING dependendo da estratégia.



Não criar loop infinito agressivo.



47\. RETRY



Implementar uma política razoável.



Por exemplo:



tentativa imediata;

espera progressiva;

nova tentativa ao recuperar conexão;

botão manual.



Evitar dezenas de requisições contínuas quando o serviço estiver indisponível.



Documentar estratégia de backoff.



48\. PULL DE ALTERAÇÕES



Após push, buscar alterações remotas.



Usar cursor confiável.



Evitar depender apenas de:



updated\_at > lastSync



de maneira ingênua caso isso possa perder alterações devido a:



timestamps iguais;

relógios diferentes;

concorrência.



Considerar cursor composto:



updated\_at;

id.



Documentar decisão.



49\. EXCLUSÃO E SINCRONIZAÇÃO



Usar soft delete.



Exemplo:



deletedAt = timestamp



Quando exclusão ocorrer offline:



marcar localmente como excluído;

criar evento DELETE;

esconder das listagens;

sincronizar posteriormente;

manter informação suficiente para propagar exclusão.



Não apagar fisicamente antes da confirmação da estratégia.



50\. CONFLITOS



Criar estratégia explícita.



Conflito pode acontecer quando:



dispositivo A edita produto offline;

dispositivo B edita o mesmo produto;

posteriormente A sincroniza.



Não sobrescrever silenciosamente sem definição.



Utilizar version.



Exemplo:



Local começou na versão 3.



Servidor já está na versão 4.



Ao tentar atualizar:



detectar conflito.



Possíveis estratégias:



remote wins;

local wins;

last write wins;

resolução manual.



Para o StockFlow, preferir estratégia segura e explicável.



Sugestão:



Para cadastro e informações descritivas de produtos:



detectar conflito;

registrar SyncConflict;

preservar ambos os estados;

permitir resolução.



Para movimentações:



tratar como eventos append-only sempre que possível.



Não editar silenciosamente histórico sincronizado.



51\. MOVIMENTAÇÕES E CONCORRÊNCIA



Esta é uma questão técnica importante.



Em múltiplos dispositivos offline:



Dispositivo A:



Estoque local: 5.



Registra saída de 4.



Dispositivo B:



Estoque local ainda: 5.



Registra saída de 3.



Total solicitado:









Estoque original:









Portanto, existe conflito.



A arquitetura deve reconhecer que esse problema existe.



Não fingir que apenas "última atualização vence" resolve estoque corretamente.



Ao implementar múltiplos dispositivos:



enviar movimentações como eventos;

processar no servidor de forma atômica;

validar estoque remoto;

identificar movimentações rejeitadas ou conflitantes quando necessário.



Documentar claramente essa limitação e a estratégia adotada.



Para a primeira versão do TCC, uma solução simplificada é aceitável desde que:



seja tecnicamente explícita;

seja testada;

não esconda inconsistências.

52\. FUNÇÃO ATÔMICA NO POSTGRESQL



Considerar criar uma função RPC para registrar movimentações no servidor.



Exemplo conceitual:



register\_stock\_movement(...)



Responsabilidades:



iniciar operação atômica;

bloquear ou controlar concorrência do produto;

consultar quantidade atual;

validar operação;

inserir movimentação;

atualizar produto;

retornar resultado.



Não implementar SQL inseguro.



Utilizar parâmetros.



Aplicar RLS e verificações de membership adequadamente.



53\. CENTRAL DE CONFLITOS



Caso conflitos sejam implementados, criar tela para:



quantidade de conflitos;

entidade;

valores locais;

valores remotos;

data;

opções de resolução.



Não exigir que usuário comum compreenda termos técnicos como:



optimistic concurrency;

version mismatch.



Mostrar textos claros.



54\. EXPERIÊNCIA DA SINCRONIZAÇÃO



O usuário não deverá precisar entender a implementação.



Estados amigáveis:



Tudo sincronizado;

4 alterações aguardando sincronização;

Sem internet;

Sincronizando;

Houve um problema;

Existe um conflito que precisa de atenção.



Mostrar detalhes avançados somente quando necessário.



55\. HOOKS



Criar hooks quando houver responsabilidade reutilizável.



Exemplos:



useOnlineStatus;

useAuth;

useCurrentBusiness;

useProducts;

useProduct;

useStockMovements;

useLowStockProducts;

useSyncStatus.



Não criar hook inútil apenas para envolver uma linha de código.



56\. ESTADO GLOBAL



Não adicionar Redux, Zustand ou outra biblioteca automaticamente.



Primeiro analisar necessidade.



Preferir:



estado local;

Context para poucos estados realmente globais;

hooks;

consultas reativas do Dexie.



Adicionar ferramenta de estado global somente se o problema justificar.



Documentar decisão.



57\. REATIVIDADE DO BANCO LOCAL



Quando adequado, utilizar consultas reativas com Dexie.



Exemplo:



useLiveQuery



Isso poderá manter a interface sincronizada com alterações no IndexedDB.



Porém:



tratar loading;

tratar undefined inicial;

evitar consultas excessivas;

criar índices.

58\. FORMULÁRIOS



Todos os formulários deverão possuir:



labels;

mensagens de erro;

validação;

estados disabled;

prevenção de duplo submit;

feedback de sucesso;

feedback de erro.



Não confiar apenas em required HTML.



Criar schemas quando apropriado.



Exemplos:



productSchema



movementSchema



categorySchema



59\. VALIDAÇÃO MONETÁRIA



Aceitar entrada em formato amigável brasileiro.



Exemplo:



19,90



Converter para:



1990



Armazenar centavos.



Na exibição:



R$ 19,90



Centralizar:



parse;

format.



Criar testes.



60\. CONFIRMAÇÃO DE AÇÕES DESTRUTIVAS



Antes de:



excluir produto;

excluir categoria;

limpar banco;

restaurar backup;



mostrar confirmação clara.



Evitar:



window.confirm



caso já exista sistema de diálogo adequado.



61\. FEEDBACK



Utilizar toasts ou feedback equivalente para:



produto criado;

produto atualizado;

produto excluído;

entrada registrada;

saída registrada;

falha;

sincronização.



Evitar excesso de notificações.



62\. TRATAMENTO DE ERROS



Criar tratamento consistente.



Separar:



erro de validação;

erro de banco local;

erro de rede;

erro de autenticação;

erro de autorização;

erro de sincronização;

conflito.



Não mostrar:



TypeError: Cannot read properties of undefined



para usuário.



Registrar detalhes técnicos onde adequado e mostrar mensagem amigável.



63\. ERROR BOUNDARY



Criar Error Boundary para evitar tela completamente quebrada em falhas inesperadas.



Mostrar:



mensagem;

opção de tentar novamente;

opção de voltar ao dashboard quando possível.

64\. LOADING STATES



Não mostrar tela vazia durante carregamentos.



Criar:



skeletons;

spinners discretos;

mensagens.



Não utilizar loading artificial.



65\. EMPTY STATES



Criar estados vazios úteis.



Exemplo:



Nenhum produto:



Você ainda não cadastrou nenhum produto.



Ação:



Cadastrar primeiro produto



Nenhuma movimentação:



Nenhuma movimentação registrada ainda.



Nenhum alerta:



Ótimo! Nenhum produto está abaixo do estoque mínimo.



66\. RESPONSIVIDADE



Testar pelo menos larguras representativas:



320px;

375px;

390px;

768px;

1024px;

1366px;

1440px.



Não criar layout específico apenas para um aparelho.



67\. PERFORMANCE



Otimizar com bom senso.



Utilizar:



lazy loading de rotas quando benéfico;

índices no IndexedDB;

consultas eficientes;

memoização apenas quando necessária.



Não utilizar useMemo e useCallback indiscriminadamente.



Evitar:



loops desnecessários;

consultas repetidas;

múltiplos listeners duplicados;

renders provocados por estado mal planejado.

68\. SEGURANÇA



Seguir estes princípios:



nenhum secret no frontend;

nenhuma senha própria armazenada;

validação dos dados;

RLS;

menor privilégio;

isolamento por estabelecimento;

não confiar apenas na interface para autorização;

tratamento seguro de erros;

dependências controladas.



Criar:



SECURITY.md



Documentar:



como reportar vulnerabilidades;

secrets;

RLS;

autenticação;

limites atuais.

69\. PRIVACIDADE



Coletar apenas dados necessários.



Não adicionar analytics invasivos sem necessidade.



Caso pesquisas com usuários sejam realizadas:



evitar dados pessoais desnecessários;

anonimizar resultados quando possível;

documentar consentimento;

respeitar as orientações da instituição e do orientador.

70\. TESTES UNITÁRIOS



Utilizar Vitest.



Priorizar regras importantes.



Criar testes para:



Estoque

entrada correta;

saída correta;

saída igual ao estoque disponível;

saída maior que disponível;

quantidade zero;

quantidade negativa.

Status

estoque normal;

estoque baixo;

estoque igual ao mínimo;

estoque zero.

Valores

reais para centavos;

centavos para reais;

entradas inválidas.

Validações

produto válido;

produto sem nome;

código duplicado quando aplicável;

preços inválidos.

Sincronização

criação de outbox;

retry;

estado de erro;

conflito de versão.

71\. TESTES DO BANCO LOCAL



Utilizar ambiente de IndexedDB apropriado nos testes.



Preferencialmente:



fake-indexeddb



Testar:



inserção;

atualização;

soft delete;

consultas;

transações;

rollback;

migrações quando possível.



Cada teste deve ser isolado.



Não deixar dados de um teste contaminarem outro.



72\. TESTES DE COMPONENTES



Utilizar React Testing Library.



Testar comportamento do usuário.



Exemplos:



abrir formulário;

preencher;

enviar;

ver erro;

confirmar sucesso.



Evitar testar detalhes internos da implementação.



Preferir:



getByRole;

getByLabelText;

getByText quando apropriado.



Evitar depender exageradamente de test IDs.



73\. TESTES END-TO-END



Utilizar Playwright.



Fluxos essenciais:



Produto

abrir aplicação;

cadastrar produto;

verificar listagem;

editar;

buscar;

excluir.

Estoque

cadastrar produto;

registrar entrada;

conferir quantidade;

registrar saída;

conferir quantidade;

tentar saída inválida;

verificar mensagem.

Alertas

cadastrar produto com mínimo;

reduzir estoque;

verificar alerta.

Offline

carregar aplicação;

simular offline;

cadastrar ou alterar dado;

verificar persistência local;

restaurar conexão;

verificar comportamento da fila.

Autenticação



Quando disponível:



login;

rota protegida;

logout.

74\. COVERAGE



Priorizar cobertura nas áreas críticas.



Não buscar 100% apenas para aumentar número.



Como meta inicial:



alta cobertura nas regras de domínio;

alta cobertura nos serviços de estoque;

alta cobertura na sincronização;

testes essenciais dos fluxos principais.



Caso seja definido threshold, utilizar valor realista.



75\. SCRIPTS DO PACKAGE.JSON



Garantir scripts equivalentes a:



dev;

build;

preview;

lint;

lint;

typecheck;

format;

format;

test;

test;

test;

e2e;

e2e.



Não adicionar script quebrado.



Após configurar:



executar e verificar.



76\. TYPECHECK



Criar script:



npm run typecheck



Usando, quando adequado:



tsc --noEmit



O projeto deverá passar sem erros TypeScript antes de considerar uma etapa concluída.



Não resolver problemas utilizando any indiscriminadamente.



77\. ESLINT



Configurar e corrigir erros importantes.



Não desabilitar regras inteiras apenas porque aparecem erros.



Quando uma regra precisar ser alterada:



justificar;

manter consistência.

78\. PRETTIER



Caso utilizado:



criar configuração;

evitar conflito com ESLint;

adicionar scripts.



Não formatar arquivos gerados automaticamente sem necessidade.



79\. GITIGNORE



Garantir que não sejam versionados:



node\_modules;

dist;

coverage;

playwright-report;

test-results;

arquivos temporários;

.env;

secrets;

arquivos do sistema operacional;

caches.



Não ignorar .env.example.



80\. GITHUB ACTIONS



Criar workflow de CI.



Em pushes e pull requests relevantes:



checkout;

configurar Node;

instalar com npm ci ou comando equivalente baseado no lockfile;

lint;

typecheck;

testes;

build.



Playwright poderá ficar em job separado caso o tempo seja elevado.



Nunca colocar secrets diretamente no workflow.



81\. GITHUB



Criar arquivos para organização:



.github/ISSUE\_TEMPLATE/bug\_report.md



.github/ISSUE\_TEMPLATE/feature\_request.md



.github/pull\_request\_template.md



Criar boas instruções para:



descrição;

passos para reproduzir;

critérios de aceite;

screenshots quando aplicável;

checklist de testes.

82\. COMMITS



Documentar Conventional Commits.



Exemplos:



feat: adiciona cadastro de produtos



feat: implementa registro de entrada de estoque



fix: impede saída maior que estoque disponível



docs: adiciona arquitetura offline-first



test: adiciona testes das regras de estoque



refactor: separa regras de domínio dos componentes



chore: configura pipeline de integração contínua



Não realizar commits automaticamente sem verificar se o ambiente permite e se isso é esperado.



Não reescrever histórico sem autorização.



83\. BRANCHES



Documentar fluxo simples:



main: estável;

develop: integração, se realmente utilizada;

feature/\*: funcionalidades.



Não complicar excessivamente o fluxo para projeto individual.



Uma alternativa aceitável:



main;

feature/\*.



Documentar a escolha.



84\. RELEASES SUGERIDAS



Planejar:



v0.1.0 — Fundação.



v0.2.0 — Produtos e categorias.



v0.3.0 — Movimentações e alertas.



v0.4.0 — Núcleo local estabilizado.



v0.5.0 — PWA e offline avançado.



v0.6.0 — Autenticação e nuvem.



v0.7.0 — Sincronização real.



v0.8.0 — Tratamento de conflitos.



v0.9.0 — Testes com usuários e estabilização.



v1.0.0 — TCC final.



Criar CHANGELOG.md.



85\. ROADMAP



Criar ROADMAP.md dividido em milestones.



M1 — Fundação

arquitetura;

layout;

navegação;

banco local;

design system.

M2 — Produtos

CRUD;

categorias;

busca;

filtros.

M3 — Movimentações

entrada;

saída;

histórico;

validações.

M4 — Dashboard e alertas

indicadores;

estoque baixo;

movimentações recentes.

M5 — Estabilização do núcleo local

estabilização;

documentação;

testes;

release.

M6 — PWA e offline

service worker;

instalação;

cache;

experiência offline.

M7 — Nuvem

Supabase;

PostgreSQL;

Auth;

RLS.

M8 — Sincronização

outbox;

push;

pull;

retries;

estados.

M9 — Conflitos

detecção;

armazenamento;

resolução.

M10 — Validação acadêmica

entrevistas;

testes de usabilidade;

análise dos resultados.

M11 — TCC

documentação final;

estabilização;

release 1.0.

86\. README



Criar README profissional.



Incluir:



logo ou identidade textual do StockFlow;

descrição;

status;

contexto acadêmico;

problema;

solução;

funcionalidades;

screenshots, quando disponíveis;

tecnologias;

arquitetura resumida;

modo offline;

sincronização;

instalação;

variáveis de ambiente;

comandos;

testes;

estrutura;

roadmap;

TCC;

autor.



Autor:



Luiz Felipe de Souza Mariano



Não colocar dados de contato adicionais sem que já existam no projeto e sejam apropriados.



87\. DOCUMENTAÇÃO ACADÊMICA



Criar os seguintes documentos iniciais.



Tema



Sistema web responsivo de controle de estoque para pequenos comércios com funcionamento offline e sincronização em nuvem.



Problema



Descrever que pequenos estabelecimentos podem enfrentar dificuldades no gerenciamento de estoques devido ao uso de métodos manuais, planilhas ou sistemas que dependem constantemente de conexão à internet.



Não inventar estatísticas.



Qualquer dado estatístico futuro deverá possuir fonte confiável.



Questão de pesquisa



Exemplo inicial:



Como uma aplicação web responsiva com funcionamento offline e sincronização em nuvem pode auxiliar o controle de estoque de pequenos comércios em ambientes sujeitos a ausência ou instabilidade de conexão com a internet?



Tratar como texto provisório.



Justificativa



Abordar:



problema real;

pequenos negócios;

erros manuais;

facilidade de uso;

disponibilidade;

conectividade instável;

relevância acadêmica;

aplicação de Engenharia de Software;

bancos de dados;

PWA;

sistemas distribuídos;

UX.



Não inventar resultados antes da pesquisa.



Objetivos



Utilizar os objetivos definidos neste documento e refiná-los.



Metodologia



Criar proposta inicial que possa envolver:



pesquisa aplicada;

abordagem exploratória/descritiva quando apropriada;

levantamento bibliográfico;

levantamento de requisitos;

desenvolvimento incremental;

prototipação;

testes de software;

avaliação de usabilidade.



Não afirmar classificação metodológica definitiva sem revisão acadêmica futura.



Delimitação



Explicar o que o sistema não pretende resolver.



88\. REQUISITOS FUNCIONAIS



Criar arquivo com IDs.



Exemplo:



RF001 — Cadastrar produto.



RF002 — Editar produto.



RF003 — Excluir logicamente produto.



RF004 — Listar produtos.



RF005 — Buscar produto.



RF006 — Filtrar produtos.



RF007 — Gerenciar categorias.



RF008 — Registrar entrada.



RF009 — Registrar saída.



RF010 — Consultar histórico.



RF011 — Identificar estoque baixo.



RF012 — Exibir dashboard.



RF013 — Operar offline.



RF014 — Manter fila de sincronização.



RF015 — Sincronizar alterações.



RF016 — Autenticar usuário.



RF017 — Proteger dados por estabelecimento.



RF018 — Exportar produtos.



RF019 — Exportar movimentações.



RF020 — Visualizar status da sincronização.



Para cada requisito:



descrição;

prioridade;

fase;

critérios de aceite.

89\. REQUISITOS NÃO FUNCIONAIS



Criar:



RNF001 — Responsividade.



RNF002 — Usabilidade.



RNF003 — Funcionamento offline.



RNF004 — Segurança.



RNF005 — Desempenho.



RNF006 — Compatibilidade.



RNF007 — Acessibilidade.



RNF008 — Manutenibilidade.



RNF009 — Confiabilidade.



RNF010 — Testabilidade.



RNF011 — Privacidade.



RNF012 — Integridade dos dados.



Especificar critérios mensuráveis quando possível.



Não inventar metas impossíveis.



90\. HISTÓRIAS DE USUÁRIO



Criar histórias como:



Como comerciante, quero cadastrar meus produtos para controlar os itens disponíveis no estoque.



Como comerciante, quero registrar a saída de um produto para manter a quantidade atualizada.



Como comerciante, quero continuar trabalhando sem internet para que uma falha na conexão não interrompa completamente minhas operações.



Como comerciante, quero ser alertado quando um produto atingir o estoque mínimo para poder planejar reposição.



Adicionar critérios de aceite.



91\. CASOS DE USO



Criar pelo menos:



UC001 — Autenticar usuário;

UC002 — Cadastrar produto;

UC003 — Editar produto;

UC004 — Excluir produto;

UC005 — Registrar entrada;

UC006 — Registrar saída;

UC007 — Consultar histórico;

UC008 — Consultar alertas;

UC009 — Sincronizar dados.



Para cada caso:



ator;

pré-condições;

fluxo principal;

fluxos alternativos;

pós-condições.

92\. MATRIZ DE RASTREABILIDADE



Criar matriz relacionando:



requisito;

história;

regra de negócio;

implementação;

teste.



Exemplo:



RF008

→ US005

→ RN03/RN05

→ stockMovementService

→ stockMovementService.test.ts

→ movements.spec.ts



Isso ajuda a demonstrar engenharia de software no TCC.



93\. DIAGRAMAS



Criar diagramas em Mermaid dentro de Markdown quando apropriado.



Criar:



diagrama de contexto;

diagrama de componentes;

entidade-relacionamento;

casos de uso simplificado;

sequência de registro de movimentação;

sequência da sincronização.



Não criar diagramas inconsistentes com o código.



Atualizar documentação quando a arquitetura mudar.



94\. ADRs



Criar Architecture Decision Records.



ADR-001 — Offline-first



Registrar:



contexto;

decisão;

alternativas;

consequências.

ADR-002 — IndexedDB com Dexie



Explicar:



necessidade de banco local;

vantagens;

limitações.

ADR-003 — Supabase



Explicar:



PostgreSQL;

autenticação;

RLS;

motivos da escolha.

ADR-004 — Outbox de sincronização



Quando implementado.



ADR-005 — Soft delete



Quando implementado.



95\. PESQUISA COM PÚBLICO-ALVO



Criar documentos preparatórios.



Roteiro de entrevista inicial



Perguntas como:



Como você controla seu estoque atualmente?

Quais dificuldades enfrenta?

Já perdeu vendas por falta de informação sobre estoque?

Utiliza computador ou celular?

A internet do estabelecimento é estável?

Quais informações considera essenciais?

Qual funcionalidade mais facilitaria sua rotina?



Não conduzir pesquisa automaticamente.



Apenas criar instrumento para posterior aplicação e aprovação acadêmica.



96\. QUESTIONÁRIO DE USABILIDADE



Criar questionário para avaliação futura.



Avaliar:



facilidade de aprendizado;

clareza;

velocidade para realizar tarefas;

organização das informações;

satisfação;

comportamento offline;

mensagens de erro;

intenção de uso.



Utilizar escala consistente.



Adicionar perguntas abertas.



Não afirmar resultados antes da aplicação.



97\. PLANO DE TESTES COM USUÁRIOS



Preparar tarefas.



Exemplo:



Tarefa 1:



Cadastrar um produto.



Tarefa 2:



Registrar entrada.



Tarefa 3:



Registrar saída.



Tarefa 4:



Encontrar produto com estoque baixo.



Tarefa 5:



Utilizar sistema sem internet.



Métricas possíveis:



sucesso;

tempo;

erros;

necessidade de ajuda;

satisfação percebida.



Não coletar dados pessoais desnecessários.



98\. DOCUMENTAÇÃO DE TESTES



Criar plano contendo:



objetivo;

ambiente;

tipos de teste;

casos;

resultados esperados;

evidências;

responsáveis;

status.



Manter documento de resultados atualizado.



Não declarar teste como aprovado sem executá-lo.



99\. DADOS DE DEMONSTRAÇÃO



Criar mecanismo opcional de seed para desenvolvimento.



Exemplos:



Arroz;

Feijão;

Açúcar;

Café;

Refrigerante.



Não deixar mock permanente confundido com dados reais.



Criar forma clara de ativar dados demo apenas em desenvolvimento.



100\. CONFIGURAÇÃO DE DESENVOLVIMENTO



Criar .env.example.



Exemplo:



VITE\_SUPABASE\_URL=

VITE\_SUPABASE\_ANON\_KEY=



Caso exista flag de demonstração:



VITE\_ENABLE\_DEMO\_DATA=false



Não colocar valores reais.



101\. EXPERIÊNCIA DO DESENVOLVEDOR



Criar boas mensagens de erro.



Garantir comandos simples:



npm install



npm run dev



npm run build



npm run lint



npm run typecheck



npm run test



Documentar versões mínimas necessárias de:



Node;

npm.



Basear-se no ambiente real e nas dependências atuais.



102\. VS CODE



Criar .vscode/ somente se agregar valor.



Possíveis arquivos:



extensions.json



Com recomendações como:



ESLint;

Prettier, caso usado;

Tailwind CSS IntelliSense;

Playwright, caso usado.



settings.json



Somente configurações úteis ao projeto.



Não impor preferências pessoais desnecessárias.



103\. TODO E DÍVIDA TÉCNICA



Não espalhar dezenas de:



TODO



sem contexto.



Quando algo ficar pendente, registrar:



descrição;

motivo;

impacto;

fase futura.



Preferencialmente em:



ROADMAP;

Issue;

documento de dívida técnica.

104\. NÃO MASCARAR ERROS



Nunca:



ignorar erro TypeScript com @ts-ignore sem justificativa;

usar any para silenciar tudo;

remover teste porque está falhando;

desativar lint indiscriminadamente;

marcar operação como sincronizada sem confirmação;

fingir que integração externa está funcionando sem credenciais;

declarar build aprovado sem executar.

105\. COMANDOS DESTRUTIVOS



Não executar sem necessidade:



remoção de .git;

git reset --hard;

force push;

exclusão em massa;

limpeza de banco real;

drop de tabelas de produção.



Não mexer fora da pasta raiz do projeto.



Antes de usar:



git add .



confirmar que o repositório correto está sendo utilizado.



Quando possível, verificar:



git rev-parse --show-toplevel



Evitar repetir problemas de indexação de arquivos externos à pasta do projeto.



106\. FLUXO DE IMPLEMENTAÇÃO



Trabalhar em fases.



Não tentar escrever centenas de arquivos sem validar nada.



Após cada fase:



verificar imports;

verificar TypeScript;

executar lint;

executar testes relevantes;

executar build;

corrigir problemas;

somente então avançar.

107\. FASE 0 — AUDITORIA



Executar primeiro.



Entregar internamente:



stack detectada;

funcionalidades existentes;

estrutura;

dependências;

problemas;

riscos;

testes existentes;

lacunas.



Depois começar alterações.



108\. FASE 1 — FUNDAÇÃO



Objetivos:



estrutura organizada;

TypeScript;

lint;

scripts;

layout;

navegação;

componentes básicos;

design system inicial;

banco Dexie inicial;

tipos;

documentação básica.



Critério:



npm run build



deve funcionar.



109\. FASE 2 — PRODUTOS E CATEGORIAS



Implementar:



listagem;

cadastro;

edição;

exclusão lógica;

busca;

filtros;

categorias;

validação;

IndexedDB.



Criar testes.



110\. FASE 3 — MOVIMENTAÇÕES



Implementar:



entradas;

saídas;

transações atômicas;

histórico;

filtros;

regras.



Criar testes rigorosos.



111\. FASE 4 — DASHBOARD E ALERTAS



Implementar:



indicadores reais;

recentes;

estoque baixo;

sem estoque;

período quando adequado.

112\. FASE 5 — ESTABILIZAÇÃO DO NÚCLEO DO TCC



Criar:



documentação do estado funcional;

release identificável;

checklist;

screenshots quando disponíveis;

relatório do que está implementado.



Não interromper a evolução geral do TCC.



Essa entrega deverá ser um subconjunto estável do TCC completo e não altera a identidade acadêmica do StockFlow como TCC.



113\. FASE 6 — PWA E OFFLINE



Implementar:



manifest;

service worker;

cache;

offline;

instalação;

feedback;

teste offline.

114\. FASE 7 — SUPABASE E AUTH



Implementar:



client;

variáveis;

migrations;

Auth;

rotas;

onboarding;

profiles;

businesses;

memberships;

RLS.



Caso credenciais não estejam disponíveis:



criar tudo que for possível;

não bloquear outras etapas.

115\. FASE 8 — SINCRONIZAÇÃO



Implementar:



outbox;

fila;

push;

pull;

retry;

status;

última sincronização;

erros;

central de sincronização.

116\. FASE 9 — CONFLITOS



Implementar:



versionamento;

detecção;

armazenamento;

interface;

resolução.



Priorizar cenários relevantes.



117\. FASE 10 — TESTES E QUALIDADE



Ampliar:



unitários;

integração;

componentes;

E2E;

offline;

auth;

sync.



Configurar CI.



118\. FASE 11 — VALIDAÇÃO ACADÊMICA



Preparar:



entrevistas;

questionários;

plano;

registro de resultados;

estrutura para análise.



Nunca inventar respostas.



119\. CRITÉRIOS DE ACEITE GERAIS



O sistema somente será considerado satisfatório quando, de acordo com a fase implementada:



Produtos

cadastra;

edita;

exclui logicamente;

busca;

filtra;

persiste após refresh.

Estoque

entrada funciona;

saída funciona;

estoque atualiza;

histórico é criado;

saída inválida é bloqueada.

Dashboard

usa dados reais;

atualiza corretamente.

Alertas

identifica corretamente estoque baixo.

Offline

aplicação permanece utilizável;

dados permanecem locais;

usuário recebe feedback.

PWA

manifest válido;

service worker funcional;

build não quebra.

Auth

login;

logout;

proteção de rota.

Segurança

RLS;

sem secrets no frontend.

Sync

pendências;

envio;

recebimento;

erro;

retry;

status.

Testes

principais regras cobertas.

Qualidade

lint;

typecheck;

testes;

build.

120\. DEFINIÇÃO DE PRONTO



Uma tarefa somente poderá ser considerada concluída quando:



código implementado;

tipos corretos;

erros tratados;

interface responsiva;

acessibilidade básica;

testes aplicáveis;

documentação atualizada;

lint sem erros relevantes;

typecheck aprovado;

build aprovado.

121\. SAÍDA ESPERADA AO FINAL DE CADA SESSÃO DE TRABALHO



Sempre apresentar:



resumo do que foi analisado;

arquivos criados;

arquivos alterados;

decisões técnicas;

funcionalidades implementadas;

testes adicionados;

comandos executados;

resultado de lint;

resultado de typecheck;

resultado de testes;

resultado do build;

pendências;

próximos passos recomendados.



Não afirmar:



Tudo está funcionando perfeitamente



sem evidência.



122\. PRIORIDADE DE IMPLEMENTAÇÃO



Quando existir conflito entre muitas tarefas, priorizar nesta ordem:



integridade dos dados;

regras de estoque;

segurança;

funcionamento local;

estabilidade;

usabilidade;

testes;

sincronização;

estética;

funcionalidades extras.



Uma interface bonita não compensa dados incorretos.



123\. SIMPLICIDADE



Apesar da abrangência deste documento:



Não transforme o projeto em um monstro impossível de manter.



Aplique:



YAGNI quando apropriado.



Evite:



abstrações sem uso;

padrões apenas por moda;

microserviços;

Kubernetes;

filas externas;

infraestrutura excessiva;

backend separado sem necessidade clara.



O objetivo é um TCC tecnicamente sólido, não uma infraestrutura de multinacional.



124\. AUTONOMIA PARA DECISÕES



Você pode tomar pequenas decisões técnicas sem pedir confirmação quando:



forem reversíveis;

forem coerentes;

não alterarem o escopo;

melhorarem qualidade.



Para decisões arquiteturais relevantes:



documentar em ADR;

explicar trade-offs.

125\. COMENTÁRIOS NO CÓDIGO



Não comentar o óbvio.



Evitar:



// incrementa contador



Adicionar comentários quando explicarem:



motivo;

regra complexa;

limitação;

comportamento de sync;

workaround.



Preferir código autoexplicativo.



126\. NOMENCLATURA



Manter código preferencialmente em inglês:



Product;

StockMovement;

Category;

registerEntry;

registerExit.



Interface em português brasileiro.



Documentação acadêmica em português brasileiro.



Não misturar:



produtoService



com:



stockMovementRepository



sem convenção.



127\. FORMATAÇÃO DE TEXTOS DA INTERFACE



Utilizar textos naturais.



Bom:



Estoque insuficiente. Existem apenas 3 unidades disponíveis.



Ruim:



Error stock quantity invalid.



Bom:



Modo offline. Suas alterações ficarão salvas neste dispositivo e serão sincronizadas quando possível.



128\. LOGS



Evitar console.log espalhados.



Criar mecanismo mínimo quando necessário.



Em produção:



não expor tokens;

não expor senhas;

não expor dados sensíveis.



Sincronização pode registrar:



timestamp;

tipo;

entidade;

resultado;

mensagem sanitizada.

129\. AUDITORIA



Avaliar histórico de ações importantes.



Movimentações já funcionam como parte do histórico.



Para ações administrativas futuras, considerar audit log.



Não implementar sistema de auditoria gigante sem necessidade.



130\. VERSIONAMENTO DE SCHEMA



Manter:



Dexie versions;

migrations Supabase;

versão do formato de backup.



Documentar alterações.



Não mudar estrutura silenciosamente.



131\. MIGRAÇÕES SUPABASE



Cada mudança relevante deve possuir migration.



Exemplo:



202607120001\_create\_initial\_schema.sql



202607120002\_enable\_rls.sql



202607120003\_create\_stock\_movement\_function.sql



Usar nomenclatura coerente.



132\. SEED



Criar seed.sql apenas para desenvolvimento.



Não misturar dados demo com produção.



133\. TESTE DE BUILD



Sempre executar:



npm run build



antes de concluir uma etapa importante.



Corrigir:



imports;

tipos;

assets;

variáveis;

rotas.



Não confiar apenas em npm run dev.



134\. DOCUMENTAÇÃO DE ARQUITETURA OFFLINE-FIRST



Explicar:



por que local-first;

IndexedDB;

Dexie;

fluxo de leitura;

fluxo de escrita;

outbox;

sincronização;

conflitos;

limitações.



Criar diagrama.



135\. DOCUMENTAÇÃO DA SINCRONIZAÇÃO



Explicar:



Escrita



UI

→ domínio

→ transação Dexie

→ entidade local

→ outbox.



Push



Outbox

→ Sync Service

→ Supabase

→ confirmação

→ status.



Pull



Supabase

→ cursor

→ dados novos

→ validação

→ transação local.



Conflito



versão local

≠ versão esperada

→ registrar conflito

→ resolução.



136\. DIAGRAMA DE SEQUÊNCIA DA SINCRONIZAÇÃO



Criar em Mermaid algo conceitualmente equivalente a:



Usuário

→ Interface

→ Serviço

→ IndexedDB

→ Outbox.



Depois:



Online Status

→ Sync Engine

→ Supabase.



Depois:



Supabase

→ Sync Engine

→ IndexedDB

→ Interface.



Adaptar ao código real.



137\. TRABALHOS FUTUROS



Documentar como possibilidades, não como obrigatoriedade:



leitura de código de barras pela câmera;

QR Code;

previsão de demanda;

relatórios avançados;

integração com fornecedores;

app mobile nativo;

múltiplas filiais;

permissões avançadas;

integração fiscal.



Não implementar tudo.



138\. CHECKLIST FINAL TÉCNICO



Antes de considerar o projeto pronto:



Estrutura organizada.



README atualizado.



.env.example.



.gitignore correto.



Produtos funcionando.



Categorias funcionando.



Entrada funcionando.



Saída funcionando.



Histórico funcionando.



Alertas funcionando.



Dashboard real.



IndexedDB.



PWA.



Offline.



Auth.



RLS.



Sincronização.



Retry.



Conflitos documentados.



Testes.



CI.



Build.



Documentação.



escopo do TCC delimitado.



TCC documentado.



139\. PRIMEIRA AÇÃO A SER EXECUTADA AGORA



Comece imediatamente pela auditoria do projeto existente.



Não recrie o projeto.



Execute:



descubra a raiz real do projeto;

verifique se existe .git;

analise git status, sem alterar nada;

leia o package.json;

descubra o package manager;

analise a estrutura de pastas;

encontre implementação atual de:

dashboard;

produtos;

movimentações;

alertas;

Dexie;

offline;

PWA;

sincronização.

analise os testes;

analise documentação;

identifique problemas.



Em seguida, produza um plano concreto baseado no código real.



Depois, comece a executar a próxima ação mais importante sem esperar nova confirmação, exceto quando existir bloqueio real causado por credenciais ou informação externa impossível de obter pelo projeto.



140\. REGRA DE CONTINUIDADE



Este projeto será desenvolvido ao longo de meses.



Portanto:



não criar código descartável;

não tomar atalhos que prejudiquem etapas futuras;

não implementar sincronização falsa como solução final;

não abandonar documentação;

não modificar arquitetura sem registrar motivos;

manter o histórico de evolução.



O StockFlow deve permitir entregas incrementais estáveis, mantendo o mesmo código em evolução natural até a conclusão do TCC.



141\. REGRA DE APRENDIZADO E EXPLICAÇÃO



O proprietário do projeto é estudante de Sistemas de Informação e precisará compreender e defender a solução.



Portanto, ao finalizar mudanças importantes:



Explique de forma clara:



o que foi feito;

por que foi feito;

como funciona;

onde está no código;

quais decisões foram tomadas;

quais limitações existem.



Não produza código excessivamente obscuro.



Não esconda regras importantes em abstrações desnecessariamente complexas.



142\. REGRA CONTRA DEPENDÊNCIA EXCESSIVA DE IA



A arquitetura, código e documentação devem permanecer compreensíveis para um desenvolvedor humano.



Não criar:



arquivos gigantescos;

funções enormes;

padrões inconsistentes;

comentários artificiais;

documentação que não corresponde ao código.



O objetivo é que o projeto possa ser continuado manualmente no futuro.



143\. REGRA FINAL



Trate o StockFlow como:



projeto acadêmico;

produto real;

portfólio profissional;

base para o TCC.



Mas mantenha o escopo realista.



Priorize:



integridade;

clareza;

usabilidade;

arquitetura;

offline-first;

sincronização;

segurança;

testes;

documentação.



Comece analisando o projeto real existente e evolua-o incrementalmente.



Nunca finja ter executado algo que não executou.



Nunca esconda erros.



Nunca exponha secrets.



Nunca destrua trabalho existente sem justificativa.



Ao final de cada grande etapa, execute as verificações disponíveis e apresente evidências dos resultados.

