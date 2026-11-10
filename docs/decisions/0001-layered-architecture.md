# 0001 Layered architecture with enforced boundaries
**Context.** Code quality is a primary requirement; the app will grow across eight phases.
**Decision.** Domain / application / infrastructure / interface / presentation layers, wired only in a composition root.
`eslint-plugin-boundaries` fails lint on illegal imports (proven in Phase 1: a component importing the composition root errors).
**Alternatives.** Convention only (drifts), a monorepo of packages (too heavy for a free-tier solo project).
**Consequences.** A little ceremony (ports, DTOs) in exchange for testable use cases with in-memory fakes.
