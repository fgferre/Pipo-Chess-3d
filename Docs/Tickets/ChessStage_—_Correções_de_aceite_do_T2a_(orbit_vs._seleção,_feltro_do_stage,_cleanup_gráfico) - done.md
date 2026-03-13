# ChessStage — Correções de aceite do T2a (orbit vs. seleção, feltro do stage, cleanup gráfico)

## Contexto

Ref: `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/eede9e28-314c-4477-ab2f-e029939b011e` (port visual do mockup)

O port visual do `file:src/scene/ChessStage.ts` ficou funcionalmente correto, mas três lacunas identificadas na revisão do T2a impediram o aceite final. Este ticket corrige essas lacunas no menor diff possível, sem avançar no escopo dos tickets seguintes de interatividade e câmera.

---

## Escopo

### Fix 1 — Separar orbit de seleção via gate click-vs-drag

**Problema:** a seleção de casa está ligada ao evento `pointerdown`, então qualquer drag de orbit também dispara `onSquareSelect()` no store.

**Solução mínima:**
- Mover a lógica de seleção do `pointerdown` para o `pointerup`.
- Registrar a posição do ponteiro no `pointerdown` e calcular a distância percorrida até o `pointerup`.
- Disparar `onSquareSelect()` apenas se o movimento total ficou abaixo de um limiar pequeno (ex: 5–6 px).
- Manter o raycasting existente intacto; apenas atrasar o momento de disparo.

**Fora do escopo:** a separação completa de gestos mobile (1 dedo vs. 2 dedos) pertence ao ticket de interatividade (`ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/c07fde1d-771e-41f7-a6ee-9d9c03e9dc38`).

---

### Fix 2 — Feltro visível no stage respondendo a `theme.canvasFelt`

**Problema:** `canvasFelt` só existe como material de detalhe interno das peças (base do cavalo), sem nenhum elemento visível de cena que responda a ele. Não há feltro de palco legível no tabuleiro montado.

**Solução mínima:**
- Adicionar um pad ou slab de feltro como parte da montagem do tabuleiro em `buildBoard()`.
- Esse elemento deve ser visível sob as bordas do tabuleiro (posição y negativa, tamanho ligeiramente maior que `border2`).
- Deve usar o mesmo `this.feltMat` que já existe, para que mudanças de tema em `applyTheme()` reflitam nele.

---

### Fix 3 — Descarte correto de recursos gráficos

**Problema:** highlights são descartados do grafo de cena mas suas geometrias e materiais nunca são liberados. O `dispose()` do stage também não libera os recursos próprios do stage (texturas de madeira, materiais das peças e do board, mapa de ambiente).

**Solução mínima:**
- Em `updateHighlights()`: antes de limpar o `highlightGroup`, percorrer os filhos e chamar `.geometry.dispose()` e `.material.dispose()` em cada `Mesh`.
- Em `dispose()`: liberar `this.lightPieceMat`, `this.darkPieceMat`, `this.feltMat`, `this.accentMat`, `this.eyeMat`, e a textura de ambiente (`scene.environment`).
- Limpar `this.prototypes` chamando `prototype.traverse()` para liberar geometrias e materiais de cada protótipo.
- Não descartar recursos em `rebuildPieces()` porque os protótipos compartilhados ainda estão em uso pelos clones posicionados até o `dispose()` final.

---

## Dependências

Depende de `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/eede9e28-314c-4477-ab2f-e029939b011e` (T2a port visual).

## Critérios de aceite

- [ ] Arrastar o canvas para orbitar a câmera **não** dispara seleção de casa no store.
- [ ] Um clique rápido sem arraste continua selecionando casas corretamente.
- [ ] Existe um elemento visível de feltro no stage que muda de cor quando `theme.canvasFelt` muda.
- [ ] `updateHighlights()` descarta geometria e material dos highlights anteriores antes de criar os novos.
- [ ] `dispose()` libera os materiais e textura de ambiente do stage.
- [ ] `file:src/components/ChessScene.tsx` continua sem alterações.
- [ ] Testes existentes continuam passando.