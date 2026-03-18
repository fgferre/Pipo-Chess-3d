# Plano Mestre: Migração R3F & Otimização Universal

Este documento detalha o plano técnico para a migração do Pipo Chess 3D de Three.js Vanilla para React Three Fiber (R3F), integrando um sistema de qualidade dinâmica e estética premium.

## 1. Objetivos Principais
- **Arquitetura Moderna:** Modularizar o `ChessStage.ts` (3000+ linhas) em componentes React reutilizáveis.
- **Performance Adaptativa:** Garantir fluidez em hardware de entrada e fidelidade visual máxima em GPUs potentes.
- **Estética High-End:** Implementar materiais e iluminação de nível cinematográfico.

---

## 2. Fase 1: Arquitetura R3F (Modularização)

Migrar a lógica imperativa do `ChessStage` para uma estrutura declarativa:

- **`<SceneContainer />`:** Wrapper principal que gerencia o `<Canvas />`, `Suspense` e o `QualityProvider`.
- **`<Stage />`:** Gerencia o ambiente, neblina (`FogExp2`) e o chão/feltro.
- **`<Board />`:** Componente responsável pela grade de casas, moldura de madeira e marcações.
- **`<Piece />`:** Gerencia a geometria (LOD se necessário) e materiais baseados no Tier de qualidade.
- **`<Lights />`:** Sistema de iluminação de alto contraste (Key Light + Dual Rim Lighting).
- **`<Effects />`:** Pipeline de post-processing usando `@react-three/postprocessing`.

---

## 3. Fase 2: Sistema de Qualidade Dinâmica (Tiers)

Implementar um `QualityManager` que ajusta as propriedades do R3F em tempo real:

### Tier 3: Ultra (Desktop / High-End)
- **Materiais:** `MeshPhysicalMaterial` em todas as peças.
- **Sombras:** 4K PCFSoftShadowMap.
- **Efeitos:** Bloom de alta resolução, SSR (opcional), SSAO de alta qualidade.
- **DPR:** Nativo (até 2.0x).

### Tier 2: Optimal (Mobile / Mid-Range)
- **Materiais:** `MeshStandardMaterial` com IBL (Image Based Lighting) via HDRI leve.
- **Sombras:** 1K/2K Soft Shadows (Resolução 1024px compensada com `shadow.radius` elevado ~4.0+ para efeito soft/anti-aliasing).
- **Efeitos:** Bloom Half-Res, Tonemapping ACES.
- **DPR:** Cap em 1.5x (importante para iPhones evitar superaquecimento).

### Tier 1: Eco (Power Save / Legacy)
- **Materiais:** `MeshLambertMaterial` ou `MeshStandard` simplificado.
- **Sombras:** Desativadas.
- **Efeitos:** Post-processing desativado.
- **DPR:** 1.0x fixo.

---

## 4. Fase 3: Detecção e Auto-Profiling

Criar um hook `useAutoProfiler` para gerenciamento de performance:

- **Detecção Inicial:** Utilizar `WEBGL_debug_renderer_info` para identificar a GPU no carregamento e definir o Tier inicial.
- **Monitoramento de FPS:** Monitorar a média de frames. Se `FPS < 45` por mais de 3 segundos seguidos, realizar o downgrade silencioso de Tier.
- **Throttle de Render:** Implementar renderização sob demanda (apenas quando houver mudanças no estado do jogo ou interações de câmera).

---

## 5. Fase 4: Estética Premium & Iluminação

Refinar o visual para atingir o "Look Pipo Premium":

- **Materiais Diferenciados (Sólidos e Polidos):**
  - **Peças Brancas:** Albedo (cor base) escurecido (tom 'Shadow Ivory' ou cinza quente profundo) para que a geometria seja definida pela luz; Polimento profundo (`Clearcoat: 1.0`); 'Sheen' branco puro para criar o microcontorno de separação de silhuetas. Superfície deve ser sólida e polida, sem ruído visual ou texturas orgânicas.
  - **Peças Pretas:** Acabamento Matte/Fosco (`Roughness: 0.8`), realçando o contraste com as brancas.
- **Iluminação High-Contrast:**
  - **Sculptural Cross-Lighting:** Luz lateral em ângulo agudo (Key Light) como segredo para revelar os detalhes esculpidos e sombras longas.
  - Rim Lighting duplo (azul/violeta sutil e branco frio) para destacar as bordas das peças.
- **Câmera:** `Camera Target` fixo em `(0,0,0)` para garantir que a OrbitControls rotacione perfeitamente ao redor do centro do tabuleiro. Obrigatoriamente setar `enablePan: false` para impedir o deslocamento do centro de rotação.

---

## 6. Fase 5: Otimização Mobile-First (iPhone/iPad)

- **Post-Processing Uber-Shader:** Consolidar Bloom, Tonemapping e Vignette em um único shader pass para reduzir draw calls.
- **Interatividade:** Garantir que o `Raycasting` para seleção de peças seja otimizado para eventos de toque.
- **Layout Responsivo:** O R3F Canvas deve respeitar o CSS Grid atual, redimensionando-se automaticamente quando o histórico de jogadas ou menu lateral for aberto/fechado.

---

## 7. Critérios de Aceite

1. [ ] Transição completa do `ChessStage.ts` para componentes R3F.
2. [ ] Downgrade de Tier funcionando ao simular queda de FPS (ex: via CPU throttling no DevTools).
3. [ ] Peças brancas exibindo brilho Fresnel/Sheen perceptível sob luz lateral.
4. [ ] Sem jitter na câmera durante rotação (Target fixo em 0,0,0).
5. [ ] Performance estável (> 55 FPS) em dispositivos mobile de média gama no Tier 2.

---

## Notas Técnicas para o Desenvolvedor
- Utilize `useFrame` para animações suaves de transição de peças.
- Mantenha a lógica de estado do jogo no `gameStore.ts` (Zustand), consumindo apenas os dados necessários nos componentes 3D.
- Evite recriação de geometrias; use o cache de `prototypes` já existente no projeto, adaptado para R3F.
