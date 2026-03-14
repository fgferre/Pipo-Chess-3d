Execute apenas o ticket de alinhamento da tematizacao do board 3D neste workspace.

Antes de editar qualquer arquivo, leia nesta ordem:

1. `Docs/Execution_Plans/EXECUTION_PROTOCOL.md`
2. `Docs/Execution_Plans/01_Alinhar_tematizacao_board_3d.md`
3. `Docs/Tickets/Alinhar_tematização_do_tabuleiro_3D_ao_mockup_sem_regressão_visual - done.md`
4. `Docs/Specs/Epic_Brief_—_Pipo_Chess_3d.md`
5. `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
6. `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
7. `src/scene/ChessStage.ts`
8. `src/data/themes.ts`
9. `src/components/ChessScene.tsx`
10. `src/scene/ChessStage.test.ts`
11. `src/assets/mockup tabuleiro 3d.html`

Objetivo:
- fazer o board premium responder visivelmente a `boardLight`, `boardDark` e `boardFrame`
- preservar o baseline visual premium do mockup
- nao expandir escopo para interatividade, camera, animacoes ou UI

Regras:
- preserve mudancas nao relacionadas
- faca o menor diff que resolva o ticket inteiro
- mantenha `ChessScene.tsx` com interface publica inalterada
- nao reintroduza GLTF
- adicione ou atualize testes para evitar regressao silenciosa no consumo do tema do board
- classifique o resultado final usando as categorias do protocolo global
- se encontrar drift de produto, pare e reporte

Fluxo de trabalho:
1. Resuma as restricoes e o diff minimo pretendido antes de editar.
2. Implemente apenas este ticket.
3. Rode a menor validacao util.
4. No final, responda com:
   - o que mudou
   - como validou
   - classificacao final
   - riscos ou pendencias
   - se o ticket pode ser marcado como done
