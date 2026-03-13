# Epic Brief — Pipo Chess 3d

## Resumo

O **Pipo Chess 3d** é um jogo de xadrez single-player contra o computador, pensado para rodar diretamente no navegador como uma experiência local, instalável e centrada no jogo contra IA. O produto busca combinar uma IA muito forte com uma apresentação imersiva, mantendo o tabuleiro como protagonista e a navegação simples em mobile e desktop.

O MVP (v1.0) inclui: partida completa contra IA com níveis ajustáveis (Iniciante a GM), dicas de jogada, desfazer/refazer, salvar e carregar partidas localmente em PGN, relógio configurável, análise pós-partida, temas visuais para tabuleiro e peças, um modo top-down/2D com transição suave a partir da visualização 3D e controles de animação (Normal, Reduzido e Desligado). A experiência do MVP também depende de feedback visual claro e animações fluidas para tornar jogadas da IA, capturas, transições e mudanças de estado imediatamente perceptíveis. A ambição de excelente performance em hardware mais limitado continua importante para o produto, mas não será tratada como meta rígida de aceite do MVP.

## Contexto & Problema

### Quem é afetado

Jogadores de xadrez de todos os níveis — de iniciantes curiosos a jogadores avançados — que buscam praticar contra uma IA forte diretamente no navegador, sem instalar aplicativos pesados ou depender de conexão com a internet.

### O problema atual

As soluções existentes para jogar xadrez contra o computador apresentam combinações de limitações:

- **Dependência de servidor:** A maioria dos apps fortes (Chess.com, Lichess) requer conexão constante para análise e partidas contra IA, inviabilizando uso offline.
- **Experiência visual pobre:** Apps que rodam offline geralmente oferecem interfaces 2D básicas, sem imersão.
- **Performance inconsistente:** Soluções 3D existentes frequentemente sofrem com baixo FPS em dispositivos mobile ou hardware modesto.
- **Acessibilidade de nível:** Muitas engines oferecem apenas "fácil" e "difícil" sem granularidade, frustrando jogadores de nível intermediário que não encontram desafio adequado.

### O que este Epic resolve

Pipo Chess 3d preenche esse espaço ao reunir, em um único produto local, três valores centrais:

1. **Praticar contra uma IA realmente forte** — com dificuldade ajustável para diferentes perfis de jogador.
2. **Ter uma experiência de tabuleiro imersiva, clara e expressiva** — com visual 3D protagonista, alternativa top-down/2D dentro do mesmo app e feedback visual/animações que deixem cada jogada facilmente perceptível.
3. **Jogar, retomar e analisar partidas no próprio dispositivo** — sem depender de serviços externos para a experiência principal.
