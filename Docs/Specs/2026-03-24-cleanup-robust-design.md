# Design Spec: Robust Cleanup 2026 — Pipo Chess 3D

**Data:** 2026-03-24
**Status:** Approved
**Autor:** Gemini CLI

## 1. Contexto & Objetivos
O projeto Pipo Chess 3D amadureceu, mas a auditoria técnica identificou áreas críticas de risco estrutural que podem comprometer a estabilidade e a performance em sessões de jogo prolongadas. O objetivo deste design é garantir **zero vazamentos de memória**, **interatividade robusta do motor de xadrez** e **manutenibilidade do código de UI**.

### Metas:
- **Zero Regressão Visual:** A saída gráfica deve ser idêntica à atual.
- **Robustez de Ciclo de Vida:** Gerenciamento explícito de recursos Three.js e Web Workers.
- **Componentização:** Início da desconstrução dos arquivos monolíticos.

---

## 2. Arquitetura da Solução

### 2.1. Rendering: Deep Resource Disposal
O `PostProcessingPipeline.ts` atualmente sofre de vazamento de memória GPU ao recriar o `EffectComposer`.

**Mudanças:**
- Implementação de um `collectMeshResources` (ou similar) adaptado para o pipeline.
- O método `rebuildComposer()` deverá:
  1. Percorrer o array `this.composer.passes`.
  2. Identificar e descartar (`dispose()`) materiais, shaders e texturas associados a cada pass.
  3. Descartar explicitamente o `VignetteShader.ShaderMaterial`.
  4. Descartar os `WebGLRenderTarget` internos (readBuffer e writeBuffer) do composer.
- Adição de lógica de **reconfiguração seletiva** (ex: apenas mudar a força do bloom) para evitar reconstruções totais em mudanças triviais de configuração.

### 2.2. Engine: Abortable Search & Tagging
O `EngineClient.ts` possui uma condição de corrida onde buscas de análise e lances reais podem se atropelar.

**Mudanças:**
- **Search ID Pattern:** Cada chamada a `search()`, `hint()` ou `evaluatePosition()` gerará um ID único (Ply + Timestamp).
- **Abordagem AbortController:** 
  - O `EngineClient` manterá um `currentAbortController`.
  - Novas requisições cancelam a anterior via `.abort()`.
  - O comando físico `stop` será enviado ao Stockfish worker imediatamente.
- **Message Filtering:** O callback de processamento de mensagens do Worker só resolverá a Promise se o ID da mensagem recebida bater com o ID da busca ativa.

### 2.3. UI: Standardized Overlays & Scrims
O `App.tsx` possui implementações inconsistentes de overlays, levando a bugs de `pointer-events`.

**Mudanças:**
- Extração de um componente `BaseOverlay` (ou refatoração para um padrão consistente).
- Uso obrigatório do `PresenceAwareOverlayScrim`.
- Implementação do atributo `inert` (ou trava de pointer-events via CSS `pointer-events: none`) durante o estado `exit` do `AnimatePresence`.
- Garantia de que cada overlay tenha uma `key` única e estável para evitar reutilização indevida de componentes pelo React.

### 2.4. Housekeeping (Manutenção)
- Consolidar `package-lock.json` como única fonte de verdade de versões.
- Adicionar `pnpm-lock.yaml` ao `.gitignore`.
- Remover o pacote `stockfish` de `dependencies` no `package.json` (já que os assets são gerenciados via script de cópia).

---

## 3. Plano de Verificação

### 3.1. Testes de Performance & Memória
- Monitoramento de `renderer.info.memory` no console para validar que o número de materiais e texturas não aumenta ao alternar configurações de qualidade.
- Stress-test de redimensionamento de janela (que dispara o rebuild do pipeline).

### 3.2. Testes de Estresse do Motor
- Script de teste automatizado disparando múltiplos `selectSquare` rápidos durante uma análise ativa para verificar se o motor trava ou retorna lances obsoletos.

### 3.3. Testes Visuais (QA)
- Comparação de screenshots do mockup original vs. nova implementação para garantir **zero regressão visual**.
- Verificação de que cliques "através" de overlays fechando não são registrados.

---

## 4. Riscos & Mitigações
| Risco | Impacto | Mitigação |
|---|---|---|
| Inconsistência de IDs no Motor | Médio | Usar um gerador de IDs sequencial simples com limpeza de estado no `abort`. |
| Hitch visual no mobile | Baixo | Priorizar `reconfiguração` sobre `reconstrução` no pipeline. |
| Quebra de dependência via housekeeping | Baixo | Validar `npm install` após remover o pacote stockfish. |
