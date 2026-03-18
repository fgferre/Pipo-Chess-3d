# Ticket: Otimização de Performance Premium & Auto-Detection

## Status
- **Prioridade:** Alta
- **Status:** Pendente
- **Assunto:** Performance & Quality Tiers

## Descrição
Implementar um sistema de Quality Tiers que permite ao jogo rodar em diferentes tipos de hardware com a melhor fidelidade visual possível sem comprometer a fluidez (60 FPS). Inclui monitoramento de FPS em tempo real e detecção automática de hardware.

## Critérios de Aceite

### 1. Sistema de Tiers
- [ ] Implementação de 3 Tiers (Ultra, High, Eco).
- [ ] Tier 1 (Eco) deve garantir fluidez em dispositivos de entrada (sem sombras, bloom ou materiais complexos).
- [ ] Tier 2 (High) deve ser o equilíbrio para dispositivos intermediários (DPR 1.5, IBL, Sombras 2K).
- [ ] Tier 3 (Ultra) deve usar todo o potencial visual (DPR 2.0, Physical Materials, Sombras 4K).

### 2. Auto-Detection & Monitoramento
- [ ] Detectar hardware no `init` usando `WEBGL_debug_renderer_info`.
- [ ] Monitorar FPS em tempo real no `ChessStage`.
- [ ] Se FPS < 45 por 3 segundos, baixar o Tier automaticamente (apenas se não houver preferência manual do usuário).
- [ ] Implementar cooldown de 60 segundos para mudanças automáticas.

### 3. Persistência e UI
- [ ] Salvar a escolha de qualidade no `gameStore` e `localStorage`.
- [ ] Garantir que a mudança de tier em runtime seja suave (sem flashes pretos longos).

## Tarefas Técnicas

1. **Types:** Adicionar `qualityTier` ao `AppSettings`.
2. **Store:** Criar ação `setQualityTier` no `gameStore.ts`.
3. **Stage - Monitor:** Criar `PerformanceMonitor` dentro do `ChessStage.ts`.
4. **Stage - AutoDetect:** Implementar lógica de detecção de GPU no `init`.
5. **Stage - Apply:** Criar `applyQualityTier` que manipula materiais, sombras e post-processing.
6. **Pipeline:** Adicionar métodos para habilitar/desabilitar e redimensionar o Bloom dinamicamente.

## Notas
- Priorizar `MeshStandardMaterial` no Tier 2 para performance sem perda visual significativa.
- O Tier 1 deve ser agressivo na economia de recursos (DPR 1.0 é mandatório).
