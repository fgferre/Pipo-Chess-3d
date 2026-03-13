Execute apenas o ticket de integracao final, testes e limpeza neste workspace.

Antes de editar qualquer arquivo, leia nesta ordem:

1. `Docs/Execution_Plans/EXECUTION_PROTOCOL.md`
2. `Docs/Execution_Plans/07_Integracao_final_testes_e_limpeza.md`
3. `Docs/Tickets/Integração_final,_testes_e_limpeza.md`
4. `Docs/Specs/Epic_Brief_—_Pipo_Chess_3d.md`
5. `Docs/Specs/Core_Flows_—_Pipo_Chess_3d.md`
6. `Docs/Specs/Tech_Plan_—_Pipo_Chess_3d.md`
7. `src/App.tsx`
8. `src/components/ChessScene.tsx`
9. `src/state/gameStore.ts`
10. `src/scene/ChessStage.ts`
11. `e2e/app.spec.ts`
12. `public/assets/models/pipo-chess-set.gltf`
13. `tools/generate-chess-assets.mjs`

Objetivo:
- fechar o wiring final entre UI, stage e store
- validar os 8 fluxos do produto ponta a ponta
- remover legado e lixo final sem quebrar o app

Regras:
- nao crie feature nova
- nao remova legado antes de confirmar que ele realmente nao e mais usado
- atualize E2E e testes relevantes para o estado final do produto
- valide offline e PWA se o projeto ja tiver esse caminho implementado
- so marque o epic como pronto se os fluxos e a limpeza realmente fecharem
- classifique o resultado final usando as categorias do protocolo global

Fluxo de trabalho:
1. Resuma os contratos finais que precisam ser integrados e quais artefatos legados parecem obsoletos.
2. Feche a integracao, atualize testes e remova o legado confirmado.
3. Rode a menor validacao util.
4. No final, responda com:
   - o que mudou
   - como validou
   - classificacao final
   - riscos ou pendencias
   - se o ticket pode ser marcado como done
