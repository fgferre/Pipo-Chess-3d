# AGENTS.md

## Mandatory Principles (Always On)

1. Read the relevant files before changing code.
2. Preserve existing user changes unless explicitly told to replace them.
3. Make the smallest change that fully solves the issue: find the root cause, touch only necessary code, prefer small and reversible diffs. Avoid hacks, broad refactors, and rewriting working code.
4. Do not invent APIs, routes, data contracts, or environment assumptions.
5. Keep business logic in testable functions and UI glue thin.
6. Add or update tests when behavior changes.
7. Run the smallest meaningful verification before finishing.
8. Call out assumptions, known risks, and anything not verified.
9. Never use destructive git commands without explicit approval.
10. Keep documentation, scripts, and config aligned with the actual codebase.
11. Before creating any file, folder, or module — or reorganizing the structure: search for existing equivalents first. Only proceed if nothing fits (and explain why). Never rename, move, or reorganize unless explicitly requested.
12. Before finishing a task, do a cleanup pass: remove temporary debug code, dead branches, redundant helpers, and any legacy/shim introduced unless still required.
13. Follow the existing code style, patterns, and naming conventions of the project.
14. Robustness: Handle the full lifecycle of a feature: edge cases, error states, loading, and empty states. Don't just solve the "happy path".
15. Performance & Efficiency: Prioritize efficient code. Consider algorithmic complexity, unnecessary renders/re-renders, and network/resource usage.
16. Rationalization: Avoid over-engineering. Ensure technical decisions are rational, sustainable, and the simplest possible way to achieve the goal.
17. Clean Code Architecture: Ensure meaningful naming, SRP (Single Responsibility), and DRY (Don't Repeat Yourself) are applied to every module.
