# Protocolo global de execucao

Este arquivo formaliza a metodologia de execucao dos tickets do epic.

## Papel esperado do executor

O executor nao atua como gerador cego de codigo. Ele deve conduzir o ticket do handoff ate a validacao final, mantendo alinhamento com:

- produto: `Epic Brief` e `Core Flows`
- abordagem tecnica: `Tech Plan`
- recorte de trabalho: ticket alvo
- ordem de trabalho: plano de execucao correspondente

## Sequencia obrigatoria

1. Confirmar escopo do ticket.
   O executor deve garantir que esta implementando apenas o ticket em foco.

2. Verificar dependencias antes de editar.
   O executor deve confirmar que os tickets anteriores dos quais este depende ja estao aceitos ou pelo menos estaveis o suficiente para nao causar retrabalho.

3. Ler fontes de verdade antes de mudar codigo.
   Ordem minima:
   - plano de execucao
   - ticket alvo
   - specs referenciados
   - arquivos de codigo impactados

4. Produzir uma leitura inicial do trabalho.
   Antes de editar, o executor deve resumir:
   - o que o ticket pede
   - quais restricoes importam
   - qual o menor diff plausivel
   - quais riscos de drift existem

5. Implementar com escopo controlado.
   Regras:
   - menor diff que resolva o ticket
   - preservar mudancas nao relacionadas
   - nao inventar APIs nem reorganizar estrutura sem necessidade
   - nao expandir o ticket para trabalho de fases seguintes

6. Validar a implementacao em duas lentes.

### Lente de produto

Comparar com `Epic Brief` e `Core Flows`.

- desvios aqui sao graves
- se houver conflito com o produto definido, parar e alinhar

### Lente tecnica

Comparar com `Tech Plan`.

- pequenas divergencias tecnicas podem ser aceitaveis se forem solidas
- se aceitas, devem ser registradas com impacto nos proximos tickets

7. Classificar o resultado antes de encerrar.

Categorias obrigatorias:

- `Well Implemented`
- `Minor Issues`
- `Technical Drift`
- `Product Misalignment`
- `Major Drift`

8. Tratar a classificacao corretamente.

- `Well Implemented`: pode seguir e considerar o ticket pronto
- `Minor Issues`: corrigir antes de marcar done
- `Technical Drift`: documentar o desvio e revisar impacto downstream
- `Product Misalignment`: parar e alinhar com o usuario
- `Major Drift`: parar e alinhar com o usuario

9. So marcar done apos validacao.
   Nenhum ticket deve ser considerado concluido apenas porque o codigo foi escrito.

## Formato esperado da resposta final do executor

Ao concluir o ticket, a resposta deve conter:

1. `Resumo das mudancas`
2. `Validacao executada`
3. `Classificacao final`
4. `Riscos ou pendencias`
5. `Pode marcar como done?`

## Regra de escalacao

Se houver mudanca relevante de produto, conflito entre specs, ou necessidade de alterar fortemente a abordagem prevista para os tickets seguintes, o executor deve parar e pedir alinhamento antes de continuar.
