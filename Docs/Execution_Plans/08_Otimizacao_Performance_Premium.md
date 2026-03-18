# Plano de Execução - Otimização de Performance Premium & Auto-Detection (AAA Style)

## Ticket Alvo

- `Docs/Tickets/Otimizacao_Performance_Premium.md`

## Referências Obrigatórias

- `src/scene/ChessStage.ts`
- `src/scene/PostProcessingPipeline.ts`
- `src/state/gameStore.ts`
- `src/types/game.ts`

## Objetivo

Implementar um sistema de escalonamento dinâmico de fidelidade visual (Quality Tiers) com detecção automática de hardware e monitoramento de FPS em tempo real, garantindo a melhor experiência possível de acordo com a capacidade do dispositivo (de iPhones antigos a desktops high-end).

## Definição de Tiers de Qualidade

| Recurso | Tier 3 (Ultra) | Tier 2 (High/Optimal) | Tier 1 (Eco/Basic) |
| :--- | :--- | :--- | :--- |
| **Materiais** | `MeshPhysicalMaterial` (Full) | `MeshStandardMaterial` (IBL) | `MeshStandardMaterial` (Simple) |
| **Sombras** | Dinâmicas (4K, Soft) | Dinâmicas (2K, Radius 4) | Desativadas (Bake/Fake) |
| **Post-FX** | Bloom Full Res + AA | Bloom Half Res | Desativado |
| **Resolução** | DPR Nativo (max 2.0) | DPR Limitado (1.5) | DPR Fixo (1.0) |
| **Anisotropia** | Max (16x) | Med (4x) | Desativada (1x) |

---

## Sequência de Ações

### 1. Extensão de Tipos e Estado
- **Arquivo:** `src/types/game.ts`
    - Adicionar `QualityTier = 1 | 2 | 3` ao `AppSettings`.
- **Arquivo:** `src/state/gameStore.ts`
    - Criar a ação `setQualityTier(tier: QualityTier)`.
    - Garantir a persistência via `persistSettings`.

### 2. Implementação do `PerformanceMonitor` (em `ChessStage.ts`)
Criar uma classe interna ou lógica no loop de render para medir a saúde da performance.
- **Lógica:** 
    - Acumular `deltaTime` para calcular FPS médio.
    - Se o FPS médio cair abaixo de **45 FPS** por mais de **3 segundos** consecutivos:
        - Emitir um evento/callback para o `gameStore` baixar o Tier automaticamente.
        - Notificar o usuário via UI (opcional/toast).
- **Throttle:** Impedir que o downgrade ocorra mais de uma vez a cada 60 segundos para evitar "flapping".

### 3. Sistema de Auto-Detection (Hardware Probe)
No método `init()` do `ChessStage.ts`:
- **Ação:** Consultar `renderer.getContext().getExtension('WEBGL_debug_renderer_info')`.
- **Heurística de Tier Inicial:**
    - **Tier 3:** Apple GPU (A15+), NVIDIA RTX, Radeon High-End.
    - **Tier 2:** Apple GPU (A12-A14), Adreno 600+, Intel Iris Xe.
    - **Tier 1:** Intel HD Graphics, Mali GPUs antigas, Dispositivos com menos de 4GB RAM (estimado via `navigator.deviceMemory`).
- **Persistência:** Se o usuário já tiver uma preferência salva no `localStorage`, respeitá-la acima do Autodetect.

### 4. Aplicação Dinâmica de Tiers (O "Switch")
Criar o método `applyQualityTier(tier: QualityTier)` no `ChessStage.ts`.

#### Se Tier 1 (Eco):
- Iterar por todos os materiais das peças e tabuleiro e converter para `MeshStandardMaterial` com `envMapIntensity: 0` ou muito baixo.
- Desativar `renderer.shadowMap.enabled`.
- Chamar `pipeline.setEnabled(false)`.
- Definir `renderer.setPixelRatio(1.0)`.

#### Se Tier 2 (High):
- Usar `MeshStandardMaterial` com IBL configurado.
- Ativar `renderer.shadowMap.enabled` com `mapSize: 2048`.
- Chamar `pipeline.setBloomResolution(0.5)`.
- Definir `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))`.

#### Se Tier 3 (Ultra):
- Restaurar `MeshPhysicalMaterial` com todos os efeitos (clearcoat, sheen).
- Ativar `renderer.shadowMap.enabled` com `mapSize: 4096`.
- Chamar `pipeline.setBloomResolution(1.0)`.
- Definir `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0))`.

### 5. Refatoração do `PostProcessingPipeline.ts`
- **Ação:** Adicionar método `setEnabled(boolean)` para dar bypass total no `EffectComposer` se necessário, economizando draw calls de post-fx.
- **Ação:** Implementar `setBloomResolution(scale)` para re-instanciar ou redimensionar o `UnrealBloomPass` dinamicamente.

---

## Gates antes de concluir

- [ ] O sistema detecta corretamente se é um dispositivo mobile e sugere Tier 2 por padrão.
- [ ] O downgrade automático (45 FPS threshold) funciona ao simular carga pesada na CPU/GPU.
- [ ] A mudança de Tier em tempo real não causa crash ou artefatos visuais permanentes (limpeza de cache de shader).
- [ ] A preferência de qualidade é persistida entre recarregamentos de página.
- [ ] O `PerformanceMonitor` é desativado quando a aba está em background (`document.hidden`).

## Não fazer neste ticket

- Não criar menus de configuração complexos (apenas o motor de detecção e aplicação).
- Não alterar a geometria das peças.
- Não remover o suporte a WebGL 2.0.

## Saída esperada

Um jogo que "se ajusta" sozinho: brilha intensamente em um MacBook M3 ou PC Gamer, mas permanece fluido e jogável em um smartphone intermediário de 3 anos atrás.
