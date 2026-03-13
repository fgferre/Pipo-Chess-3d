# Plano de execucao - Alinhar tematizacao do board 3D

## Ticket alvo

- `Docs/Tickets/Alinhar_tematização_do_tabuleiro_3D_ao_mockup_sem_regressão_visual.md`

## Referencias obrigatorias

- `Docs/Specs/Epic_Brief_—_Pipo_Chess_3d.md`
- `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
- `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
- `src/scene/ChessStage.ts`
- `src/data/themes.ts`
- `src/components/ChessScene.tsx`
- `src/scene/ChessStage.test.ts`
- `src/assets/mockup tabuleiro 3d.html`

## Objetivo

Fazer o tabuleiro premium responder de forma visivel a `boardLight`, `boardDark` e `boardFrame`, preservando o baseline visual premium do mockup e sem reabrir interatividade, camera, animacao ou UI.

## Estado atual relevante

- O stage ja consome `canvasAccent`, `canvasFelt`, `canvasFog`, `whitePiece` e `blackPiece`.
- O board ainda nasce com paleta hardcoded dentro de `buildBoard()`.
- `applyTheme()` ainda nao governa a paleta principal das casas e da moldura do tabuleiro.
- O contrato publico de `ChessScene` e `ChessStage` ja esta em uso e nao deve mudar neste ticket.

## Sequencia de acoes

1. Confirmar o baseline visual antes de alterar qualquer regra de tema.
   Resultado esperado:
   O mockup em `src/assets/mockup tabuleiro 3d.html` fica registrado como referencia visual obrigatoria para madeira, profundidade, borda premium, acento e feltro.

2. Mapear explicitamente quais superficies do stage representam cada grupo visual do produto.
   Resultado esperado:
   Fica claro quais materiais ou texturas governam:
   - casas claras
   - casas escuras
   - moldura ou borda
   - acento
   - feltro
   - fog

3. Definir uma unica estrategia de traducao entre tema do app e materiais do stage.
   Resultado esperado:
   O ticket nao espalha cores fixas em varios pontos do stage.
   Se for necessario derivar tons, misturas ou variacoes procedurais a partir dos valores do tema, essa derivacao fica centralizada e legivel.

4. Aplicar a nova estrategia apenas ao board premium.
   Resultado esperado:
   Trocar o tema em `src/data/themes.ts` passa a alterar visivelmente casas claras, casas escuras e moldura, sem simplificar o acabamento premium do tabuleiro.

5. Preservar tudo o que ja esta correto e revalidar o que nao pode regredir.
   Resultado esperado:
   Nenhuma regressao em accent, felt, fog, pecas, iluminacao, PMREM, feltro do stage e ausencia de GLTF no caminho critico.

6. Cobrir o comportamento com testes proporcionais ao risco.
   Resultado esperado:
   Existe protecao contra regressao silenciosa no consumo de tema pelo board premium, e nao apenas nas pecas ou nos detalhes secundarios.

7. Fazer validacao visual e estatica antes de encerrar o ticket.
   Resultado esperado:
   Os temas existentes mudam de forma perceptivel a paleta principal do board, mantendo a familia visual do mockup e sem quebrar `ChessScene`.

## Gates antes de concluir

- Trocar entre os temas altera o board principal, nao so accent, felt, fog e pecas.
- O acabamento continua premium e procedural, sem aspecto chapado.
- `src/components/ChessScene.tsx` continua com a mesma interface.
- Nao houve expansao de escopo para interatividade, camera, animacao ou UI.
- Os testes do stage continuam verdes e foi adicionada cobertura para o consumo do tema do board.

## Nao fazer neste ticket

- Nao adicionar raycasting, drag, tap-tap ou presets de camera.
- Nao reintroduzir GLTF.
- Nao mover responsabilidade para `App.tsx` ou para o store.

## Saida esperada para o proximo ticket

O `ChessStage` passa a ter um board visualmente alinhado ao mockup e governado pelo tema do produto. Com isso, o proximo ticket pode fechar housekeeping sem discutir novamente a paleta principal do stage.
