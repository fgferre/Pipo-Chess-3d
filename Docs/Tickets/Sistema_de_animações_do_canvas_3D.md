# Sistema de animações do canvas 3D

## Contexto

Refs: `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/c9191e9e-098e-42c6-8dbd-f4284d2d6260` (seção 3 — Estratégia de animação) · `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/2c83433e-787d-44fb-947d-0fcb1d075901` (Fluxo 2, Fluxo 4)

O `ChessStage` atual aplica posições de peças instantaneamente (teletransporte). Este ticket implementa o sistema completo de animações fluidas do MVP, tornando jogadas da IA, capturas e transições de estado claramente perceptíveis.

## Escopo

### Incluído

1. **Tweening interno leve:** sistema de interpolação baseado no loop `requestAnimationFrame` existente, sem biblioteca externa. Curva de Bézier suave para movimentos.

2. **Animações obrigatórias do MVP:**

| Animação | Comportamento |
|----------|---------------|
| **Movimento normal** | Peça desliza em arco suave (curva de Bézier no espaço 3D) da origem ao destino, ~300ms em modo normal |
| **Jogada da IA** | Mesma animação de movimento, com highlight breve na origem e destino |
| **Captura** | Peça capturada faz fade-out + escala para baixo enquanto a peça atacante se move |
| **Roque** | Rei e Torre se movem simultaneamente com animação coordenada |
| **En passant** | Peão se move na diagonal, peão capturado (em casa diferente) faz fade-out |
| **Promoção** | Peão chega à última fileira, escala/fade para a nova peça |
| **Desfazer** | Movimento reverso animado (peça volta à origem, peça capturada reaparece com fade-in) |
| **Refazer** | Replay animado do par jogador + IA |

3. **Controle de intensidade (`animationMode`):**
   - **Normal:** curvas suaves, arcos 3D, duração ~300ms
   - **Reduced:** deslocamento linear direto, ~150ms, sem efeitos de captura elaborados
   - **Off:** posição aplicada diretamente sem interpolação; highlights visuais de jogada da IA mantidos como feedback mínimo

4. **Integração com `update()`:** o método `update(state)` do `ChessStage` deve detectar mudanças de posição entre o estado anterior e o novo, e aplicar a animação correta em vez de rebuild instantâneo.

5. **Fila de animações:** se múltiplas mudanças de estado chegam antes da animação terminar, as animações devem ser enfileiradas ou a anterior deve ser completada instantaneamente.

### Explicitamente fora

- Animação de transição de câmera entre presets (ticket separado).
- Crossfade 3D ↔ 2D (ticket separado).
- Animações de abertura/fechamento de barras glassmorphism (ticket da UI).
- Feedback visual de fim de partida (ticket da UI).

## Dependências

- **Depende de:** `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/eede9e28-314c-4477-ab2f-e029939b011e` (Port visual do mockup) + `ticket:6c8fb743-ea96-401f-aa24-914f32fadeda/c07fde1d-771e-41f7-a6ee-9d9c03e9dc38` (Interatividade do ChessStage).

## Critérios de aceite

- [ ] Movimento normal da peça é animado com curva suave (~300ms em modo normal).
- [ ] Jogada da IA move a peça sozinha com animação + highlight de origem/destino.
- [ ] Captura mostra feedback visual distinto (peça capturada some com fade/escala).
- [ ] Roque anima rei e torre simultaneamente.
- [ ] En passant anima o peão na diagonal e remove o peão capturado.
- [ ] Promoção anima a transição do peão para a nova peça.
- [ ] Desfazer anima o movimento reverso e reaparição de peças capturadas.
- [ ] Refazer faz replay animado.
- [ ] Modo `'reduced'` encurta e simplifica todas as animações.
- [ ] Modo `'off'` aplica posições instantaneamente, mantendo apenas highlights como indicador visual.
- [ ] Animações não bloqueiam a interação do usuário de forma permanente.
