# Plano de execucao - Housekeeping do ChessStage

## Ticket alvo

- `Docs/Tickets/Housekeeping_do_ChessStage_—_background_do_stage_e_versionamento_do_teste - done.md`

## Referencias obrigatorias

- `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
- `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
- `src/scene/ChessStage.ts`
- `src/scene/ChessStage.test.ts`
- `src/index.css`
- `src/App.tsx`

## Objetivo

Fechar as pendencias pequenas do stage antes de entrar nas camadas de gameplay: fundo do canvas com contrato explicito e cobertura de teste formalmente consolidada no changeset do projeto.

## Estado atual relevante

- O fundo do stage ainda depende de uma decisao que nao esta nitida entre o proprio stage e o shell do app.
- `src/scene/ChessStage.test.ts` existe e cobre pontos uteis, mas o ticket pede que ele deixe de ser um artefato solto e vire parte formal da entrega.
- O layout atual do app ainda e o shell antigo, entao a decisao de fundo precisa ser coerente tanto com o estado atual quanto com a transicao para a UI nova.

## Sequencia de acoes

1. Fechar a decisao de ownership do background.
   Resultado esperado:
   Fica explicito se o fundo do canvas pertence:
   - ao proprio `ChessStage`
   - ao shell do app
   - a uma combinacao controlada entre os dois

2. Validar a decisao escolhida contra o mockup e contra o shell atual.
   Resultado esperado:
   O fundo deixa de parecer um acidente do canvas transparente e passa a ser uma escolha visual e tecnica consciente.

3. Consolidar a implementacao minima dessa decisao.
   Resultado esperado:
   O comportamento de background fica estavel, legivel no codigo e sem abrir um refactor maior de layout ou renderizacao.

4. Formalizar `src/scene/ChessStage.test.ts` como parte oficial do ticket.
   Resultado esperado:
   O teste entra no conjunto esperado do produto, e a equipe deixa de depender de um arquivo local esquecido ou opcional.

5. Revisar se a cobertura atual protege exatamente o que ja foi aceito.
   Resultado esperado:
   O teste cobre ao menos click vs drag, descarte de highlights e descarte de recursos do stage, sem inflar o escopo.

6. Rodar o menor pacote de verificacao coerente com o ticket.
   Resultado esperado:
   O fechamento de housekeeping nao introduz regressao funcional nem visual.

## Gates antes de concluir

- O comportamento de fundo do stage esta explicito.
- A decisao e coerente com o mockup e com o app shell atual.
- `src/scene/ChessStage.test.ts` esta formalmente incluído na entrega e passa no fluxo de teste normal do projeto.
- Nenhum escopo de gameplay, camera, animacao ou UI foi reaberto.

## Nao fazer neste ticket

- Nao refazer o visual premium.
- Nao adicionar interatividade.
- Nao iniciar reestruturacao de `App.tsx`, store ou engine.

## Saida esperada para o proximo ticket

O stage fica com baseline visual e cobertura de teste estabilizados. O ticket de interatividade pode assumir um `ChessStage` mais solido e parar de gastar energia com ambiguidades de fundo ou de teste.
