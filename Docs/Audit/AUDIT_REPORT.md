# Auditoria Técnica — Pipo Chess 3D

**Data:** 2026-03-16
**Escopo:** Implementação completa vs. documentação oficial (Epic Brief, Core Flows, Tech Plan, Tickets T1–T8, Execution Plans)

---

## 1. Escopo Auditado

| Fonte de verdade | Arquivo |
|---|---|
| Epic Brief | `Docs/Specs/Epic_Brief_—_Pipo_Chess_3d.md` |
| Core Flows | `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md` |
| Tech Plan | `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md` |
| Tickets | `Docs/Tickets/T1.md` a `T8.md` (inclui T2a-FIX, T3b) |
| Código-fonte | `src/`, `e2e/`, `vite.config.ts`, `src/index.css` |

Arquivos auditados em detalhe:
- `src/types/game.ts`, `src/data/themes.ts`, `src/state/gameStore.ts`
- `src/game/gameService.ts`, `src/game/analysis.ts`
- `src/App.tsx`, `src/components/ChessScene.tsx`
- `src/scene/ChessStage.ts`, `src/scene/ChessStage.test.ts`
- `src/persistence/db.ts`, `src/index.css`
- `src/App.test.tsx`, `e2e/app.spec.ts`, `vite.config.ts`

---

## 2. Sumário Executivo

O projeto está em estado avançado de implementação. **Tickets T1 a T6 estão conformes** com suas especificações. O **T7 (UI glassmorphism)** foi entregue e está funcional, com todos os componentes presentes. O **T8 (integração final)** está parcialmente coberto — limpeza de GLTF e wiring de camera/animation já feitos, mas existem gaps.

Foram identificados **1 bug de alta severidade** (clock reset no undo/redo), **1 bug de média severidade** (pointer-events, já corrigido mas não commitado), **3 edge cases**, e **6 observações** de housekeeping.

---

## 3. Matriz por Ticket

| Ticket | Título | Status | Evidência |
|---|---|---|---|
| **T1** | Extensão de tipos e dados | ✅ Conforme | `types/game.ts`: ThemeDefinition (l.50-52), AppSettings (l.125-126), PendingPromotion (l.188), AnalysisCursorState (l.193), NewGameOptions (l.198). `themes.ts`: 3 temas com canvasAccent/canvasFelt/canvasFog. |
| **T2a** | Port visual do mockup | ✅ Conforme | `ChessStage.ts`: geometrias procedurais (LatheGeometry, ExtrudeGeometry, CylinderGeometry) para 6 tipos de peça. MeshPhysicalMaterial com clearcoat. Lighting 3-luzes. PMREMGenerator + RoomEnvironment. OrbitControls com damping. |
| **T2a-FIX** | Correções de aceite | ✅ Conforme | Click-vs-drag gate implementado (pointerdown→pointerup com threshold). Felt visível sob tabuleiro. Disposal de highlights e materiais no `dispose()`. |
| **T3** | Tematização do tabuleiro | ✅ Conforme | `applyTheme()` consome boardLight, boardDark, boardFrame, canvasAccent, canvasFelt, canvasFog. Troca de tema visível em tempo real. |
| **T3b** | Housekeeping (background + testes) | ✅ Conforme | Canvas transparente, backdrop delegado ao shell. `ChessStage.test.ts` formalizado com 16 testes cobrindo transições, animações, raycasting, drag, highlights, disposal, temas, fog, iluminação. |
| **T4** | Interatividade (raycasting, drag, highlights) | ✅ Conforme | 1 dedo = jogo, 2 dedos = órbita (mobile). Click vs drag (desktop). Tap-tap + drag-and-drop. Highlights com seleção, destinos válidos, hint pulsante, último lance da IA. |
| **T5** | Sistema de animações | ✅ Conforme | Pipeline de tweening interno. Modos normal (~300ms Bézier), reduced (~150ms linear), off (instantâneo). Animações: lance normal, captura (fade+scale), roque (coordenado), en passant, promoção, undo/redo reverso. |
| **T6** | Presets de câmera e modo 2D | ✅ Conforme | 4 presets (classic/side/topdown/2d). Crossfade 3D↔2D com sprites Unicode (12 variantes). Transições suaves respeitam animationMode. `setCameraPreset()` e `setAnimationMode()` integrados via `ChessScene.tsx`. |
| **T7** | UI glassmorphism mobile-first | ✅ Conforme | Todos os 9 componentes presentes em `App.tsx`: TopBar, BottomBar, HistoryPanel, MenuDrawer, NewGameSheet, PromotionPopup, ResultModal, CameraPresetPicker, EvalBar. Canvas 100vw×100vh. Glassmorphism (backdrop-filter blur, semi-transparent). |
| **T8** | Integração final e limpeza | ⚠️ Parcial | GLTF removido do path crítico (✅). `setCameraPreset`/`setAnimationMode` wired (✅). Mas: changeset não commitado, pnpm-lock.yaml stray, cobertura E2E parcial para novos flows. |

---

## 4. Findings por Severidade

### 🔴 Bugs (Blockers / High)

#### B1 — Clock reseta no Undo/Redo em vez de restaurar

| Campo | Detalhe |
|---|---|
| **Severidade** | Alta |
| **Localização** | `src/game/gameService.ts` linhas 172 e 191 |
| **Descrição** | `undoTurn()` e `redoTurn()` chamam `createInitialClockState(session.settings.clockConfig, chess.turn())` — isso **cria um clock zerado** em vez de restaurar o tempo anterior ao lance desfeito. |
| **Causa raiz** | `SerializableMove` (`types/game.ts` l.55-67) **não armazena `clockState`** por lance. Não existe snapshot de tempo para restaurar. |
| **Impacto** | Em partidas com relógio, desfazer um lance reseta ambos os relógios para o tempo inicial. Viola Core Flow 4 ("Both clocks restored to time at that position"). |
| **Correção sugerida** | Adicionar `clockState: SerializableClockState` ao `SerializableMove`. Salvar snapshot do clock antes de cada lance. Restaurar no undo/redo. |

### 🟡 Bugs (Medium)

#### B2 — Pointer-events nos overlays fechados (CORRIGIDO, não commitado)

| Campo | Detalhe |
|---|---|
| **Severidade** | Média |
| **Localização** | `src/index.css` |
| **Status** | ✅ Corrigido no working tree |
| **Descrição** | `.menu-drawer`, `.camera-picker` e `.new-game-sheet` agora têm `pointer-events: none` no estado fechado e `pointer-events: auto` no `.is-open`. Segue padrão do `.history-panel`. |
| **Evidência** | CSS verificado: `.menu-drawer, .camera-picker { pointer-events: none; }` (l.369) e `.is-open { pointer-events: auto; }` (l.386). `.new-game-sheet` idem (l.474/479). |
| **Pendência** | Changeset inteiro não commitado (ver O2). |

---

### 🟠 Edge Cases

#### E1 — Classificação de lances simplificada (4 categorias vs 5 da spec)

| Campo | Detalhe |
|---|---|
| **Localização** | `src/game/analysis.ts` l.115-129, `src/types/game.ts` l.103 |
| **Spec** | Core Flows Flow 7: "Brilliant (✨ blue), Good (✅ green), Inaccuracy (⚠️ yellow), Error (❌ orange), Blunder (💀 red)" — **5 categorias** |
| **Implementação** | `MoveTag = "best" \| "inaccuracy" \| "mistake" \| "blunder"` — **4 categorias** |
| **Delta** | "Brilliant" mapeado como "best". "Good" não existe. "Error" renomeado "mistake". Funcional e aceitável, mas diverge da nomenclatura visual da spec. |
| **Impacto** | Baixo. Análise funciona, mas badges visuais não correspondem exatamente à spec. |

#### E2 — Sensibilidade de câmera não configurável

| Campo | Detalhe |
|---|---|
| **Spec** | Core Flows Flow 8: "Camera Preferences: Rotation and zoom sensitivity" |
| **Implementação** | OrbitControls com damping fixo. Sem UI para ajustar sensibilidade. |
| **Impacto** | Baixo. Feature de conforto, não bloqueia uso. |

#### E3 — Barra de progresso da análise é textual

| Campo | Detalhe |
|---|---|
| **Spec** | Core Flows Flow 7: "shows progress bar" durante análise |
| **Implementação** | `App.tsx` mostra estado de progresso como texto/spinner, não barra visual com percentual. |
| **Impacto** | Baixo. Funcional, mas menos polido que a spec sugere. |

---

### 🔵 Observações (Housekeeping)

#### O1 — App.tsx monolítico (1286 linhas)

Todos os 9 componentes UI estão inline em `App.tsx` em vez de arquivos separados. Funcional, mas dificulta manutenção. Tech Plan previa componentes separados (`TopBar.tsx`, `BottomBar.tsx`, etc.).

#### O2 — Changeset não commitado

`git status` mostra modificações extensas em 14 arquivos + 3 untracked. Inclui remoção de `pipo-chess-set.gltf` e `generate-chess-assets.mjs`. Nenhum commit desde `45e36c2` (T7).

#### O3 — pnpm-lock.yaml stray

Arquivo `pnpm-lock.yaml` untracked. Projeto usa npm (tem `package-lock.json`). Provavelmente gerado acidentalmente.

#### O4 — analysis.test.ts untracked

`src/game/analysis.test.ts` existe mas não está versionado. Deve ser commitado.

#### O5 — HistoryPanel desktop: abertura lateral não documentada

No desktop (`min-width: 900px`), o `.history-panel` ancora à direita em vez de slide. Comportamento funcional mas não descrito nas specs como diferenciação explícita.

#### O6 — Cobertura E2E parcial para novos flows

`e2e/app.spec.ts` cobre: boot, câmera, settings, PGN import, análise, export, offline. **Não cobre** explicitamente: new game flow completo (cor/nível/tempo), undo/redo, drag-and-drop, promotion, result modal, hint visual.

---

## 5. O que Está Validado

| Aspecto | Método de Verificação | Status |
|---|---|---|
| Geometrias procedurais (6 tipos) | Leitura de `ChessStage.ts` — LatheGeometry, ExtrudeGeometry, CylinderGeometry | ✅ |
| Sem GLTFLoader no código-fonte | Grep em `src/` | ✅ Zero referências |
| Sem console.log no código-fonte | Grep em `src/` | ✅ Zero ocorrências |
| 3 temas com campos completos | Leitura de `themes.ts` | ✅ classic-wood, emerald, slate |
| 4 presets de câmera | Leitura de `ChessStage.ts` CAMERA_PRESET_PROFILES | ✅ classic, side, topdown, 2d |
| Crossfade 3D↔2D com sprites | Leitura de `ChessStage.ts` — SPRITE_GLYPHS, spriteOpacity | ✅ 12 variantes |
| Pipeline de animação (3 modos) | Leitura de `ChessStage.ts` — ANIMATION_MODE_CONFIG | ✅ normal, reduced, off |
| Drag-and-drop | Leitura de `ChessStage.ts` — DragState interface | ✅ |
| Separação de gestos mobile | Leitura de `ChessStage.ts` — OrbitControls config | ✅ 1 dedo=jogo, 2=órbita |
| Glassmorphism UI | Leitura de `index.css` — backdrop-filter, blur, semi-transparent | ✅ |
| Pointer-events em overlays | Leitura de `index.css` — none/auto por painel | ✅ Todos 4 painéis |
| Persistência IndexedDB | Leitura de `db.ts` — 4 tabelas | ✅ settings, autosave, saves, analyses |
| PWA configurado | Leitura de `vite.config.ts` — VitePWA, workbox, manifest | ✅ |
| Random color funciona | Leitura de `gameStore.ts` — `resolveNewGamePlayerColor` | ✅ Math.random() < 0.5 |
| IA joga primeiro se Pretas | Leitura de `gameStore.ts` l.440-446 | ✅ |
| Wiring camera/animation | Leitura de `ChessScene.tsx` — useEffect para preset e mode | ✅ |
| Testes unitários | `ChessStage.test.ts` (16 testes), `App.test.tsx` (5 testes) | ✅ |
| Teste E2E | `app.spec.ts` — 7 flows cobertos | ✅ Parcial |

---

## 6. Ações Recomendadas (por prioridade)

| # | Ação | Esforço | Impacto |
|---|---|---|---|
| 1 | **Corrigir B1**: Adicionar `clockState` ao `SerializableMove`, salvar/restaurar no undo/redo | Médio | Alto — bloqueia uso correto de relógio |
| 2 | **Commitar changeset** completo (14 arquivos modificados + untracked) | Baixo | Alto — preserva trabalho feito |
| 3 | **Remover** `pnpm-lock.yaml` (O3) e **commitar** `analysis.test.ts` (O4) | Mínimo | Médio — higiene do repo |
| 4 | **Expandir cobertura E2E** (O6): new game com cor, undo/redo, promotion, hint | Médio | Médio — confiança no sistema |
| 5 | **Considerar** split de `App.tsx` em componentes separados (O1) | Alto | Médio — manutenibilidade |
| 6 | **Considerar** adicionar "good" à classificação de lances (E1) | Baixo | Baixo — fidelidade à spec |
| 7 | **Considerar** UI para sensibilidade de câmera (E2) | Baixo | Baixo — conforto |
| 8 | **Considerar** barra de progresso visual para análise (E3) | Baixo | Baixo — polish |

---

## Notas Finais

- A auditoria foi **read-only** — nenhum arquivo foi modificado.
- Todos os findings são baseados em **evidência direta** (linhas de código, grep, diff).
- O projeto está em excelente estado para um MVP. O bug B1 é o único item que requer correção antes de release com clock ativo.
