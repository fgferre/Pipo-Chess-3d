Execute apenas o ticket de animacoes do canvas 3D neste workspace.

Antes de editar qualquer arquivo, leia nesta ordem:

1. `Docs/Execution_Plans/EXECUTION_PROTOCOL.md`
2. `Docs/Execution_Plans/04_Sistema_de_animacoes_canvas_3d.md`
3. `Docs/Tickets/Sistema_de_animações_do_canvas_3D.md`
4. `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
5. `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
6. `src/scene/ChessStage.ts`
7. `src/components/ChessScene.tsx`
8. `src/state/gameStore.ts`
9. `src/game/gameService.ts`

Objetivo:
- substituir o teleporte por um pipeline de transicoes de pecas
- suportar jogo, captura, jogada da IA, undo, redo e casos especiais
- ligar `animationMode` a comportamento real

Regras:
- nao implemente transicao entre presets de camera aqui
- nao implemente o crossfade 3D para 2D aqui
- mantenha o contrato externo do stage o mais estavel possivel
- o diff deve preparar o proximo ticket de camera e modo 2D, nao dificultar
- adicione ou atualize testes proporcionais ao risco
- classifique o resultado final usando as categorias do protocolo global

Fluxo de trabalho:
1. Resuma como vai detectar diferencas entre estado anterior e novo.
2. Implemente o pipeline de animacao sem biblioteca externa.
3. Rode a menor validacao util.
4. No final, responda com:
   - o que mudou
   - como validou
   - classificacao final
   - riscos ou pendencias
   - se o ticket pode ser marcado como done
