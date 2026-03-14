# Prompts de review

Estes prompts sao para uma segunda IA revisar o que foi implementado apos a execucao de cada fase, corrigir problemas razoaveis e liberar ou travar a fase.

## Fluxo recomendado

1. Execute a fase com o prompt de execucao correspondente.
2. Abra uma nova conversa com a IA revisora.
3. Use o prompt generico desta pasta preenchendo apenas os caminhos da fase.
4. A IA revisora deve inferir o escopo tecnico usando o estado do repo e os arquivos implicados pelo plano e ticket.
5. Ela deve corrigir problemas razoaveis e revalidar antes de concluir.
6. So avance para a proxima fase depois de tratar o resultado do review.

## O que a IA revisora deve ler

- `Docs/Execution_Plans/REVIEW_PROTOCOL.md`
- prompt de execucao usado
- plano da fase
- ticket alvo
- specs relevantes
- mudancas reais inferidas a partir do repo

## Regra pratica

Se a IA revisora tiver acesso ao repo, prefira deixar que ela determine o escopo tecnico olhando `git status` e os arquivos implicados pela fase.
Se nao tiver, cole o conteudo manualmente.

## Uso mais simples

Na conversa com a IA revisora:

1. abra `PROMPT_REVIEW_TEMPLATE.md`
2. preencha os caminhos da fase
3. cole o prompt completo na IA revisora
