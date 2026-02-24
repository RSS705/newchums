# NewChums

NewChums is a full-stack event discovery and meetup platform.

---

## Canonical Documentation

| Document                        | Purpose                             |
| ------------------------------- | ----------------------------------- |
| docs/Technical_Specs.md         | Architectural decisions, invariants |
| docs/System_Map.md              | System boundaries and flows         |
| docs/Development_Setup_Guide.md | Setup, deploy, session log          |

Production Workers:

- newchums-web-dev (production despite suffix)
- newchums-api

Domain binding pending: newchums.com → Web Worker

## Documentation Contract

These docs are the source of truth:

- `docs/Technical_Specs.md` — architectural decisions, invariants, constraints, and what exists today.
  - Do **not** track phases, chunks, roadmaps, or task lists here.
  - If something is not implemented, label it explicitly as **Planned / Not Implemented**.

- `docs/System_Map.md` — architecture diagrams + key flows.
  - Keep the multi-section format (Big Picture, Flows, Local Dev, Commitments).
  - Always include the **single consolidated mega diagram** at the end.

- `docs/Development_Setup_Guide.md` — setup, dev, deploy, troubleshooting, and **session Chunks**.
  - This is the only place where daily “Chunk” logs live.
