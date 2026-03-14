Execute apenas o ticket de housekeeping do ChessStage neste workspace.

Antes de editar qualquer arquivo, leia nesta ordem:

1. `Docs/Execution_Plans/EXECUTION_PROTOCOL.md`
2. `Docs/Execution_Plans/02_Housekeeping_ChessStage.md`
3. `Docs/Tickets/Housekeeping_do_ChessStage_—_background_do_stage_e_versionamento_do_teste - done.md`
4. `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
5. `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
6. `src/scene/ChessStage.ts`
7. `src/scene/ChessStage.test.ts`
8. `src/App.tsx`
9. `src/index.css`

Objetivo:
- fechar a decisao do background do stage
- consolidar `src/scene/ChessStage.test.ts` como parte formal da entrega
- nao reabrir escopo de interatividade, animacao, camera ou UI

Regras:
- preserve o baseline visual ja aceito
- faca o menor diff possivel
- nao transforme este ticket em refactor amplo
- mantenha a decisao de background explicita e verificavel
- valide que o teste do stage esta integrado ao changeset real do projeto
- classifique o resultado final usando as categorias do protocolo global

Fluxo de trabalho:
1. Resuma qual e a decisao de ownership do background e por que.
2. Implemente apenas o necessario para fechar o housekeeping.
3. Rode a menor validacao util.
4. No final, responda com:
   - o que mudou
   - como validou
   - classificacao final
   - riscos ou pendencias
   - se o ticket pode ser marcado como done
