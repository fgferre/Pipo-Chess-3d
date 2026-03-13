Execute apenas o ticket de interatividade do ChessStage neste workspace.

Antes de editar qualquer arquivo, leia nesta ordem:

1. `Docs/Execution_Plans/EXECUTION_PROTOCOL.md`
2. `Docs/Execution_Plans/03_Interatividade_ChessStage.md`
3. `Docs/Tickets/Interatividade_do_ChessStage_—_Raycasting,_tap-tap,_drag-and-drop_e_highlights.md`
4. `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
5. `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
6. `src/scene/ChessStage.ts`
7. `src/components/ChessScene.tsx`
8. `src/state/gameStore.ts`
9. `src/utils/board.ts`
10. `src/scene/ChessStage.test.ts`

Objetivo:
- transformar o stage visual em superficie de gameplay confiavel
- separar gestos de camera e gestos de jogo sem empurrar regra de xadrez para o canvas
- manter o store como dono da validacao de jogada

Regras:
- preserve a interface publica de `ChessScene.tsx`
- o `ChessStage` deve emitir intencao, nao validar regra de xadrez
- nao implemente animacoes completas nem presets de camera neste ticket
- adicione testes para pointer handling, raycasting, drag e highlights conforme necessario
- classifique o resultado final usando as categorias do protocolo global
- se houver drift de produto, pare e reporte

Fluxo de trabalho:
1. Resuma o contrato entre canvas, `ChessScene` e store antes de editar.
2. Implemente o ticket com foco em gesto, raycasting, drag e highlights.
3. Rode a menor validacao util, incluindo testes do stage.
4. No final, responda com:
   - o que mudou
   - como validou
   - classificacao final
   - riscos ou pendencias
   - se o ticket pode ser marcado como done
