Corrija o bug de pointer-events nos overlays fechados neste workspace.

## Contexto

O arquivo `src/index.css` define 4 painéis que sobrepõem o canvas 3D:
- `.history-panel` — já corrigido corretamente
- `.menu-drawer` — BUG: falta pointer-events
- `.camera-picker` — BUG: falta pointer-events
- `.new-game-sheet` — BUG: falta pointer-events

Quando esses 3 painéis estão fechados (sem a classe `.is-open`), eles ficam com `opacity: 0` e `transform` off-screen, mas ainda têm `pointer-events: auto`. Isso faz com que interceptem cliques em elementos visíveis atrás deles.

## O que fazer

Adicionar `pointer-events: none` ao estado fechado e `pointer-events: auto` ao estado `.is-open` para `.menu-drawer`, `.camera-picker` e `.new-game-sheet`, seguindo exatamente o padrão já aplicado ao `.history-panel`.

## Referência — padrão correto já existente

Em `src/index.css`, o `.history-panel` já tem:

```css
.history-panel {
  /* ... */
  pointer-events: none;  /* <-- estado fechado */
}

.history-panel.is-open {
  /* ... */
  pointer-events: auto;  /* <-- estado aberto */
}
```

Replicar esse mesmo padrão para os 3 seletores listados acima.

## Regras

- Edite apenas `src/index.css`.
- Não mude nenhum outro arquivo.
- Não adicione features, não refatore, não mude nomes de classes.
- O `.history-panel` já está correto — não toque nele.
- Depois de editar, rode `node_modules/.bin/vitest.cmd run` para garantir que os testes continuam passando.

## Verificação

Após a correção, os 3 seletores devem ter:
1. `pointer-events: none` no estado fechado (sem `.is-open`)
2. `pointer-events: auto` no estado `.is-open`

Atenção: `.menu-drawer` e `.camera-picker` compartilham regras agrupadas. Verifique se o fix cobre tanto o mobile (regra base) quanto o desktop (media query `min-width: 900px`). O `.new-game-sheet` tem regras próprias.
