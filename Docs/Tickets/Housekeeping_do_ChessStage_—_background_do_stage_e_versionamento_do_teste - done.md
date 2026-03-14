# Housekeeping do ChessStage — background do stage e versionamento do teste

## Contexto

Refs: `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/eede9e28-314c-4477-ab2f-e029939b011e` · `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/0ebe8bdf-9234-498e-8c70-2811bb3b6e27` · `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/c9191e9e-098e-42c6-8dbd-f4284d2d6260`

A validação do `ChessStage` encontrou dois pontos menores que não bloqueiam o aceite do port visual, mas merecem rastreamento separado:

1. **Background do stage:** o `ChessStage` atual porta fog, iluminação e materiais, mas a estratégia de fundo do canvas ainda não está explicitamente fechada em relação ao mockup.
2. **Versionamento do teste:** `file:src/scene/ChessStage.test.ts` existe como cobertura útil do stage, mas precisa ser tratado como parte formal da entrega, e não permanecer apenas como artefato local solto no workspace.

## Escopo

### Incluído

1. **Fechar o contrato visual do fundo do stage**
   - Tornar explícita a decisão de background do `file:src/scene/ChessStage.ts`.
   - O resultado final deve ficar coerente com a linguagem visual do mockup e com o shell do app, sem regressão perceptível.
   - Se o fundo pertencer ao próprio stage, isso deve ser implementado de forma clara.
   - Se o fundo permanecer delegado ao backdrop do app, isso deve ser uma decisão consciente, estável e verificada visualmente — não apenas um efeito colateral do canvas transparente.

2. **Formalizar o teste do ChessStage como parte da entrega**
   - Garantir que `file:src/scene/ChessStage.test.ts` entre no changeset real do produto e permaneça como proteção contra regressão para:
     - click vs drag
     - descarte de highlights
     - descarte de recursos do stage

3. **Fechamento limpo do changeset**
   - Este ticket existe justamente para evitar que detalhes operacionais fiquem “pendurados” após o aceite funcional do T2a/T2a-fix.
   - O objetivo é sair desta fase com o `ChessStage` não só funcional, mas também com baseline visual e cobertura de teste devidamente consolidados.

### Explicitamente fora
- Reabrir o escopo de interatividade
- Reabrir o escopo de animações
- Reabrir o escopo de presets/modo 2D
- Refatorações amplas de UI ou store
- Mudanças de engine

## Critérios de aceite

- [x] A estratégia de background do `ChessStage` fica explícita e visualmente coerente com o baseline do mockup e com o shell atual do app.
- [x] O comportamento de fundo não fica mais ambíguo como detalhe acidental do renderer/canvas.
- [x] `file:src/scene/ChessStage.test.ts` passa a fazer parte formal da entrega do projeto.
- [x] A cobertura adicionada para o `ChessStage` permanece alinhada com os comportamentos já validados.
- [x] Não há regressão funcional nem visual introduzida por esse fechamento de housekeeping.
- [x] Diagnósticos estáticos permanecem limpos.

## Nota

Este ticket é deliberadamente pequeno. Ele não reabre decisões de arquitetura; apenas fecha pendências menores identificadas durante a revisão do port visual para deixar a base do canvas premium mais sólida antes das próximas camadas do MVP.

## Notas de fechamento

- O backdrop visual ficou explicitamente delegado ao shell/wrapper do stage, usando `theme.backdrop` e `theme.canvasFog`, enquanto o `ChessStage` mantém canvas transparente e continua dono apenas da atmosfera interna da cena.
- `file:src/scene/ChessStage.test.ts` permaneceu no fluxo normal de teste do projeto e recebeu cobertura explícita para o contrato de canvas transparente + `canvasFog`.
- Validação executada:
  - `node_modules/.bin/vitest.cmd run src/scene/ChessStage.test.ts`
  - `node_modules/.bin/eslint.cmd src/components/ChessScene.tsx src/scene/ChessStage.ts src/scene/ChessStage.test.ts`
