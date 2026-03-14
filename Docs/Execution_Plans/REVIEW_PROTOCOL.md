# Protocolo global de review

Este arquivo define como revisar uma implementacao ja executada e corrigir gaps razoaveis antes de liberar a fase.

## Papel esperado do revisor

O revisor atua como verificador cuidadoso de aderencia e corretude, com autonomia para corrigir problemas razoaveis sem mudar escopo.

Foco obrigatorio:

- evidencia, nao suposicao
- comparacao contra spec, ticket, plano e codigo real
- severidade calibrada
- utilidade pratica, nao nitpick genericamente academico

## Duas perguntas do review

Todo review deve responder:

1. `Alignment`
   A implementacao entregue corresponde ao que foi planejado?

2. `Correctness`
   O que foi entregue funciona corretamente ou ha bugs, gaps e casos mal tratados?

## Fontes obrigatorias do review

O revisor deve ler, no minimo:

1. `Docs/Execution_Plans/REVIEW_PROTOCOL.md`
2. prompt de execucao usado
3. plano da fase correspondente
4. ticket alvo
5. specs relevantes
6. mudancas reais implicadas pela fase, inferidas a partir do repo

Se o review nao olhar a mudanca real entregue, ele e incompleto.

## Sequencia obrigatoria

1. Identificar o escopo.
   Confirmar se a revisao cobre:
   - um ticket especifico
   - um conjunto de tickets
   - a implementacao real produzida para uma fase

2. Ler o contexto planejado.
   O revisor deve entender:
   - o que o ticket pedia
   - quais criterios de aceite importam
   - quais restricoes de produto e tecnica estavam previstas

3. Ler a implementacao real.
   Prioridade:
   - `git status`, quando houver mudancas locais da fase
   - arquivos implicados pelo plano e pelo ticket
   - commits recentes nos arquivos relevantes, se o worktree estiver limpo
   - testes adicionados ou ajustados

4. Fazer analise de alinhamento.
   Perguntas obrigatorias:
   - os requisitos do ticket foram implementados?
   - os criterios de aceite foram atendidos?
   - a abordagem geral segue o `Tech Plan`?
   - houve desvio em relacao a produto ou escopo?

5. Fazer analise de corretude.
   Verificar:
   - bugs
   - fluxos quebrados
   - tratamento de erro
   - casos de borda
   - consistencia do comportamento com os specs

6. Classificar os achados por importancia.

Categorias obrigatorias:

- `Blockers`
  Deve ser corrigido antes de considerar a fase concluida.

- `Bugs`
  Problemas reais de comportamento que deveriam ser corrigidos.

- `Edge Cases`
  Cenarios nao tratados ou ambiguos que precisam de decisao.

- `Observations`
  Pontos menores, trade-offs ou melhorias potenciais.

- `Validated`
  O que foi checado e esta alinhado com o plano e funcionando como esperado.

7. Apontar drift quando existir.

O revisor deve distinguir:

- `Technical Drift`
  Divergencia tecnica em relacao ao plano, mas ainda potencialmente aceitavel.

- `Product Misalignment`
  Divergencia em relacao ao comportamento ou resultado de produto esperado.

## Regra de saida

- Se houver `Blockers` ou `Product Misalignment`, a fase nao deve ser tratada como concluida.
- Se houver apenas `Bugs` ou `Edge Cases` razoaveis, o revisor deve corrigir diretamente e revalidar.
- Se houver `Bugs` ou `Edge Cases` que impliquem mudanca de escopo ou decisao de produto, o revisor deve parar e pedir direcao.
- Se o review estiver limpo, o revisor deve dizer explicitamente que nao encontrou findings relevantes.

## Regra pratica de inferencia

Quando o usuario nao informar commit ou diff:

- usar primeiro `git status` para localizar as mudancas da fase
- cruzar esse resultado com os arquivos citados no plano e no ticket
- ignorar alteracoes claramente nao relacionadas
- se o worktree estiver limpo, olhar o historico recente dos arquivos implicados pela fase

## Formato esperado da resposta final do revisor

1. `Escopo revisado`
2. `Findings`
   Ordem:
   - Blockers
   - Bugs
   - Edge Cases
   - Observations
   - Validated
3. `Correcoes aplicadas`
4. `Aderencia ao plano e aos specs`
5. `Direcao sugerida`
   Exemplos:
   - pode marcar como done
   - corrigir antes de seguir
   - criar ticket de bug
   - documentar desvio aceito

## Regra de tom

O review deve ser consultivo. Ele apresenta achados com referencia e severidade; nao finge autoridade sobre decisoes de produto que pertencem ao usuario.

## Regra pratica de correcao

O revisor pode corrigir diretamente:

- bugs claros de implementacao
- edge cases pequenos
- lacunas de aderencia ao ticket que nao alterem escopo
- ajustes de teste e validacao proporcionais

O revisor nao deve corrigir sozinho:

- mudancas de produto
- ampliacoes de escopo
- refactors amplos nao necessarios
