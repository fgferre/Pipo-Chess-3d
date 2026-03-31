# Plano de Execucao em Etapas Seguras

## Objetivo

Melhorar a estrutura, a prontidao de publicacao e a racionalizacao do codigo do `Pipo Chess 3D` sem regressao visual, sem fallback pior, sem refatoracao ampla de alto risco e sem reabrir problemas ja estabilizados.

## Diagnostico consolidado

O projeto ja esta bem resolvido em pontos importantes de jogo web:

- a simulacao vive fora do renderer
- o HUD e os menus vivem no DOM, nao no canvas
- a cena 3D esta encapsulada atras do adapter
- os testes locais, build e e2e ja estao em um nivel util

As maiores oportunidades remanescentes nao estao mais em deadcode pesado. Elas estao em:

1. orquestracao monolitica de `src/App.tsx`
2. assinatura global da store e custo de rerender do shell
3. ponte sincronizada entre render loop 3D e React em `src/components/ChessScene.tsx`
4. chunking e estrategia de bootstrap para release
5. decomposicao incremental de `src/state/gameStore.ts`
6. poda fina de legado residual

## Ordem recomendada

1. reduzir acoplamento e rerender do shell em `src/App.tsx`
2. remover o acoplamento `flushSync` <-> render loop em `src/components/ChessScene.tsx`
3. aplicar `manualChunks` com medicao antes e depois
4. fechar readiness real de publicacao PWA
5. decompor `src/state/gameStore.ts` por dominio
6. fazer poda fina de exports e leftovers remanescentes

## Regras de execucao

- sempre ler os arquivos relevantes antes de editar
- preservar mudancas existentes no branch
- fazer o menor diff que entregue ganho real
- nao reorganizar pastas nem mover arquivos sem evidencia clara de ganho
- medir antes e depois nas fases de performance
- manter gates curtos: `lint`, `test`, `build`, `test:e2e` e smoke quando fizer sentido
- se uma fase comecar a virar refatoracao ampla, parar e redividir

## Fase 0 - Baseline e guardrails

### Objetivo

Congelar o estado atual para que as proximas fases tenham comparacao objetiva.

### Arquivos principais

- `src/App.tsx`
- `src/state/gameStore.ts`
- `src/components/ChessScene.tsx`
- `vite.config.ts`
- `playwright.config.ts`
- `package.json`

### Acoes

1. Registrar metricas atuais:
   - tamanho dos chunks do build
   - tempo e resultado de `npm run test:e2e`
   - resultado de `npm run test:e2e:smoke-cross`
2. Confirmar quais partes de `App` e `gameStore` mais rerenderizam ou concentram responsabilidade.
3. Nao editar comportamento nesta fase, apenas medir e mapear.

### Gate de saida

- existe um baseline simples de build e verificacao para comparar as fases seguintes

## Fase 1 - Boundary de shell e selectors

### Objetivo

Parar de fazer o `App` inteiro assinar a store inteira e separar a orquestracao de shell do restante do jogo.

### Alvo tecnico

- `src/App.tsx`
- possiveis novos hooks ou componentes pequenos, somente se nao existir equivalente util

### Escopo

1. Trocar `useGameStore()` sem selector por selectors menores e explicitos.
2. Separar subarvores do shell em blocos previsiveis:
   - top bar
   - bottom bar
   - menu
   - history
   - dialogs
3. Extrair a coordenacao de overlays e estado de shell para um controller ou hook dedicado, sem mudar regra de negocio do jogo.

### Nao fazer

- nao mexer em regras de xadrez
- nao mexer no renderer 3D nesta fase
- nao reformatar o arquivo inteiro
- nao reescrever a store

### Validacao

- `npm run lint`
- `npm test`
- `npm run test:e2e`

### Gate de saida

- `src/App.tsx` fica menor e com menos responsabilidade direta
- a shell nao depende mais da store inteira
- nenhuma regressao visual ou de navegacao

## Fase 2 - Desacoplar React do render loop 3D

### Objetivo

Remover a ponte sincronizada entre o render loop do stage e commits React.

### Alvo tecnico

- `src/components/ChessScene.tsx`
- `src/scene/SceneAdapter.ts`
- `src/scene/ChessStage.ts`

### Hipotese de trabalho

Hoje a reprojecao de anchors passa por `flushSync` dentro de `setOnBeforeRender`. Isso precisa virar algo menos acoplado, por exemplo:

- callback agendado por `requestAnimationFrame`
- atualizacao por diff de anchors
- canal de projecao menos sincronizado com commit React

### Escopo

1. mapear exatamente quando os anchors realmente precisam ser reprojetados
2. substituir o `flushSync` por um mecanismo previsivel e mais barato
3. manter os overlays alinhados ao board

### Nao fazer

- nao mudar contrato publico de `ChessScene` sem necessidade
- nao mexer em iluminacao, camera ou materiais

### Validacao

- `npm run lint`
- `npm test`
- `npm run test:e2e`
- verificacao manual de promotion, invalid move, check e castling cues

### Gate de saida

- nao existe mais commit React sincronizado no loop de render
- os anchors continuam corretos

## Fase 3 - Chunking e bootstrap

### Objetivo

Melhorar cache, parse e cold start sem alterar comportamento.

### Alvo tecnico

- `vite.config.ts`
- `package.json`

### Escopo

1. adicionar `build.rollupOptions.output.manualChunks`
2. separar ao menos:
   - `three`
   - `framer-motion`
   - vendor de app quando fizer sentido
3. comparar build antes e depois

### Nao fazer

- nao inventar lazy loads novos sem necessidade
- nao mexer em runtime do engine nesta fase

### Validacao

- `npm run build`
- registrar tamanhos antes e depois
- `npm run test:e2e`

### Gate de saida

- chunk inicial cai ou fica melhor distribuido
- cacheabilidade melhora
- nenhum fluxo quebra

## Fase 4 - Readiness de publicacao PWA

### Objetivo

Fechar o que ainda falta para chamar a entrega de PWA de governada e verificavel.

### Alvo tecnico

- `vite.config.ts`
- `src/main.tsx`
- qualquer utilitario ja existente de service worker, se houver
- e2e ou smoke tests proporcionais

### Escopo

1. revisar ciclo de install/update/offline
2. decidir se o app precisa expor tratamento explicito para update pronto ou offline ready
3. validar se o `.wasm` do engine esta sendo tratado de forma consistente no ciclo PWA

### Nao fazer

- nao transformar isso em redesign de onboarding
- nao expandir muito a UI se um indicador minimo resolver

### Validacao

- `npm run build`
- `npm run test:e2e`
- smoke manual de reload, offline e update quando aplicavel

### Gate de saida

- o comportamento de PWA deixa de ser apenas implicito
- existe verificacao explicita suficiente para release

## Fase 5 - Decompor `gameStore` por dominio

### Objetivo

Reduzir concentracao de bootstrap, engine, persistence, analysis e settings num unico arquivo.

### Alvo tecnico

- `src/state/gameStore.ts`
- possiveis modulos auxiliares em `src/state/` ou pasta equivalente existente

### Estrategia

Extrair por dominio sem mudar a interface publica do store em uma tacada unica:

1. bootstrap e engine subscription
2. analysis orchestration
3. persistence e autosave
4. settings persistence helpers

### Nao fazer

- nao trocar toda a API do store
- nao dividir em muitos arquivos pequenos sem necessidade

### Validacao

- `npm run lint`
- `npm test`
- `npm run test:e2e`

### Gate de saida

- `gameStore.ts` vira composicao, nao centro de tudo
- cada dominio fica mais facil de testar e revisar

## Fase 6 - Poda fina de legado residual

### Objetivo

Encerrar o que sobrar de API surface desnecessaria e leftovers pequenos.

### Candidatos conhecidos

- internalizar helpers exportados sem consumidores externos em `e2e/helpers.ts`
- internalizar tipos exportados sem uso externo em `src/components/CameraPickerPanel.tsx`
- internalizar tipos exportados sem uso externo em `src/components/HistoryPanel.tsx`
- avaliar remocao de `@playwright/cli` se o time nao usa esse binario manualmente
- mover `src/assets/mockup tabuleiro 3d.html` para `Docs/` apenas se isso nao gerar confusao com a documentacao atual

### Validacao

- `npm run lint`
- `npm test`
- `npm run build`

### Gate de saida

- poda feita com evidencia forte
- nenhuma remocao por suposicao

## Conversas recomendadas

O melhor fluxo nao e tentar fazer tudo em uma conversa longa. O melhor fluxo e abrir uma conversa nova por fase:

1. conversa 1: Fase 1
2. conversa 2: Fase 2
3. conversa 3: Fase 3
4. conversa 4: Fase 4
5. conversa 5: Fase 5
6. conversa 6: Fase 6

## Prompt base para reabrir em conversa limpa

```md
Use o plano `Docs/Plans/2026-03-31-estrutura-publicacao-safe-stages.md`.

Execute apenas a Fase X.

Regras:
- leia primeiro o plano e os arquivos da fase
- preserve o estado atual do branch
- faca o menor diff que entregue a fase inteira
- nao expanda escopo
- se aparecer risco de regressao estrutural, pare e explique

No final, responda com:
- o que mudou
- como validou
- metricas antes e depois, se a fase exigir
- riscos residuais
- se a fase pode ser considerada concluida
```

## Sugestao melhor do que "fazer tudo de uma vez"

Sim. A abordagem melhor e:

1. tratar `App` e selectors primeiro, porque isso melhora estrutura e runtime ao mesmo tempo
2. fazer `manualChunks` em paralelo ou logo depois, porque e um diff pequeno e mensuravel
3. deixar a decomposicao do store para depois que o shell estiver menos acoplado

Essa ordem reduz risco, preserva comportamento e evita que uma refatoracao grande esconda regressao de performance ou de UI.
