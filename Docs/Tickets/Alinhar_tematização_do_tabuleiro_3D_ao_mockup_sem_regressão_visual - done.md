# Alinhar tematização do tabuleiro 3D ao mockup sem regressão visual

## Contexto

Refs: `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/eede9e28-314c-4477-ab2f-e029939b011e` · `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/0ebe8bdf-9234-498e-8c70-2811bb3b6e27` · `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/c9191e9e-098e-42c6-8dbd-f4284d2d6260` · `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/2c83433e-787d-44fb-947d-0fcb1d075901`

Na validação do novo `file:src/scene/ChessStage.ts`, o gap funcional confirmado foi este: o canvas premium já aplica `canvasAccent`, `canvasFelt`, `canvasFog`, `whitePiece` e `blackPiece`, mas **não aplica de fato** `boardLight`, `boardDark` e `boardFrame` à paleta principal do tabuleiro 3D. Hoje a madeira/casas/borda continuam apoiadas em cores hardcoded internas do stage.

Direção do produto confirmada pelo usuário: `file:src/assets/mockup tabuleiro 3d.html` é a **fonte de verdade visual** do MVP. O trabalho corretivo deve manter **todas as técnicas e o resultado visual premium** que o mockup atinge, sem regressão perceptível. Melhorias são bem-vindas; simplificações visuais não.

## Escopo

### Objetivo principal
Fazer com que o tabuleiro 3D premium respeite **temas reais do produto** sem perder o baseline visual do mockup.

### Incluído

1. **Alinhar o board premium ao mockup como baseline visual**
   - O resultado final do tabuleiro/canvas deve continuar pertencendo à mesma família visual do mockup: madeira procedural rica, profundidade material, bordas premium, acento elegante e feltro coerente.
   - Este ticket **não é** um restyle livre; é um alinhamento corretivo ao baseline definido em `file:src/assets/mockup tabuleiro 3d.html`.

2. **Consumir de verdade os campos de tema do tabuleiro**
   - `boardLight`
   - `boardDark`
   - `boardFrame`

   Esses campos já existem em `file:src/types/game.ts` e são abastecidos por `file:src/data/themes.ts`, mas ainda não governam visualmente as casas claras/escuras e a moldura/borda do tabuleiro 3D.

3. **Preservar o caráter procedural/material do canvas**
   - Se a fidelidade ao mockup exigir variações derivadas, tonalização, mistura de cores ou geração procedural a partir dos valores do tema, isso é permitido e esperado.
   - O importante é que o tema ativo passe a influenciar **visivelmente** o tabuleiro 3D, sem reduzir o acabamento a superfícies chapadas ou descaracterizar o mockup.

4. **Centralizar a lógica de mapeamento visual**
   - A relação entre tema do app e materiais/texturas do board deve ficar clara e concentrada, evitando espalhar paletas fixas desconectadas do tema ativo por vários pontos do `ChessStage`.

5. **Manter o que já está correto**
   - Não regredir `canvasAccent`, `canvasFelt`, `canvasFog`, cor das peças, iluminação, PMREM, feltro do stage e remoção do GLTF do caminho crítico.
   - Não expandir para interatividade, presets de câmera, animações ou UI.

### Explicitamente fora
- `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/c07fde1d-771e-41f7-a6ee-9d9c03e9dc38` (interatividade)
- `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/94baece0-1f78-4ea1-bb0c-3fa1487a3a45` (animações)
- `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/f36ce088-b064-4494-8283-b7203fda16ca` (presets/modo 2D)
- reformulação de UI
- retorno de GLTF/fallbacks antigos

## Critérios de aceite

- [ ] Trocar entre os temas existentes em `file:src/data/themes.ts` altera visivelmente a paleta principal do tabuleiro 3D (casas claras, casas escuras e moldura/borda), e não apenas accent/felt/fog/peças.
- [ ] O canvas resultante continua visualmente alinhado ao baseline de `file:src/assets/mockup tabuleiro 3d.html`, sem regressão perceptível de qualidade, riqueza material ou acabamento.
- [ ] A implementação mantém a abordagem procedural/premium do `ChessStage`, sem reintroduzir `GLTFLoader` nem depender de `file:public/assets/models/pipo-chess-set.gltf`.
- [ ] `file:src/components/ChessScene.tsx` continua com interface inalterada.
- [ ] Existe cobertura de teste suficiente para impedir regressão silenciosa no consumo de tema pelo board premium.
- [ ] Diagnósticos estáticos permanecem limpos.

## Nota de prioridade

Este ticket corrige um gap de fidelidade do MVP já validado em revisão. O mockup foi explicitamente adotado como baseline oficial do canvas; portanto, este follow-up deve ser tratado como **correção de alinhamento de produto**, não como melhoria opcional.