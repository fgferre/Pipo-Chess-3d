# Integração final, testes e limpeza

## Contexto

Refs: `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/6e4679c4-e7d8-4cbe-9dd5-3fb83bfef724` · `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/2c83433e-787d-44fb-947d-0fcb1d075901` · `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/c9191e9e-098e-42c6-8dbd-f4284d2d6260`

Todos os módulos foram desenvolvidos em tickets anteriores. Este ticket conecta todas as partes, remove código obsoleto e valida a experiência completa de ponta a ponta.

## Escopo

### Incluído

1. **Wiring completo:** garantir que `ChessScene.tsx` passa corretamente `setCameraPreset()` e `setAnimationMode()` para o `ChessStage`, e que os novos componentes de UI (`CameraPresetPicker`, configuração de animação) invocam essas funções via Zustand/props.

2. **Fluxos end-to-end:** validar que todos os 8 fluxos dos Core Flows funcionam de ponta a ponta:
   - Iniciar nova partida (com confirmação se partida ativa)
   - Jogar contra IA (tap-tap e drag-and-drop com animações)
   - Solicitar dica (highlight pulsante, relógio correndo)
   - Desfazer/Refazer (par completo, animação reversa)
   - Controle de câmera (4 presets, modo 2D com crossfade)
   - Salvar/carregar (auto-save, lista, PGN)
   - Análise pós-partida (eval bar, classificação por jogada)
   - Configurações e temas (temas aplicados em tempo real, animação Normal/Reduzido/Desligado)

3. **Remoção de código obsoleto:**
   - Remover `file:public/assets/models/pipo-chess-set.gltf` se ainda presente.
   - Remover `file:tools/generate-chess-assets.mjs` se não for mais necessário.
   - Remover imports e referências ao `GLTFLoader` residuais.
   - Limpar CSS obsoleto do layout accordion anterior.

4. **Atualizar testes E2E:** `file:e2e/app.spec.ts` deve ser atualizado para refletir o novo layout (seletores de elementos mudaram com a reformulação da UI).

5. **PWA:** validar que o Service Worker e o manifest continuam funcionais com os novos assets (sem GLTF, com sprites 2D se aplicável).

6. **Cleanup pass final:** conforme `file:AGENTS.md` — remover debug code, dead branches, helpers redundantes.

### Explicitamente fora

- Novas features além do que foi definido nos Core Flows.
- Otimizações de performance em hardware limite (explicitamente fora do escopo do MVP).

## Dependências

- **Depende de:** Todos os tickets anteriores (T1–T6): Tipos e dados, Port visual, Interatividade, Animações, Câmera/2D e UI glassmorphism.

## Critérios de aceite

- [ ] Todos os 8 fluxos dos Core Flows funcionam end-to-end sem erros.
- [ ] O CameraPresetPicker (UI) aciona `setCameraPreset()` no ChessStage e os 4 presets funcionam.
- [ ] A configuração de animação (UI) aciona `setAnimationMode()` e os 3 modos funcionam.
- [ ] Código obsoleto removido (GLTF, GLTFLoader, generate-chess-assets, CSS accordion antigo).
- [ ] Testes E2E atualizados e passando.
- [ ] Testes unitários existentes continuam passando.
- [ ] PWA instalável e funcional offline.
- [ ] Nenhum console.log de debug, código morto ou helpers não utilizados no build final.
