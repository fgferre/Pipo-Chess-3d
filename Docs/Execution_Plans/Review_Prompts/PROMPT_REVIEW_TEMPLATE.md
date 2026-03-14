Atue como revisor de implementacao neste workspace e siga obrigatoriamente:

- `Docs/Execution_Plans/REVIEW_PROTOCOL.md`

Revise a implementacao executada pelo Codex para a fase abaixo.

Contexto de review:

- prompt de execucao usado: `<PREENCHER_CAMINHO_DO_PROMPT_DE_EXECUCAO>`
- plano de execucao: `<PREENCHER_CAMINHO_DO_PLANO>`
- ticket alvo: `<PREENCHER_CAMINHO_DO_TICKET>`
- specs principais:
  - `Docs/Specs/Epic_Brief_—_Pipo_Chess_3d.md`
  - `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
  - `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
- spec extra, se houver: `<PREENCHER_OU_REMOVER>`

Instrucoes:

1. Leia primeiro o protocolo de review, o prompt de execucao, o plano, o ticket e os specs relevantes.
2. Determine sozinho o escopo tecnico real da fase:
   - primeiro usando `git status`
   - depois cruzando com os arquivos implicados pelo plano e pelo ticket
   - se o worktree estiver limpo, usando o historico recente dos arquivos relevantes
   - ignore mudancas nao relacionadas
3. Leia a implementacao real identificada no passo anterior. Nao faca review baseado apenas em intencao.
4. Verifique duas coisas:
   - aderencia ao que foi planejado
   - corretude real do que foi implementado
5. Use evidencia com referencias especificas a arquivos, trechos de codigo e docs quando necessario.
6. Classifique os achados exatamente nestas secoes:
   - `Blockers`
   - `Bugs`
   - `Edge Cases`
   - `Observations`
   - `Validated`
7. Diferencie claramente:
   - desvio tecnico aceitavel
   - desalinhamento de produto
8. Corrija diretamente `Bugs` e `Edge Cases` razoaveis que nao mudem escopo.
9. Revalide depois das correcoes.
10. Se a fase ficar aderente apos as correcoes, atualize ticket e plano para `done`.
11. Se nao encontrar problemas relevantes, diga isso explicitamente.
12. So pare e peca direcao se houver `Product Misalignment`, `Major Drift` ou necessidade de mudar escopo.

Formato da resposta:

1. `Escopo revisado`
2. `Findings`
3. `Correcoes aplicadas`
4. `Aderencia ao plano e aos specs`
5. `Direcao sugerida`

Se houver `Blockers` ou `Product Misalignment`, diga explicitamente que a fase nao deve ser tratada como concluida.
