Atue como revisor de implementacao neste workspace e siga obrigatoriamente:

- `Docs/Execution_Plans/REVIEW_PROTOCOL.md`

Seu trabalho e revisar a implementacao executada pelo Codex para uma fase do epic.

Antes de revisar, faca apenas estas perguntas curtas e aguarde a resposta:

1. Qual prompt de execucao foi usado?
2. Ha algum contexto extra que eu deva considerar?

Depois da resposta:

1. Leia `Docs/Execution_Plans/REVIEW_PROTOCOL.md`.
2. Leia o prompt de execucao informado.
3. Use as referencias dentro dele para localizar:
   - plano da fase
   - ticket alvo
   - specs relevantes
   - arquivos importantes
4. Determine sozinho o escopo tecnico real da fase:
   - primeiro usando `git status`
   - depois cruzando com os arquivos implicados pelo prompt de execucao e pelas referencias que ele aponta
   - se o worktree estiver limpo, usando o historico recente dos arquivos relevantes
   - ignore mudancas nao relacionadas
5. Leia a implementacao real identificada no passo anterior. Nao faca review baseado apenas em intencao.
6. Verifique duas coisas:
   - aderencia ao que foi planejado
   - corretude real do que foi implementado
7. Use evidencia com referencias especificas a arquivos, trechos de codigo e docs quando necessario.
8. Classifique os achados exatamente nestas secoes:
   - `Blockers`
   - `Bugs`
   - `Edge Cases`
   - `Observations`
   - `Validated`
9. Diferencie claramente:
   - desvio tecnico aceitavel
   - desalinhamento de produto
10. Corrija diretamente `Bugs` e `Edge Cases` razoaveis que nao mudem escopo.
11. Revalide depois das correcoes.
12. Se a fase ficar aderente apos as correcoes, atualize ticket e plano para `done`.
13. Se nao encontrar problemas relevantes, diga isso explicitamente.
14. So pare e peca direcao se houver `Product Misalignment`, `Major Drift` ou necessidade de mudar escopo.

Formato da resposta final:

1. `Escopo revisado`
2. `Findings`
3. `Correcoes aplicadas`
4. `Aderencia ao plano e aos specs`
5. `Direcao sugerida`

Se houver `Blockers` ou `Product Misalignment`, diga explicitamente que a fase nao deve ser tratada como concluida.
