Execute apenas o ticket de presets de camera e modo 2D neste workspace.

Antes de editar qualquer arquivo, leia nesta ordem:

1. `Docs/Execution_Plans/EXECUTION_PROTOCOL.md`
2. `Docs/Execution_Plans/05_Presets_de_camera_e_modo_2d.md`
3. `Docs/Tickets/Presets_de_câmera_e_modo_2D_top-down.md`
4. `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
5. `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
6. `src/scene/ChessStage.ts`
7. `src/components/ChessScene.tsx`
8. `src/types/game.ts`
9. `src/state/gameStore.ts`

Objetivo:
- implementar os 4 presets de camera
- implementar o modo 2D como troca real de representacao com sprites e crossfade
- preservar jogabilidade em todos os modos

Regras:
- nao reabra o sistema de animacao de pecas alem do necessario para integrar com a camera
- nao mova `viewMode` para um lugar diferente do previsto sem justificativa forte
- aplique `defaultViewMode` com wiring minimo
- mantenha tap-tap, drag e highlights funcionando em todos os presets
- classifique o resultado final usando as categorias do protocolo global
- se houver drift de produto, pare e reporte

Fluxo de trabalho:
1. Resuma o contrato dos 4 presets e do modo 2D antes de editar.
2. Implemente camera, view state local e crossfade 3D para 2D.
3. Rode a menor validacao util.
4. No final, responda com:
   - o que mudou
   - como validou
   - classificacao final
   - riscos ou pendencias
   - se o ticket pode ser marcado como done
