# Extensão de tipos e dados para o canvas premium

## Contexto

Refs: `spec:6c8fb743-ea96-401f-aa24-914f32fadeda/c9191e9e-098e-42c6-8dbd-f4284d2d6260` (seção 2 — Modelo de Dados)

O canvas premium do mockup, o modo 2D persistível e os novos fluxos de UI exigem extensões nos tipos e dados existentes. Este ticket prepara a fundação de dados/estado que os demais tickets consomem, com mudanças pontuais em tipos, settings persistidos e contrato do store — sem tocar engine/search.

## Escopo

### Incluído

1. **Estender `ThemeDefinition`** em `file:src/types/game.ts` com campos para o canvas 3D:
   - `canvasAccent` (cor do acento dourado da borda)
   - `canvasFelt` (cor do feltro da cena)
   - `canvasFog` (cor da névoa/fundo da cena)

2. **Estender `AppSettings`** em `file:src/types/game.ts` com:
   - `animationMode: 'normal' | 'reduced' | 'off'`
   - `defaultViewMode: '3d' | '2d'`

3. **Adicionar tipos transitórios compartilhados** em `file:src/types/game.ts` para uso entre store/UI onde fizer sentido:
   - estado de promoção pendente
   - estado/cursor do modo análise

4. **Atualizar os temas existentes** em `file:src/data/themes.ts` com valores concretos para os 3 novos campos (`canvasAccent`, `canvasFelt`, `canvasFog`) nos 3 temas atuais (Classic Wood, Emerald, Slate).

5. **Garantir que `persistSettings()` e `loadSettings()`** em `file:src/persistence/db.ts` persistam `animationMode` e `defaultViewMode` sem alterar a estrutura da tabela (já é um JSON blob).

6. **Definir valores default** de `animationMode` como `'normal'` e `defaultViewMode` como `'3d'` na inicialização do app/store.

### Explicitamente fora

- Não alterar `EngineClient`, `engineAdapter.worker` ou `analysis`.
- Não expandir o formato de headers PGN; é permitido apenas um ajuste mínimo e forward-compatible em `file:src/game/pgn.ts` para preservar os novos campos de `AppSettings` quando ausentes nos headers.
- Não implementar ainda os fluxos de UI (sheet de nova partida, popup de promoção, barra de análise).
- Não alterar o `ChessStage` ou `ChessScene`.

## Dependências

Nenhuma — este é o ticket fundacional.

## Critérios de aceite

- [x] `ThemeDefinition` possui os 3 campos novos (`canvasAccent`, `canvasFelt`, `canvasFog`), tipados como `string`.
- [x] `AppSettings` possui `animationMode` e `defaultViewMode`, com tipos coerentes.
- [x] Existem tipos transitórios compartilhados para promoção pendente e cursor/estado do modo análise.
- [x] Os 3 temas existentes em `themes.ts` possuem valores concretos e visualmente coerentes para os novos campos.
- [x] O app/store inicializa `animationMode` com `'normal'` e `defaultViewMode` com `'3d'` por default.
- [x] Settings com `animationMode` e `defaultViewMode` são persistidas via Dexie e restauradas com fallback compatível por `normalizeSettings()`.
- [x] A importação de PGN preserva `animationMode` e `defaultViewMode` a partir do fallback quando os headers não definem esses campos.
- [x] Os testes existentes continuam passando, e `pgn.test.ts` recebeu cobertura adicional para a compatibilidade dos novos campos.

## Notas de implementação

- `file:src/types/game.ts` foi estendido com os novos campos de tema/settings e com os tipos transitórios `PendingPromotion` e `AnalysisCursorState`.
- `file:src/data/themes.ts` recebeu valores concretos para `canvasAccent`, `canvasFelt` e `canvasFog` nos três temas atuais.
- `file:src/game/gameService.ts` passou a definir defaults para `animationMode` e `defaultViewMode`, além de normalizar settings antigos sem esses campos.
- `file:src/game/pgn.ts` recebeu um ajuste forward-compatible mínimo para não descartar os novos campos de `AppSettings` ao importar PGN sem headers específicos.
- `file:src/game/pgn.test.ts` foi ampliado para cobrir a preservação desses novos campos durante importação/round-trip de PGN.
