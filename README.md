# Pipo Chess 3D

Jogo de xadrez single-player offline-first com React, TypeScript, Three.js e Stockfish rodando localmente no navegador.

## Stack

- React 19 + Vite + TypeScript
- Zustand para estado global
- chess.js para regras, PGN e FEN
- Three.js para cena 3D
- Dexie / IndexedDB para persistência local
- Stockfish local em Web Worker
- Vitest + RTL + Playwright para testes
- PWA com `vite-plugin-pwa`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
npm run test:e2e
```

## Escopo atual

- Partida contra IA local com níveis configuráveis
- HUD mobile-first com câmera, tema, idioma, save/load e análise
- Importação e exportação de PGN
- Persistência local de preferências, autosave e saves manuais
- Cena 3D low-poly com tabuleiro e peças
- Presets de câmera com modo 2D top-down
- PWA instalável e com foco em uso offline

## Observações

- O projeto já possui base funcional para o MVP.
