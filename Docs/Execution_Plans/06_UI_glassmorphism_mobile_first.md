# Plano de execucao - UI glassmorphism mobile-first — done

## Ticket alvo

- `Docs/Tickets/Reformulação_completa_da_UI_glassmorphism_mobile-first.md`

## Referencias obrigatorias

- `Docs/Specs/Epic_Brief_—_Pipo_Chess_3d.md`
- `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
- `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
- `src/App.tsx`
- `src/index.css`
- `src/components/ChessScene.tsx`
- `src/components/MoveList.tsx`
- `src/components/AnalysisSummaryView.tsx`
- `src/state/gameStore.ts`
- `src/game/gameService.ts`
- `src/persistence/db.ts`

## Objetivo

Substituir o shell atual desktop-first por uma UI mobile-first sobre o canvas, preservando os modulos existentes onde fizer sentido e limitando as mudancas de negocio ao wiring minimo exigido pelos fluxos do produto.

## Estado atual relevante

- `src/App.tsx` ainda usa layout accordion lateral.
- `MoveList` e `AnalysisSummaryView` existem e podem ser reaproveitados.
- `gameStore` ainda nao expoe `pendingPromotion`, `analysisCursor` nem `analysisAutoplay`.
- `gameService` ainda fixa `playerColor` em branco e `newGame()` no store nao recebe payload de configuracao.
- `animationMode` e `defaultViewMode` ja existem nos settings, mas ainda nao sao realmente operados pela UI nem pelo stage.

## Sequencia de acoes

1. Fechar primeiro quais contratos nao devem ser quebrados.
   Resultado esperado:
   Permanecem estaveis:
   - interface publica de `ChessScene`
   - engine e worker
   - base de persistencia Dexie
   - componentes reaproveitaveis quando ainda fizerem sentido

2. Estender store e service apenas onde os fluxos novos realmente exigem.
   Resultado esperado:
   Antes de redesenhar a interface, o projeto passa a suportar:
   - nova partida com cor configuravel ou aleatoria
   - promocao pendente dirigida por UI
   - cursor de analise e autoplay
   - configuracao e persistencia de `animationMode` e `defaultViewMode`

3. Reestruturar o shell visual em torno do canvas full-screen.
   Resultado esperado:
   O canvas vira protagonista, com barras e paineis sobrepostos, em vez de conviver com o layout accordion atual.

4. Implementar os componentes de shell na ordem que reduz risco de wiring.
   Ordem recomendada:
   - TopBar
   - BottomBar
   - HistoryPanel
   - MenuDrawer
   - NewGameSheet
   - PromotionPopup
   - ResultModal
   - CameraPresetPicker
   - EvalBar

5. Reaproveitar o que ja existe antes de criar novos blocos complexos.
   Resultado esperado:
   `MoveList` entra no `HistoryPanel`.
   `AnalysisSummaryView` entra no `MenuDrawer`.
   O que ja funciona nao e reescrito sem necessidade.

6. Conectar primeiro os fluxos que desbloqueiam o restante da experiencia.
   Ordem recomendada:
   - nova partida configuravel
   - promocao dirigida por UI
   - analise navegavel
   - configuracoes persistidas
   - aviso de restauracao de autosave

7. Implementar a camada visual glassmorphism e responsiva depois do wiring minimo.
   Resultado esperado:
   O ticket evita perder tempo com refinamento visual em cima de contratos ainda instaveis.

8. Validar a UI nova com foco em fluxo completo, nao so em renderizacao.
   Resultado esperado:
   Cada componente novo e verificado pela sua contribuicao aos fluxos dos specs e nao apenas pela aparencia isolada.

## Gates antes de concluir

- O canvas ocupa a viewport inteira.
- `TopBar`, `BottomBar` e `HistoryPanel` entregam o shell principal do produto.
- `NewGameSheet` realmente inicia partidas com cor, nivel e tempo configurados.
- `PromotionPopup` remove a promocao automatica cega e passa a depender da escolha do jogador.
- O modo analise tem cursor, navegacao e sync entre tabuleiro, historico e avaliacao.
- `animationMode` e `defaultViewMode` sao configuraveis e persistem.
- O layout funciona em mobile e desktop sem quebrar os fluxos existentes.

## Nao fazer neste ticket

- Nao reimplementar engine, busca, analise ou persistencia.
- Nao refazer `ChessStage` alem do wiring necessario.
- Nao deixar a UI inventar regras de negocio que deveriam ficar no store ou no service.

## Saida esperada para o proximo ticket

O app passa a ter o shell oficial do MVP, com wiring suficiente para operar os fluxos principais do produto. O ticket final de integracao podera focar em acabamento, remocao de legado e validacao end-to-end.
