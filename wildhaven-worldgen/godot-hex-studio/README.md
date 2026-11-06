# Wildhaven Hex Studio — Godot 4 — Alpha 0.1

**Aplicativo independente para inspecionar, construir visualizações provisórias e aprovar hexágonos 3D de Auralis.** Não integra nada à Alpha 0.1 do Wildhaven.

## Como abrir no Windows

1. Instale **Godot 4.3 ou mais recente** (versão padrão, não é necessário .NET).
2. Extraia este ZIP.
3. Abra o Godot, clique em **Importar**, selecione a pasta do estúdio e o arquivo `project.godot`.
4. Abra o projeto e execute com **F6** (cena) ou **F5** (projeto inteiro).
5. Selecione `H_5_7` e clique em **Abrir região 3D** para ver a malha real do Bosque das Cascatas.

O pacote tem um **snapshot fiel das classes de bioma dominante dos 368 hexágonos** e um GLB real de `H_5_7`. Para usar os **dados geográficos completos** (altitude, rios, biomas mistos, atlas raster), use a preparação abaixo no clone do GitHub.

## Clonar do repositório e obter os dados completos

O projeto será versionado em `wildhaven-worldgen/godot-hex-studio/`, dentro de uma branch independente no repositório `carioca1111/chat-`.

Na pasta `wildhaven-worldgen/godot-hex-studio`, execute:

```powershell
python -m pip install brotli
python tools/prepare_assets.py
```

O script copia **somente** arquivos de `../outputs/` para `data/` e extrai o GLB já criado em `../hex-scenes/H_5_7/`. Os arquivos oficiais do mundo continuam inalterados. A cópia de `data/regions.json` é ignorada no Git; o atlas compacto permanece como fallback.

A branch pode receber versões mais novas do GLB. O pacote ZIP standalone contém o modelo local de **73.950 triângulos**; no repositório, `prepare_assets.py` extrai a versão atualizada da branch (se disponível).

## Funcionalidades implementadas

- Atlas com **368 hexágonos**, seleção por clique, zoom e arrasto.
- Visualização cartográfica em cores de bioma e destaque de `H_5_7`.
- Visualização do **modelo GLB real** de `H_5_7` em Godot 4, câmera orbital, pan e zoom.
- Prévia de outros hexágonos por **malhas procedurais simplificadas**, sem confundi-las com cenários completos.
- Vegetação simples instanciada por `MultiMesh` nas prévias.
- Importar modelo GLB ou glTF externo.
- Exportar malha da cena atual como GLB por `GLTFDocument`.
- Estados `pendente`, `em desenvolvimento` e `concluído`, com **brilho somente quando aprovado**.
- Salvar status local em `user://wildhaven_hex_studio_progress.json` e exportar JSON para outros sistemas.
- Interface escura com painel de catálogo, atlas, visualização 3D e inspetor.

## Controles

**Atlas:** arrastar para deslocar; roda do mouse para zoom; clique para selecionar.

**Cenário 3D:** botão esquerdo + arrastar para orbitar; botão direito + arrastar para deslocar; roda do mouse para zoom.

## Contrato de escala

- Geografia de Auralis continua com **6.400 × 8.000 km**, 368 hexágonos, raio geográfico de 240 km.
- Cada cena observável é uma **representação condensada de 2 km de ponta a ponta**.
- A prévia procedural é apenas um espaço cênico de inspeção; não implementa ainda as condições detalhadas, os rios e a geomorfologia de cada região.
- Não são criados NPCs, colisões de gameplay, simulação animal ou travessia entre regiões nesta Alpha.

## Estrutura

```text
project.godot
scenes/studio.tscn
scripts/studio.gd         interface e estados
scripts/atlas_view.gd     368 hexágonos e destaque de progresso
scripts/preview_3d.gd     visualizador 3D, carregamento GLB e prévia
assets/H_5_7_forest.glb  primeira cena 3D (pacote ZIP; no Git via prepare_assets.py)
data/regions_snapshot.json  snapshot de classificação oficial
 data/progress.json       estado inicial (não aprovado)
tools/prepare_assets.py  importa dados do Codex sem alterar o original
tools/make_snapshot.py   reconstrói o atlas compacto de referência
```

## Limites honestos da Alpha

- **Ainda não é uma fábrica automática de hexágonos acabados**: gerar prévia é diferente de gerar uma paisagem final de qualidade aprovada.
- O editor não oferece ainda escultura do terreno com pincel, biblioteca editável de assets, atualização por chunks ou renderização de todos os dados climáticos no 3D.
- O `H_5_7` permanece **em desenvolvimento**, nunca concluído automaticamente.
- O visualizador está preparado para abrir GLBs, mas a exportação de modelos importados pode precisar de ajustes conforme materiais e extensões glTF usadas.
- **Não foi possível executar testes no próprio Godot neste ambiente** porque a engine Godot não está instalada; os scripts devem ser abertos e conferidos no Godot 4. Os dados e a estrutura dos arquivos são validados separadamente por testes Python.

## Próxima versão

Implementar módulo de biblioteca de malhas mid-poly, camada de rochas de margens/escarpas orientada por declividade, cachoeiras e ferramentas de posicionamento manual em 3D; preservar o padrão visual aprovado.