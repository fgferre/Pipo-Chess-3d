# Plano de execucao - Integracao final, testes e limpeza

## Ticket alvo

- `Docs/Tickets/Integração_final,_testes_e_limpeza.md`

## Referencias obrigatorias

- Todos os specs em `Docs/Specs/`
- Todos os tickets em `Docs/Tickets/`
- Todos os planos anteriores desta pasta
- `src/App.tsx`
- `src/components/ChessScene.tsx`
- `src/state/gameStore.ts`
- `src/scene/ChessStage.ts`
- `e2e/app.spec.ts`
- `public/assets/models/pipo-chess-set.gltf`
- `tools/generate-chess-assets.mjs`

## Objetivo

Fechar o epic como um sistema coerente: wiring completo, validacao dos fluxos de ponta a ponta, remocao de legado e cleanup final sem deixar drift acumulado entre specs, tickets e implementacao.

## Estado atual relevante

- O repositorio ainda carrega artefatos legados de GLTF e geracao de assets.
- `ChessScene` ainda precisara ser o ponto de acoplamento entre UI e stage para camera e animacao.
- O teste E2E atual reflete o shell antigo e precisara acompanhar a UI nova.
- Este ticket depende do contrato real entregue pelos planos anteriores; ele nao deve inventar feature nova.

## Sequencia de acoes

1. Fazer um inventario final dos contratos que mudaram durante os tickets anteriores.
   Resultado esperado:
   Antes de limpar qualquer coisa, fica claro:
   - como a UI aciona camera e animacao
   - como o stage consome estado do app
   - quais estados transitrios ficaram no store
   - quais arquivos legados deixaram de ser usados

2. Fechar o wiring de ponta a ponta entre UI, `ChessScene`, stage e store.
   Resultado esperado:
   `CameraPresetPicker` e configuracao de animacao passam a dirigir efetivamente `setCameraPreset()` e `setAnimationMode()` no `ChessStage`.

3. Validar um por um os 8 fluxos dos Core Flows.
   Resultado esperado:
   O ticket nao usa um unico teste superficial; ele percorre:
   - nova partida
   - gameplay
   - dica
   - undo e redo
   - camera e modo 2D
   - salvar e carregar
   - analise pos-partida
   - configuracoes e temas

4. Atualizar testes automatizados de acordo com o produto final.
   Resultado esperado:
   Unitarios, integracao relevante e `e2e/app.spec.ts` passam a refletir a interface e os seletores finais em vez do shell antigo.

5. Remover codigo e artefatos obsoletos apenas depois da validacao funcional.
   Resultado esperado:
   GLTF, `GLTFLoader`, geradores de assets nao utilizados e CSS antigo saem do projeto sem remover algo que ainda esteja servindo como dependencia oculta.

6. Verificar PWA e offline no contexto novo.
   Resultado esperado:
   A remocao de assets antigos e a adicao de novos recursos nao quebram manifest, service worker nem funcionamento offline esperado.

7. Fazer o cleanup pass final exigido por `AGENTS.md`.
   Resultado esperado:
   Sem `console.log` de debug, sem branches mortas, sem helpers redundantes, sem comments temporarios e sem lixo de migracao.

## Gates antes de concluir

- Os 8 fluxos funcionam de ponta a ponta.
- UI nova aciona camera e animacao reais no stage.
- E2E e testes unitarios relevantes passam.
- O legado realmente obsoleto foi removido.
- PWA e offline seguem funcionais.
- Nao restam pontos conhecidos de drift entre implementacao e specs sem registro.

## Nao fazer neste ticket

- Nao adicionar features novas.
- Nao mascarar falhas de fluxo com workarounds temporarios.
- Nao declarar o epic como concluido sem checar offline, E2E e cleanup de legado.

## Saida esperada

O epic fica pronto para aceite final do MVP, com documentacao, implementacao e testes apontando para a mesma realidade do produto.
