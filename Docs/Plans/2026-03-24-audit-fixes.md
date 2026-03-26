# Implementation Plan: Audit Fixes (Codex Feedback)

**Goal:** Resolve the P1 and P2 issues identified by the Codex 5.4 audit.

## Task 1: Robust Engine Search Tagging
**Files:** `src/engine/EngineClient.ts`

- [ ] **Step 1:** Modify `processLine` to only resolve `activeSearch` if a flag `isExpectingBestMove` is set.
- [ ] **Step 2:** In `evaluatePosition`, set `isExpectingBestMove = true`.
- [ ] **Step 3:** In `stop()`, set `isExpectingBestMove = false` immediately after sending `stop`.
- [ ] **Step 4:** Align rejection message to "Analysis interrupted" to avoid spurious UI errors.

## Task 2: BaseOverlay & Scrim Fixes
**Files:** `src/App.tsx`, `src/components/DecisionOverlays.tsx`

- [ ] **Step 1:** Remove `display: contents` from `BaseOverlay` and use a proper fixed container that covers the screen.
- [ ] **Step 2:** Fix duplicated scrims by removing internal scrims from `ReplaceGameDialog` and `ResultModalOverlay` and letting `BaseOverlay` handle it.
- [ ] **Step 3:** Ensure `pointer-events: none` is correctly applied during exit transitions to all relevant overlays.

## Task 3: Fix Test Types (Build Error)
**Files:** `src/scene/PostProcessingPipeline.test.ts`

- [ ] **Step 1:** Fix the typing of the mocks to match Three.js expected types and allow `npm run build` to pass.

## Verification
- [ ] `npm test`
- [ ] `npm run build`
