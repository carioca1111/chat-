# Gridium 2 Alpha 1.2.1

Hotfix do fluxo **Instalar e reiniciar**.

- remove o PowerShell oculto da etapa de aplicação;
- usa bootstrap CMD independente do processo Electron;
- espera o Gridium encerrar antes de iniciar o NSIS;
- usa `--updated` e preserva o diretório atual;
- se a instalação silenciosa falhar, abre o instalador normal visível;
- relança o Gridium e mantém a confirmação pós-reinício.
