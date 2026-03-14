# Reformulação completa da UI glassmorphism mobile-first

## Contexto

Refs: `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/2c83433e-787d-44fb-947d-0fcb1d075901` (Princípios de Layout, todos os 8 Fluxos) · `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/c9191e9e-098e-42c6-8dbd-f4284d2d6260` (seção 3 — Reformulação de App.tsx e layout, Novos componentes)

O `file:src/App.tsx` atual é desktop-first com layout accordion. Este ticket reformula toda a UI para mobile-first com canvas full-screen e barras retráteis glassmorphism, conforme os wireframes dos Core Flows, e faz o wiring mínimo necessário com o store para que os fluxos de nova partida configurável, promoção e análise navegável existam de ponta a ponta.

## Escopo

### Incluído — Novos componentes

| Componente | Responsabilidade |
|------------|------------------|
| **`TopBar`** | Relógio ativo/inativo de ambos os lados + indicador da IA pensando. Retrátil: recolhida mostra pílulas de relógio, expandida mostra nomes + nível IA |
| **`BottomBar`** | Ações: Nova Partida, Desfazer, Refazer, Dica, Câmera, Menu. Retrátil: recolhida mostra ícones-pílula, expandida mostra botões com label |
| **`HistoryPanel`** | Painel lateral que desliza da borda direita. Lista de jogadas em notação algébrica. Realoca `file:src/components/MoveList.tsx` internamente |
| **`MenuDrawer`** | Drawer central glassmorphism: Configurações, Partidas Salvas, Análise, PGN, Animações, Temas. Realoca `file:src/components/AnalysisSummaryView.tsx` internamente |
| **`NewGameSheet`** | Bottom sheet glassmorphism (~60% da tela): seleção de cor, nível IA (slider), tempo (presets + custom) |
| **`PromotionPopup`** | Popup compacto acima do peão com 4 ícones 2D das peças |
| **`ResultModal`** | Modal glassmorphism de fim de partida: resultado + "Analisar" / "Nova Partida" / "Menu" |
| **`CameraPresetPicker`** | Seletor de preset de câmera (4 opções), acessado via botão na BottomBar |
| **`EvalBar`** | Barra de avaliação vertical no modo análise (lateral esquerda do canvas) |

### Incluído — Reformulação do App.tsx

1. Layout passa a ser **canvas full-screen** (100vw × 100vh) com todos os componentes flutuando sobre ele.
2. **Glassmorphism consistente:** `backdrop-filter: blur()`, bordas semi-transparentes, fundo com opacidade.
3. **Animações de abertura/fechamento** das barras e painéis (slide, fade, transitions CSS).
4. **Responsividade:** mobile-first, mas que funcione em desktop. Em telas maiores, os painéis podem ter comportamento adaptado (ex: HistoryPanel pode ficar permanentemente visível).
5. **Wiring do store/UI para Fluxo 1:** o `NewGameSheet` realmente inicia partidas com cor **Brancas / Pretas / Aleatório**, respeita o tempo e o nível escolhidos e exibe confirmação quando já existir uma partida em andamento.
6. **Wiring do store/UI para promoção:** o `PromotionPopup` observa um estado de promoção pendente, exibe as 4 opções e só confirma o lance quando o jogador escolhe a peça.
7. **Wiring do store/UI para análise:** os controles ⏮ ◀ ▶ ⏭ ▶️ dirigem um cursor de análise/autoplay, mantendo tabuleiro, histórico e eval bar sincronizados.
8. **Configurações persistidas:** a UI expõe `animationMode` e `defaultViewMode` (3D padrão ou 2D padrão) e aplica/persiste essas preferências.
9. **Avisos de fluxo:** a UI mostra aviso discreto de restauração de partida em andamento quando o autosave for reaberto.

### Incluído — Preservação

- `file:src/components/ChessScene.tsx` — preservado com interface inalterada.
- `file:src/components/MoveList.tsx` — preservado, realocado dentro do `HistoryPanel`.
- `file:src/components/AnalysisSummaryView.tsx` — preservado, realocado dentro do `MenuDrawer`.
- Configuração de animação (Normal/Reduzido/Desligado) acessível via `MenuDrawer` → Configurações.

### Incluído — Estilos

- Reescrever `file:src/index.css` para o novo layout glassmorphism (ou adicionar módulos CSS/Tailwind conforme padrão do projeto).
- Os wireframes do `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/2c83433e-787d-44fb-947d-0fcb1d075901` (barras recolhidas, barras expandidas, painel de nova partida) são referência visual obrigatória.

### Explicitamente fora

- Mudanças na engine (`EngineClient`, worker UCI) ou na lógica de renderização 3D do `ChessStage`.
- Implementação dos presets de câmera e do modo 2D no canvas — aqui entra apenas o `CameraPresetPicker` como componente UI.
- Refatorações amplas na lógica de negócio além do wiring mínimo necessário para nova partida configurável, promoção e análise navegável.

## Dependências

- **Depende de:** `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/7e5fbcaa-804e-4c08-b172-86ce30bea25f` (tipos e dados para `animationMode`, `defaultViewMode` e estados transitórios).
- **Idealmente após:** `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/eede9e28-314c-4477-ab2f-e029939b011e` e `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/c07fde1d-771e-41f7-a6ee-9d9c03e9dc38` (canvas visual + interatividade) para testes visuais integrados.

## Critérios de aceite

- [x] Canvas 3D ocupa 100% da viewport em mobile e desktop.
- [x] TopBar renderiza com glassmorphism, retrátil, mostrando relógios e estado da IA.
- [x] BottomBar renderiza com glassmorphism, retrátil, com todas as ações (Nova Partida, Desfazer, Refazer, Dica, Câmera, Menu).
- [x] HistoryPanel desliza da borda direita e mostra a lista de jogadas.
- [x] NewGameSheet sobe como bottom sheet com configuração de cor, nível e tempo.
- [x] Escolher **Pretas** ou **Aleatório** no `NewGameSheet` realmente afeta a partida iniciada; se o jogador começar de pretas, a IA faz a primeira jogada.
- [x] Iniciar nova partida com uma ativa exibe confirmação antes de substituir a atual.
- [x] PromotionPopup aparece acima do peão com 4 opções de peça e a escolha do jogador determina a promoção final.
- [x] ResultModal aparece no fim da partida com resultado e opções.
- [x] MenuDrawer dá acesso a Configurações (temas, animações, idioma, view mode padrão), Partidas Salvas e Análise.
- [x] EvalBar aparece no modo análise na lateral esquerda com avaliação da posição.
- [x] Os controles do modo análise navegam a partida e mantêm tabuleiro, histórico e avaliação sincronizados.
- [x] CameraPresetPicker lista os 4 presets de câmera.
- [x] Preferências de animação (Normal/Reduzido/Desligado) e view mode padrão (3D/2D) são configuráveis e persistem.
- [x] Ao restaurar autosave, a UI mostra um aviso discreto de restauração da partida em andamento.
- [x] Layout é mobile-first e funciona em desktop.
- [x] Todas as interações existentes (hint, undo, redo, new game, save, load, export, import, analysis) continuam funcionando.
- [x] MoveList e AnalysisSummaryView são realocados sem alteração funcional.
