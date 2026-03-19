# Plano Unificado: Performance Premium, Auto-Detect e Migração R3F

## Resumo
- Unificar `08_Otimizacao_Performance_Premium` e o ticket `Otimizacao_Performance_Premium` em um único fluxo de implementação no stack atual de `Three.js` imperativo.
- Reduzir `09_Migracao_R3F_e_Otimizacao_Universal` para uma fase dependente dessa fundação, reaproveitando a mesma política de qualidade sem reimplementar lógica.
- Ordem obrigatória: `fundação compartilhada -> implementação no runtime atual -> validação/aceite -> preparação de adapter -> migração incremental para R3F -> otimizações universais pós-paridade`.
- Regra central para evitar duplicidade: heurística de tier, precedência `auto/manual`, thresholds de FPS e cooldown existem em um único módulo compartilhado; `ChessStage` e, depois, o runtime R3F só aplicam esses resultados ao renderer.

## Mudanças-Chave de Interface
- `AppSettings` passa a persistir `qualityMode: "auto" | "manual"` e `manualQualityTier: 1 | 2 | 3`.
- O padrão do produto passa a ser `qualityMode = "auto"`, no estilo AAA: o hardware probe define o tier inicial ao iniciar a cena.
- O runtime atual ganha um contrato explícito de qualidade, com `setQualityPreference(...)` ou equivalente no adapter da cena; o restante do lifecycle atual permanece estável.
- O pipeline de pós-processamento passa a expor `setEnabled(boolean)` e `setBloomResolutionScale(number)` para permitir bypass real e ajuste de custo sem recriar a cena.
- O menu existente recebe apenas um controle mínimo de override: `Auto`, `Eco`, `High`, `Ultra`; em modo manual o auto-downgrade fica desabilitado até o usuário voltar para `Auto`.

## Fluxo de Execução
- Fase 1, fundação compartilhada: criar o módulo puro de política de qualidade com tiers, thresholds (`FPS < 45 por 3s`, cooldown `60s`), precedência `manual > auto-detect > auto-downgrade` e classificação de hardware.
- Fase 1, persistência: normalizar defaults, hidratação e persistência para os novos campos de qualidade sem quebrar sessões salvas nem settings antigos.
- Fase 2, runtime atual: implementar hardware probe no `ChessStage`, resolver o tier inicial em `auto` e aplicar o tier ativo a DPR, sombras, anisotropia, materiais e pós-processamento.
- Fase 2, monitoramento: adicionar o `PerformanceMonitor` no loop RAF atual, pausar a amostragem quando a aba estiver em background, e permitir apenas downgrade automático de um tier por janela de cooldown, nunca abaixo do Tier 1.
- Fase 2, escopo fechado: esta entrega substitui o conteúdo duplicado de `08` e do ticket; ela não inclui `render-on-demand`, `uber-shader`, nem dependências de R3F.
- Fase 3, preparação para migração: introduzir um adapter interno de cena para que `ChessScene` deixe de depender diretamente de uma implementação concreta.
- Fase 4, migração R3F: adicionar as dependências do ecossistema R3F e portar a cena por paridade funcional, em fatias, atrás do mesmo adapter.
- Fase 4, reaproveitamento: o runtime R3F consome exatamente a mesma política de qualidade; só a camada de aplicação muda.
- Fase 5, otimização universal: somente após paridade funcional do R3F avaliar `render-on-demand`, consolidação de passes e otimizações mobile-first mais agressivas.

## Orquestração com Subagentes
- O orquestrador mantém o checklist mestre, gates de dependência, integração final e validação contra ticket e plano.
- Subagente A fica dono do módulo compartilhado de qualidade, heurísticas de probe, thresholds e testes unitários.
- Subagente B fica dono de store, tipos, persistência, menu de settings e textos/i18n relacionados ao override de qualidade.
- Subagente C fica dono do runtime atual de `Three.js`, incluindo `ChessStage`, aplicação de tiers, monitor de FPS, pipeline e testes de cena.
- Subagente D só inicia após o aceite da Fase 2 e fica dono do adapter de cena e da introdução controlada das dependências R3F.
- Subagentes E/F portam slices do runtime R3F com escopos disjuntos, por subsistema, sem duplicar a lógica de qualidade já consolidada.
- A janela principal recebe apenas sínteses, decisões e integração; o trabalho detalhado e o contexto pesado ficam distribuídos entre os subagentes.

## Testes e Aceite
- Validar normalização e hidratação dos novos settings de qualidade, inclusive fallback de dados antigos.
- Validar precedência: `Auto` usa probe e permite downgrade automático; `Manual` força o tier escolhido e bloqueia auto-downgrade.
- Validar no runtime atual a aplicação de tier em DPR, sombras, materiais, bloom e bypass do pipeline, sem crash nem artefato persistente.
- Validar que aba em background pausa monitoramento e que o cooldown impede flapping.
- Validar que o controle mínimo no menu persiste corretamente e reflete no runtime sem regressão nas demais settings.
- Só iniciar a migração R3F depois que o ticket de performance estiver aceito no runtime atual.
- Na migração, exigir paridade de câmera, interação, projeção de promotion anchor e estabilidade antes de ligar otimizações extras.

## Assunções e Cortes
- `08` e o ticket deixam de existir como frentes separadas de implementação; passam a ser uma única entrega de base.
- `09` deixa de carregar lógica duplicada de tiers e vira um plano dependente da fundação já entregue.
- O comportamento desejado é AAA-style: autodetect define a configuração inicial, mas o usuário pode sobrescrever via controle simples no menu já existente.
- Não entram nesta primeira entrega redesign de UI, painel avançado de gráficos, refatoração ampla do loop de render nem mudança de visual além do necessário para aplicar os tiers.
