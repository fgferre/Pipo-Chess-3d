# Plano de execucao - Presets de camera e modo 2D — done

## Ticket alvo

- `Docs/Tickets/Presets_de_câmera_e_modo_2D_top-down.md`

## Referencias obrigatorias

- `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`:
  - Fluxo 5 - Controle de Camera
  - Fluxo 8 - Configuracoes e Temas Visuais
- `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`:
  - Estado local do canvas
  - Novo `ChessStage.ts`
  - Estrategia de animacao
- `src/scene/ChessStage.ts`
- `src/components/ChessScene.tsx`
- `src/types/game.ts`
- `src/state/gameStore.ts`

## Objetivo

Adicionar os presets de camera e o modo 2D sem perder jogabilidade, sem quebrar a interatividade ja consolidada e sem duplicar trabalho feito no pipeline de animacao.

## Estado atual relevante

- `setCameraPreset()` ainda e no-op.
- `defaultViewMode` ja existe em `AppSettings`, mas ainda nao governa o stage.
- O `ChessStage` concentra estado local de visualizacao, e esse ticket deve continuar respeitando essa decisao.
- O `ChessScene` ainda nao orquestra preset inicial nem repasse de comandos de camera.

## Sequencia de acoes

1. Definir o contrato dos 4 presets antes da implementacao.
   Resultado esperado:
   Cada preset fica descrito por:
   - posicao de camera
   - target
   - limites necessarios
   - papel do OrbitControls
   - relacao com o modo 3D ou 2D

2. Decidir como o estado local `viewMode` sera mantido dentro do stage.
   Resultado esperado:
   O stage sabe distinguir entre:
   - perspectiva 3D comum
   - top-down 3D
   - modo 2D
   sem deslocar essa responsabilidade para o store.

3. Implementar a transicao entre presets aproveitando a base do ticket de animacoes.
   Resultado esperado:
   A troca de preset usa uma transicao previsivel e compativel com `animationMode`, sem misturar logica de jogada de pecas com logica de camera.

4. Tratar o modo 2D como troca de representacao, nao apenas como camera superior.
   Resultado esperado:
   O modo 2D inclui:
   - visao perfeitamente superior
   - sprites 2D confiaveis para as 12 variantes
   - crossfade reversivel entre pecas 3D e sprites

5. Garantir jogabilidade nos quatro presets.
   Resultado esperado:
   Tap-tap, drag and drop, highlights e leitura do board continuam corretos em todas as visoes, inclusive durante entrada e saida do modo 2D.

6. Aplicar `defaultViewMode` sem mudar a interface publica de `ChessScene`.
   Resultado esperado:
   A sessao abre ou restaura no modo coerente com a preferencia persistida, com wiring minimo e sem exigir redesenho do componente.

7. Rodar verificacao funcional focada em transicao e jogabilidade.
   Resultado esperado:
   O modo 2D funciona como alternativa real de visualizacao do MVP, nao apenas como efeito visual.

## Gates antes de concluir

- Os 4 presets existem e sao distinguiveis.
- O modo 2D faz crossfade de ida e de volta.
- Os sprites 2D cobrem as 12 variantes corretas.
- Jogabilidade e highlights continuam corretos em todos os presets.
- `defaultViewMode` passa a afetar a abertura e a restauracao da sessao.
- `animationMode` altera a transicao de camera e de crossfade.

## Nao fazer neste ticket

- Nao construir a UI do seletor alem do necessario para teste tecnico.
- Nao reabrir o sistema de animacoes de pecas.
- Nao empurrar `viewMode` para persistencia de sessao ou estado global fora do previsto.

## Saida esperada para o proximo ticket

O canvas passa a oferecer todas as visoes do MVP com jogabilidade preservada. A UI nova podera apenas expor esses controles ao usuario, em vez de descobrir como eles funcionam.
