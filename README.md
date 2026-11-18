# pendencies (monorepo)

Monorepo pnpm workspace.

| Caminho | Package | Descrição |
| --- | --- | --- |
| [`apps/api`](apps/api) | `api` | Backend NestJS de demonstração (fluxo de evento + pendências). |
| [`packages/machine-flow`](packages/machine-flow) | `machine-flow` | Máquina de estados stateless para fluxos de aprovação. |

## Comandos (na raiz)

Orquestrado com [Turborepo](https://turborepo.com) (`turbo.json`, `ui: tui`).

```bash
pnpm install
pnpm dev          # TUI do turbo: machine-flow (tsup --watch) + API (:3000) + web (:4200, proxy /api -> :3000)
pnpm dev:api      # só a API (+ machine-flow)
pnpm dev:web      # só o front
pnpm test         # builda dependências e roda os testes de todos os packages
pnpm typecheck
pnpm build
pnpm turbo run test --filter=machine-flow   # rodar algo em um package específico
```

Na TUI: `↑/↓` troca de task, `i` entra no terminal da task (interativo), `Ctrl+Z` sai, `q`/`Ctrl+C` encerra.
