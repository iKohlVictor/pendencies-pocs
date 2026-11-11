# pendencies (monorepo)

Monorepo pnpm workspace.

| Caminho | Package | Descrição |
| --- | --- | --- |
| [`apps/api`](apps/api) | `api` | Backend NestJS de demonstração (fluxo de evento + pendências). |
| [`packages/machine-flow`](packages/machine-flow) | `machine-flow` | Máquina de estados stateless para fluxos de aprovação. |

## Comandos (na raiz)

```bash
pnpm install
pnpm dev          # builda machine-flow e sobe a API em modo watch
pnpm test         # builda machine-flow e roda os testes de todos os packages
pnpm typecheck
pnpm build
pnpm --filter machine-flow test   # rodar algo em um package específico
```
