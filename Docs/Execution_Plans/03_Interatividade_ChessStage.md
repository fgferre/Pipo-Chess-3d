# Plano de execucao - Interatividade do ChessStage

## Ticket alvo

- `Docs/Tickets/Interatividade_do_ChessStage_—_Raycasting,_tap-tap,_drag-and-drop_e_highlights.md`

## Referencias obrigatorias

- `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`:
  - Fluxo 2 - Gameplay
  - Fluxo 3 - Solicitar Dica
  - Fluxo 5 - Controle de Camera
- `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`:
  - Novo `ChessStage.ts`
  - Fluxo de dados - jogada do usuario
- `src/scene/ChessStage.ts`
- `src/components/ChessScene.tsx`
- `src/state/gameStore.ts`
- `src/utils/board.ts`
- `src/scene/ChessStage.test.ts`

## Objetivo

Transformar o stage visual em uma superficie de gameplay confiavel, separando de forma limpa gestos de camera e gestos de jogo, sem empurrar regras de negocio para o canvas.

## Estado atual relevante

- O stage ja tem `hitPlane`, raycaster e logica minima de click vs drag.
- `ChessScene` ainda so repassa `onSquareSelect(square)` para o store.
- `gameStore.selectSquare()` ja calcula selecao e destinos legais, entao o canvas deve continuar reportando intencao e nao validar regra de xadrez.
- A promocao ainda e simplificada no store atual, entao este ticket nao deve tentar resolver o fluxo completo de promocao.

## Sequencia de acoes

1. Congelar o contrato de responsabilidade entre canvas, `ChessScene` e store.
   Resultado esperado:
   O `ChessStage` detecta gesto, resolve casa e emite intencao.
   O store continua responsavel por selecao valida, destinos legais e aplicacao de lance.

2. Fechar a maquina de gestos por plataforma antes de implementar detalhes.
   Resultado esperado:
   Fica definido e testavel que:
   - mobile: 1 dedo joga
   - mobile: 2 dedos controlam camera
   - desktop: click simples seleciona
   - desktop: click e drag orbita
   - scroll continua como zoom

3. Reaproveitar o raycasting atual e completar a deteccao de casas para tap-tap.
   Resultado esperado:
   O stage detecta com consistencia a casa tocada e mantem o fluxo existente de `onSquareSelect(square)`.

4. Implementar o ciclo completo de drag and drop como fluxo proprio do canvas.
   Resultado esperado:
   O drag tem inicio, acompanhamento, destino valido, destino invalido e retorno suave sem misturar isso com regra de xadrez no store.

5. Definir uma camada unica de highlights de gameplay.
   Resultado esperado:
   Selecao, alvos legais, dica e ultima jogada da IA usam uma estrategia consistente de criacao, atualizacao e descarte visual.

6. Verificar integracao com o estado atual do app antes de ampliar cobertura.
   Resultado esperado:
   `ChessScene` continua com interface publica estavel, e o stage funciona com o `gameStore` atual sem exigir refactor de negocio.

7. Ampliar testes do stage e fazer smoke tests por plataforma.
   Resultado esperado:
   O comportamento de gestos e highlights fica protegido por testes e por uma pequena matriz manual de verificacao desktop e mobile.

## Gates antes de concluir

- Mobile com 1 dedo nao aciona orbit.
- Mobile com 2 dedos ainda controla camera.
- Desktop separa click simples de orbit sem ambiguidade.
- Tap-tap, drag valido e drag invalido funcionam.
- Highlights de selecao, alvos, dica e ultima jogada aparecem e sao descartados corretamente.
- `ChessScene.tsx` continua com interface inalterada.
- O store nao recebeu regras de raycasting ou detalhes de renderizacao.

## Nao fazer neste ticket

- Nao implementar animacao completa de movimento.
- Nao implementar presets de camera ou modo 2D.
- Nao remodelar store, engine ou persistencia alem do estritamente necessario para manter o contrato atual.

## Saida esperada para o proximo ticket

O projeto passa a ter um contrato de gameplay claro no canvas. Isso serve como base para animacoes e, depois, para preservar jogabilidade durante presets de camera e modo 2D.
