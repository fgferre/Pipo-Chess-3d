Execute apenas o ticket de reformulacao da UI glassmorphism mobile-first neste workspace.

Antes de editar qualquer arquivo, leia nesta ordem:

1. `Docs/Execution_Plans/EXECUTION_PROTOCOL.md`
2. `Docs/Execution_Plans/06_UI_glassmorphism_mobile_first.md`
3. `Docs/Tickets/Reformulação_completa_da_UI_glassmorphism_mobile-first.md`
4. `Docs/Specs/Epic_Brief_—_Pipo_Chess_3d.md`
5. `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
6. `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
7. `src/App.tsx`
8. `src/index.css`
9. `src/components/ChessScene.tsx`
10. `src/components/MoveList.tsx`
11. `src/components/AnalysisSummaryView.tsx`
12. `src/state/gameStore.ts`
13. `src/game/gameService.ts`
14. `src/persistence/db.ts`

Objetivo:
- substituir o shell atual por uma UI mobile-first sobre o canvas
- fazer o wiring minimo necessario para nova partida configuravel, promocao, analise navegavel e preferencias persistidas
- reaproveitar modulos existentes sempre que fizer sentido

Regras:
- preserve o contrato de `ChessScene.tsx`
- mexa em store e service apenas no minimo necessario para os fluxos do ticket
- nao reimplemente engine nem persistencia
- priorize wiring de fluxo antes de refinamento visual
- mantenha o diff focado no ticket, sem expandir para features novas
- classifique o resultado final usando as categorias do protocolo global

Fluxo de trabalho:
1. Resuma os contratos que devem permanecer estaveis e quais extensoes minimas de store/service serao necessarias.
2. Implemente o novo shell e o wiring dos fluxos pedidos.
3. Rode a menor validacao util.
4. No final, responda com:
   - o que mudou
   - como validou
   - classificacao final
   - riscos ou pendencias
   - se o ticket pode ser marcado como done
