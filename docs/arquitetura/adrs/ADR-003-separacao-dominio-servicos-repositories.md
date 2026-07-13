# ADR-003 — Separação entre domínio, services e repositories

- Status: aceita
- Data: 12/07/2026

## Contexto

O módulo `localDb.ts` acumulava configuração do Dexie, migrações, consultas, validação de preços, soft delete e a transação de movimentação. Algumas páginas importavam a instância do banco diretamente, e a classificação de estoque baixo estava repetida no dashboard, produtos e alertas.

Essa estrutura era funcional para o primeiro MVP, mas aumentava o acoplamento da interface ao IndexedDB e dificultava testar responsabilidades isoladamente.

## Decisão

A aplicação passa a usar uma separação simples:

```text
UI → Service → Repository → Dexie
       ↓
     Domain
```

- `domain` contém regras puras, independentes de React e Dexie;
- `repositories` concentram operações diretas sobre tabelas;
- `services` validam e coordenam operações de negócio;
- `localDb.ts` mantém apenas configuração, schemas, migrações e a instância do banco.

A transação de estoque permanece no `stockMovementService`, pois o service coordena a atualização do produto e a criação da movimentação usando os dois repositories dentro da mesma transação Dexie.

Não foram criadas interfaces abstratas, implementações duplicadas, controllers ou casos de uso artificiais. Os repositories são módulos concretos porque existe apenas uma persistência local nesta fase.

## Consequências

- páginas deixam de conhecer tabelas e detalhes do IndexedDB;
- regras de estoque são reutilizadas consistentemente;
- consultas e mutações ficam mais fáceis de testar;
- a reatividade de `liveQuery` é preservada, pois as leituras dos repositories ainda acontecem dentro da assinatura reativa;
- o service de movimentação ainda conhece a instância Dexie para delimitar a transação, uma dependência deliberada para garantir atomicidade sem abstrações excessivas;
- uma futura integração remota deverá coexistir com a persistência local, sem transformar estes repositories em abstrações genéricas prematuramente.
