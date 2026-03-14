# Presets de câmera e modo 2D/top-down

## Contexto

Refs: `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/2c83433e-787d-44fb-947d-0fcb1d075901` (Fluxo 5 — Controle de Câmera) · `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/c9191e9e-098e-42c6-8dbd-f4284d2d6260` (seção 3 — tabela do ChessStage)

Os Core Flows definem 4 presets de câmera (Perspectiva clássica, Visão lateral, Top-down 3D, Modo 2D) com transição suave entre eles. O modo 2D é um feature do MVP que envolve rotação de câmera até visão superior + crossfade de peças 3D para sprites 2D.

## Escopo

### Incluído

1. **4 presets de câmera:**

| Preset | Posição/Ângulo |
|--------|----------------|
| **Perspectiva clássica** | ~45° inclinado (default) |
| **Visão lateral** | Ângulo rasante (~15°) |
| **Top-down 3D** | Visão de cima com peças 3D |
| **Modo 2D** | Visão perfeitamente top-down com sprites 2D |

2. **Transição animada entre presets:** a câmera transiciona suavemente com interpolação de posição e target do OrbitControls.

3. **Modo 2D — transição completa:**
   - Câmera rotaciona suavemente até visão perfeitamente superior.
   - **Crossfade simultâneo:** peças 3D esmaecem (fade-out) enquanto sprites 2D aparecem (fade-in) ao mesmo tempo.
   - Os sprites 2D devem ser um set estilo chess.com (planos com textura, sempre voltados para a câmera / billboard).
   - Ao sair do modo 2D (escolhendo outro preset), o crossfade reverso acontece.

4. **Sprites 2D:** um set de 12 sprites (6 tipos × 2 cores) renderizados como `Sprite` ou `PlaneGeometry` com textura. Os sprites podem ser gerados via canvas 2D em runtime (caracteres unicode de xadrez estilizados) ou carregados como texturas pequenas.

5. **Implementação via `setCameraPreset(preset)`** já declarado na interface pública do `ChessStage`.

6. **Estado `viewMode` local** do canvas (não persistido), conforme o Tech Plan.

7. **Aplicação do `defaultViewMode`:** ao abrir ou restaurar uma sessão, o canvas inicializa no preset coerente com `settings.defaultViewMode` (`'3d'` → perspectiva clássica, `'2d'` → modo 2D).

### Explicitamente fora

- UI do seletor de preset (botão/picker) — ticket da UI.
- Animações de movimento de peças — ticket anterior.
- Mudanças em módulos de negócio.

## Dependências

- **Depende de:** `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/7e5fbcaa-804e-4c08-b172-86ce30bea25f` (tipos/settings), `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/eede9e28-314c-4477-ab2f-e029939b011e` (Port visual do mockup) e `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/c07fde1d-771e-41f7-a6ee-9d9c03e9dc38` (Interatividade do ChessStage).
- **Pode ser paralelo com:** `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/94baece0-1f78-4ea1-bb0c-3fa1487a3a45` (Animações do canvas).

## Critérios de aceite

- [x] 4 presets de câmera funcionam e transitam suavemente entre si.
- [x] O modo 2D ativa visão perfeitamente top-down com crossfade: peças 3D somem enquanto sprites 2D aparecem.
- [x] Os sprites 2D representam corretamente todas as 12 variantes (6 tipos × 2 cores).
- [x] Sair do modo 2D faz crossfade reverso (sprites somem, peças 3D reaparecem).
- [x] Seleção/jogada (tap-tap e drag-and-drop) continua funcionando em todos os presets, incluindo modo 2D.
- [x] O `viewMode` atual continua sendo estado local do canvas, mas a abertura/restauração da sessão respeita `defaultViewMode` persistido.
- [x] Transições respeitam o `animationMode` (reduced = transição mais rápida, off = troca instantânea).

## Notas de fechamento

- `ChessStage.ts` ganhou `CAMERA_PRESET_PROFILES` com 4 perfis (classic, side, topdown, 2d), transição de câmera eased com crossfade 3D↔sprites, e 12 sprites gerados via canvas 2D (glifos Unicode estilizados).
- `ChessScene.tsx` aplica `defaultViewMode` e `animationMode` via `useEffect` com wiring mínimo.
- `viewMode` é propriedade privada do `ChessStage` — estado local, não persistido.
- OrbitControls desabilitam rotação no modo 2D e durante transições de câmera.
- Validação executada:
  - `vitest run src/scene/ChessStage.test.ts src/components/ChessScene.test.tsx` — 16 testes passam
  - `tsc -p tsconfig.app.json --noEmit` — sem erros
