# ENTREGA PARA O CHATGPT — CONTINUAÇÃO DO WILDHAVEN

Repositório: https://github.com/carioca1111/chat-

Branch: [`codex/wildhaven-worldgen`](https://github.com/carioca1111/chat-/tree/codex/wildhaven-worldgen)

Diretório independente: [`wildhaven-worldgen/`](https://github.com/carioca1111/chat-/tree/codex/wildhaven-worldgen/wildhaven-worldgen)

O SHA exato desta entrega é informado na mensagem final do Codex. Para obter o SHA do checkout: `git rev-parse HEAD`. Para conferir os artefatos independentemente do Git, use os SHA-256 de `outputs/manifest.json` e o fingerprint numérico de `outputs/world.json`.

## Revisão 2 — litoral, clima e relevo erodido

A seed-mãe permanece **20051028**, com `revision: 2`. O litoral usa deformação contínua de coordenadas e fraturas em várias escalas, sem recorte por latitude que produza uma praia horizontal artificial. Uma massa continental deve conservar pelo menos **97% da área terrestre**; o restante pode formar pequenas ilhas costeiras. O Deserto Rochoso é limitado a **16% da terra sem água** pela aceitação, mantendo a classificação por ambiente. Consultar `outputs/validation-report.json` para as medidas efetivamente obtidas.

O continente antigo recebe iterações reais de incisão fluvial, transporte de encosta, deposição e relaxação de talude. A drenagem é recalculada durante a evolução, e o vulcão mais jovem é acrescentado depois dessa etapa. Os parâmetros `model_years` descrevem exposição no modelo; **não são uma idade geológica real calibrada**.

A grade bruta continental continua em **5 km**. A inspeção continental passa a **614 × 768 amostras / 940.342 triângulos**, cerca de **5,78×** a revisão anterior. Um recorte independente de **64 × 64 km**, com **512 × 512 amostras / 125 m / 522.242 triângulos**, permite inspecionar as montanhas de perto. O botão **Montanhas · detalhe de erosão** abre esse recorte; **Voltar ao continente** ou **H** retorna ao atlas. O exagero vertical inicial, indicado na interface, é **40× no continente e 2× no detalhe local**.

## Arquivos para abrir primeiro

Os caminhos são completos a partir da raiz do repositório:

| Caminho | Uso |
|---|---|
| `wildhaven-worldgen/README.md` | Documentação do algoritmo, formatos, comandos, coordenadas e limites |
| `wildhaven-worldgen/config.json` | Seed 20051028 e parâmetros oficiais |
| `wildhaven-worldgen/outputs/world.json` | Entrada principal do formato; campos, unidades e hashes |
| `wildhaven-worldgen/outputs/regions.json` | Hexágonos e conexões |
| `wildhaven-worldgen/outputs/heightmap.png` | Altura uint16; metros = valor×0,25−6000 |
| `wildhaven-worldgen/outputs/fields/elevation_m.npz` | Altura float32 autoritativa sem quantização; chave data |
| `wildhaven-worldgen/outputs/biomes-data.npy` | IDs uint8 dos 15 biomas; água ID0 |
| `wildhaven-worldgen/outputs/rivers.json` | Grafo hidrográfico, lagos e escoamento |
| `wildhaven-worldgen/outputs/special-locations.json` | Vulcão, ravina, saída da ravina e futura vila inicial |
| `wildhaven-worldgen/outputs/fields/` | Todos os campos numéricos continentais, NPZ/data |
| `wildhaven-worldgen/outputs/meshes/ravine/ravine.gltf` | Geometria complementar da ravina |
| `wildhaven-worldgen/outputs/meshes/ravine/ravine.bin` | Buffer do glTF; manter ao lado do arquivo glTF |
| `wildhaven-worldgen/outputs/meshes/ravine/ravine-metadata.json` | Transformação geográfica, aberturas, cursos locais e poças |
| `wildhaven-worldgen/outputs/meshes/ravine/ravine-heightmap.npy` | Recorte local de alta resolução |
| `wildhaven-worldgen/outputs/meshes/ravine/ravine-incision.npy` | Corte analítico local |
| `wildhaven-worldgen/outputs/meshes/ravine/ravine-flow-receiver.npz` | Drenagem local D8/data |
| `wildhaven-worldgen/outputs/meshes/ravine/ravine-flow-accumulation-km2.npz` | Área contribuinte local/data |
| `wildhaven-worldgen/outputs/meshes/mountains/metadata.json` | Extensão, origem sudoeste, resolução, estatísticas e parâmetros da evolução local |
| `wildhaven-worldgen/outputs/meshes/mountains/mountain.gltf` | Malha montanhosa aberta, com posições, normais e cores |
| `wildhaven-worldgen/outputs/meshes/mountains/mountain-0.bin` | Buffer da primeira parte da malha; manter ao lado do glTF |
| `wildhaven-worldgen/outputs/meshes/mountains/mountain-1.bin` | Buffer da segunda parte da malha |
| `wildhaven-worldgen/outputs/meshes/mountains/mountain-2.bin` | Buffer da terceira parte da malha |
| `wildhaven-worldgen/outputs/meshes/mountains/mountain-3.bin` | Buffer da quarta parte da malha |
| `wildhaven-worldgen/outputs/meshes/mountains/initial-heightmap.npy` | Relevo local float32 antes da evolução |
| `wildhaven-worldgen/outputs/meshes/mountains/heightmap.npy` | Relevo local float32 final, correspondente aos vértices glTF |
| `wildhaven-worldgen/outputs/meshes/mountains/geomorphic-erosion.npz` | Erosão local em metros, chave `data` |
| `wildhaven-worldgen/outputs/meshes/mountains/geomorphic-deposition.npz` | Deposição local em metros, chave `data` |
| `wildhaven-worldgen/outputs/meshes/mountains/mountain-viewer.json` | Manifest do recorte montanhoso com caminhos, dtypes e dimensões |
| `wildhaven-worldgen/outputs/meshes/mountains/viewer/` | Campos binários locais little-endian descritos no manifest |
| `wildhaven-worldgen/outputs/viewer-data.json` | Manifest da amostragem continental de inspeção |
| `wildhaven-worldgen/outputs/viewer/` | Campos continentais binários little-endian de inspeção |
| `wildhaven-worldgen/outputs/world-preview.png` | Atlas completo em alta resolução |
| `wildhaven-worldgen/outputs/renders/` | Atlas climático e vistas 3D do vulcão e da ravina |
| `wildhaven-worldgen/outputs/renders/mountain-detail.png` | Vista 3D do recorte montanhoso refinado |
| `wildhaven-worldgen/outputs/renders/erosion-comparison.png` | Relevo local antes/depois e alterações por erosão |
| `wildhaven-worldgen/outputs/validation-report.json` | Verificações efetivamente executadas, incluindo reprodução |
| `wildhaven-worldgen/viewer/index.html` | Visualizador de inspeção offline, servido por HTTP local |
| `wildhaven-worldgen/inspect_world.py` | Leitor independente; não importa o gerador |

## Reproduzir, validar e visualizar

```sh
git clone --branch codex/wildhaven-worldgen https://github.com/carioca1111/chat-.git
cd chat-/wildhaven-worldgen
python -m pip install -r requirements.txt
python generate.py
python -m unittest discover -s tests -v
python -m worldgen.validate outputs --reproduce
python inspect_world.py outputs
python -m http.server 8765 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8765/viewer/`. Para fixar exatamente a entrega, fazer checkout do SHA informado na mensagem final antes de gerar ou integrar.

## Contrato de integração

- Mundo: 6.400 × 8.000 km. Origem sudoeste; X leste, Y norte, Z altitude em metros. Linha 0 do raster fica no norte. Coordenadas climáticas são fictícias, sem EPSG terrestre.
- Raster continental: 1.600 × 1.280 `[linha,coluna]`, centros de pixels espaçados 5 km. Amostras são contínuas entre regiões; hexágonos são apenas um índice territorial.
- Campos NPZ: chave `data`; carregar com `numpy.load(...,allow_pickle=False)`. JSON identifica dtypes, dimensões, unidades e caminhos. Leitores não precisam executar `generate.py`.
- Os manifests `viewer-data.json` e `meshes/mountains/mountain-viewer.json` descrevem buffers binários com `path`, `dtype`, `count` e `byte_length`. Os caminhos são relativos a `outputs/`. Tipos little-endian: float32 para altura/clima, uint8 para cores/biomas/máscara e int32 para IDs de lagos. As linhas começam no norte; `biome_rgb` usa três componentes por amostra. Carregar, por exemplo, com `numpy.fromfile(caminho,dtype='<f4')` e aplicar `reshape(ny,nx)`.
- glTF da ravina: X leste, Y altura, Z sul; coordenadas locais relativas ao centro da fissura. Usar transformação de `ravine-metadata.json`, sem confundir Y vertical com Y norte dos JSON.
- glTF montanhoso: mesmos eixos, mas a origem local é o canto sudoeste do recorte. `metadata.json:mesh_origin_m=[x0,y0]`; converter por `x=X+x0`, `y=y0-Z`, `altitude=Y`. Os quatro buffers preservam as amostras e duplicam apenas os vértices das bordas de cada parte.
- Manter um único terreno global e recortar para streaming; não regenerar montanhas ou rios por hexágono. Bordas compartilhadas devem consultar a mesma superfície.
- O recorte da ravina **substitui** a superfície continental no seu interior. A malha contém buracos reais e cavernas; sobrepor um heightfield intacto tamparia as entradas.
- O recorte montanhoso de 125 m também substitui a área correspondente do raster de 5 km, com bordas mantidas fixas durante a evolução local. Evitar superfícies sobrepostas. Sua resolução não é a resolução de todo o continente.
- A relação local `altura_final = altura_inicial − erosão + deposição` é verificada contra os campos exportados. O validador também abre os quatro buffers glTF e confronta as alturas dos vértices com o heightmap.
- O canal de saída da ravina é uma incisão geográfica e pode cruzar hexágonos; a fissura principal permanece dentro de uma região tropical. Os cursos locais são descendentes e alcançam confluências, limites do recorte ou depressões locais identificadas nos metadados.
- As trajetórias de fluxo no interior dos lagos preservam a conectividade numérica, mas ficam ocultas nas imagens e no visualizador porque representam escoamento sob uma superfície de água parada.
- A vila é apenas uma reserva de terreno temperado plano com água, sem construções ou lógica de gameplay.

Não integrar automaticamente à Alpha 0.1 nem alterar gameplay. Próximas etapas possíveis: conversão de unidades/LOD/origem flutuante, materiais finais, colisão e navegação, revisão da escala jogável e vegetação individual. Os materiais de inspeção separam rocha, neve e vegetação por condições do terreno. Clima, geologia e erosão são aproximações declaradas; os dados são a entrega reproduzível de referência, não uma simulação científica calibrada nem um cenário de gameplay finalizado.
