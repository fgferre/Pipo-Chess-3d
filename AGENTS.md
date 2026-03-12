# AGENTS.md

## Mandatory Principles

1. Read the relevant files before changing code.
2. Preserve existing user changes unless explicitly told to replace them.
3. Prefer small, reversible diffs over broad refactors.
4. Do not invent APIs, routes, data contracts, or environment assumptions.
5. Keep business logic in testable functions and UI glue thin.
6. Add or update tests when behavior changes.
7. Run the smallest meaningful verification before finishing.
8. Call out assumptions, known risks, and anything not verified.
9. Never use destructive git commands without explicit approval.
10. Keep documentation, scripts, and config aligned with the actual codebase.

## Working Style

- Understand the current implementation first.
- Make one coherent change set at a time.
- Favor explicit names and predictable data flow.
- Optimize for maintainability before cleverness.
- Treat persistence, migrations, and offline flows as high-risk areas.

## Verification

- At minimum, run lint for edited code paths.
- Run unit/integration/E2E tests when they are relevant to the change.
- If a test is failing before the task is complete, say so clearly.

## Communication

- Be direct and specific.
- Report what changed, what was verified, and what still needs attention.
- When blocked, explain the blocker and the next best action.
