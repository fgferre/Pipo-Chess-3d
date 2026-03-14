# Prompts de review

Estes prompts sao para uma segunda IA revisar o que foi implementado apos a execucao de cada fase, corrigir problemas razoaveis e liberar ou travar a fase.

## Fluxo recomendado

1. Execute a fase com o prompt de execucao correspondente.
2. Abra uma nova conversa com a IA revisora.
3. Cole o prompt generico desta pasta na IA revisora.
4. A IA revisora deve pedir apenas:
   - qual prompt de execucao foi usado
   - se existe algum contexto extra
5. A partir do prompt de execucao, ela deve localizar plano, ticket, specs e arquivos relevantes.
6. Ela deve corrigir problemas razoaveis e revalidar antes de concluir.
7. So avance para a proxima fase depois de tratar o resultado do review.

## O que a IA revisora deve ler

- `Docs/Execution_Plans/REVIEW_PROTOCOL.md`
- prompt de execucao usado
- referencias derivadas a partir dele
- mudancas reais inferidas a partir do repo

## Regra pratica

Se a IA revisora tiver acesso ao repo, prefira deixar que ela determine o escopo tecnico olhando `git status` e os arquivos implicados pela fase.
Se nao tiver, cole o conteudo manualmente.

## Uso mais simples

Na conversa com a IA revisora:

1. abra `PROMPT_REVIEW_TEMPLATE.md`
2. cole o prompt na IA revisora
3. responda apenas o caminho do prompt de execucao e algum contexto extra, se houver
