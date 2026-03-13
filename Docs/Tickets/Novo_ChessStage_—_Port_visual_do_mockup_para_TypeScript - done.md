# Novo ChessStage — Port visual do mockup para TypeScript

## Contexto

Refs: `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/c9191e9e-098e-42c6-8dbd-f4284d2d6260` (seção 1 — Abordagem Arquitetural, seção 3 — Arquitetura de Componentes, tabela do novo ChessStage)

O `file:src/scene/ChessStage.ts` atual usa materiais `MeshStandard` simples, câmera fixa e peças via GLTF. Este ticket substitui o módulo inteiro por uma nova implementação que porta **exclusivamente o visual premium** do `file:src/assets/mockup tabuleiro 3d.html` para TypeScript, com a estrutura básica de câmera. A interatividade (raycasting, tap-tap, drag-and-drop, highlights) é coberta pelo ticket seguinte (`ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/c07fde1d-771e-41f7-a6ee-9d9c03e9dc38`).

## Escopo

### Incluído — Port visual do mockup

1. **Tabuleiro procedural:** madeira procedural com noise/grain, casas com `MeshPhysicalMaterial`, bordas duplas com acento dourado, feltro inferior — tudo portado do mockup.
2. **Peças procedurais:** todas as 6 peças (Peão, Torre, Cavalo, Bispo, Dama, Rei) via `LatheGeometry`, `ExtrudeGeometry`, `SphereGeometry` etc., conforme o mockup. Materiais `MeshPhysicalMaterial` com roughness/metalness/clearcoat calibrados.
3. **Iluminação:** `HemisphereLight` + `SpotLight` + `DirectionalLight` conforme mockup. `PMREMGenerator` + `RoomEnvironment` para reflexos nos materiais.
4. **Cena:** fog, background, renderer com tone mapping e output color space do mockup.
5. **Tematização:** os novos campos de `ThemeDefinition` (`canvasAccent`, `canvasFelt`, `canvasFog`) devem ser consumidos pelo `applyTheme()`. Cores de peças continuam vindo de `whitePiece`/`blackPiece`.
6. **OrbitControls básico:** orbit livre com damping, **sem auto-rotate**. Limites de zoom (min/max distance) e rotação vertical (min/max polar angle) para manter o tabuleiro legível. Configuração de 2 dedos para orbit em mobile fica no ticket seguinte.

### Incluído — Scaffold da interface pública

7. Criar a nova classe `ChessStage` com a interface pública compatível com `file:src/components/ChessScene.tsx`:
    - `constructor(container, onSquareSelect)`
    - `async init(): Promise<void>`
    - `update(state: RenderState): void` — neste ticket, `update()` faz rebuild posicional das peças (sem animação), idêntico ao comportamento atual.
    - `setPaused(paused: boolean): void`
    - `dispose(): void`
    - Stubs para métodos futuros: `setCameraPreset(preset)` e `setAnimationMode(mode)` (no-op por enquanto).
8. O método `rebuildPieces()` posiciona as peças corretamente nas casas, usando `squareToCoords()` existente.

### Incluído — Remoção

9. Remover o GLTF (`file:public/assets/models/pipo-chess-set.gltf`) do caminho crítico. O `init()` não deve tentar carregar GLTF.
10. Remover `GLTFLoader` import e toda a lógica de fallback GLTF.

### Explicitamente fora

- **Raycasting, tap-tap, drag-and-drop, highlights** — ticket separado de interatividade.
- **Separação de gestos mobile (1 dedo vs 2 dedos)** — ticket de interatividade.
- Animações de movimento de peças — ticket separado.
- Presets de câmera e modo 2D/top-down — ticket separado.
- Mudanças em `ChessScene.tsx` além do estritamente necessário.
- Mudanças em qualquer módulo de negócio.

## Dependências

- **Depende de:** `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/7e5fbcaa-804e-4c08-b172-86ce30bea25f` (Extensão de tipos e dados — campos de `ThemeDefinition` e `animationMode`).

## Critérios de aceite

- [ ] O tabuleiro renderiza com visual equivalente ao mockup (madeira procedural, bordas, acento, feltro).
- [ ] As 6 peças renderizam com geometrias procedurais e materiais `MeshPhysical`.
- [ ] Iluminação e reflexos são visualmente equivalentes ao mockup.
- [ ] `applyTheme()` consome corretamente `canvasAccent`, `canvasFelt`, `canvasFog` do tema ativo.
- [ ] OrbitControls básico funciona (rotação, zoom, damping, limites).
- [ ] Sem auto-rotate da câmera.
- [ ] `update(state)` posiciona peças corretamente (rebuild posicional sem animação).
- [ ] GLTF removido do caminho crítico (`init()` não carrega GLTF).
- [ ] `ChessScene.tsx` continua funcionando com a nova classe.
- [ ] Testes existentes passam sem alteração.
