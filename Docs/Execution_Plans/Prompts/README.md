# Prompts de execucao por fase

Use estes prompts quando o agente que vai executar o ticket tiver acesso direto ao workspace deste repositorio.

## Quando referenciar arquivos e melhor do que colar

Referenciar arquivos e melhor quando:

- o agente consegue ler arquivos locais do workspace
- voce quer evitar divergencia entre o prompt e a versao atual dos docs
- os specs e tickets sao longos e mudam ao longo do projeto

Colar o conteudo so e melhor quando o agente externo nao consegue abrir arquivos locais.

## Como usar

1. Abra o prompt da fase desejada nesta pasta.
2. Cole o prompt no agente executor sem reescrever o texto.
3. Se o agente nao tiver acesso ao workspace, troque os caminhos por conteudo colado.
4. Mantenha `Docs/Execution_Plans/EXECUTION_PROTOCOL.md` como regra global de execucao.
5. So avance para o prompt seguinte depois de validar o gate de saida do ticket anterior.

## Ordem recomendada

1. `PROMPT_01_Alinhar_tematizacao_board_3d.md`
2. `PROMPT_02_Housekeeping_ChessStage.md`
3. `PROMPT_03_Interatividade_ChessStage.md`
4. `PROMPT_04_Sistema_de_animacoes_canvas_3d.md`
5. `PROMPT_05_Presets_de_camera_e_modo_2d.md`
6. `PROMPT_06_UI_glassmorphism_mobile_first.md`
7. `PROMPT_07_Integracao_final_testes_e_limpeza.md`

## Prompts complementares

1. `PROMPT_08_Fix_pointer_events_overlays.md`
