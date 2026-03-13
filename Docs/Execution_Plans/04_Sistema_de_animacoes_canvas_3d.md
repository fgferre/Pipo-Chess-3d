# Plano de execucao - Sistema de animacoes do canvas 3D

## Ticket alvo

- `Docs/Tickets/Sistema_de_animações_do_canvas_3D.md`

## Referencias obrigatorias

- `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`:
  - Fluxo 2 - Gameplay
  - Fluxo 4 - Desfazer / Refazer
- `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`:
  - Novo `ChessStage.ts`
  - Estrategia de animacao
- `src/scene/ChessStage.ts`
- `src/components/ChessScene.tsx`
- `src/state/gameStore.ts`
- `src/game/gameService.ts`

## Objetivo

Trocar a atual atualizacao por teleporte de pecas por um pipeline de transicoes capaz de animar jogo, captura e navegacao sem quebrar o contrato atual do stage com o resto do app.

## Estado atual relevante

- `ChessStage.update()` ainda reconstrói as pecas por estado.
- `setAnimationMode()` existe apenas como stub.
- O stage ainda nao possui identidade estavel por peca nem fila de animacao.
- O store ja entrega informacao suficiente para detectar diferencas de posicao entre estados, mas ainda nao expoe promocao pendente completa.

## Sequencia de acoes

1. Definir primeiro o modelo de diferenca entre estado anterior e estado novo.
   Resultado esperado:
   Antes de falar em tweening, o ticket identifica como reconhecer:
   - movimento simples
   - captura
   - roque
   - en passant
   - promocao
   - undo
   - redo

2. Introduzir uma representacao estavel das pecas enquanto duram as animacoes.
   Resultado esperado:
   O stage deixa de depender apenas de rebuild imediato e passa a ter base para interpolar sem perder referencia entre um estado e outro.

3. Implementar o motor de transicao interno em volta do loop ja existente.
   Resultado esperado:
   O ticket adiciona tweening leve, controle de duracao e politica para fila ou flush de animacoes sem trazer dependencia externa.

4. Atacar primeiro as animacoes que sao base para todas as outras.
   Resultado esperado:
   O fluxo fica nesta ordem:
   - movimento simples
   - jogada da IA com highlight
   - captura
   - undo e redo
   - movimentos compostos: roque, en passant e promocao

5. Conectar o `animationMode` a decisoes reais do pipeline.
   Resultado esperado:
   Normal, reduced e off deixam de ser apenas configuracao armazenada e passam a alterar duracao, intensidade e quantidade de efeitos.

6. Garantir que o design escolhido nao force retrabalho no ticket de modo 2D.
   Resultado esperado:
   O pipeline separa animacao de peca e transicao de camera, deixando ganchos claros para o ticket de presets e modo 2D sem implementar esse escopo aqui.

7. Validar com casos de jogo e com navegacao do historico.
   Resultado esperado:
   Movimento, captura, undo, redo e jogada da IA ficam claros para o usuario mesmo quando a animacao esta reduzida ou desligada.

## Gates antes de concluir

- `update()` nao depende mais apenas de teleporte das pecas.
- Ha comportamento consistente para movimento simples, jogada da IA, captura, undo e redo.
- Roque, en passant e promocao possuem tratamento proprio.
- `animationMode` muda de fato o comportamento do canvas.
- Interacao do usuario nao fica permanentemente bloqueada por fila presa ou estado intermediario.

## Nao fazer neste ticket

- Nao implementar transicao entre presets de camera.
- Nao implementar crossfade 3D para 2D.
- Nao resolver UI de promocao; apenas suportar de forma generica o resultado de promocao que o estado entregue representar.

## Saida esperada para o proximo ticket

O canvas ganha um pipeline de atualizacao orientado por diferenca e animacao. Isso reduz fortemente o retrabalho do ticket de camera e 2D, que passa a focar em view state e representacao visual, nao em recriar o fluxo de transicao das pecas.
