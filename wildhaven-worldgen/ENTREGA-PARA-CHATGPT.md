# ENTREGA PARA O CHATGPT — CONTINUAÇÃO DO WILDHAVEN

Repositório: https://github.com/carioca1111/chat-

Branch: [`codex/wildhaven-worldgen`](https://github.com/carioca1111/chat-/tree/codex/wildhaven-worldgen)

Diretório independente: [`wildhaven-worldgen/`](https://github.com/carioca1111/chat-/tree/codex/wildhaven-worldgen/wildhaven-worldgen)

O SHA exato desta entrega é informado na mensagem final do Codex. Para obter o SHA do checkout: `git rev-parse HEAD`. Para conferir os artefatos independentemente do Git, use os SHA-256 de `outputs/manifest.json` e o fingerprint numérico de `outputs/world.json`.

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
| `wildhaven-worldgen/outputs/world-preview.png` | Atlas completo em alta resolução |
| `wildhaven-worldgen/outputs/renders/` | Atlas climático e vistas 3D do vulcão e da ravina |
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

- Mundo: 6.400×8.000 km. Origem sudoeste; X leste, Y norte, Z altitude em metros. Linha0 do raster fica no norte. Coordenadas climáticas são fictícias, sem EPSG terrestre.
- Raster continental: 1.600×1.280 `[linha,coluna]`, centros de pixels espaçados5km. Amostras são contínuas entre regiões; hexágonos são apenas um índice territorial.
- Campos NPZ: chave `data`; carregar com `numpy.load(...,allow_pickle=False)`. JSON identifica dtypes, dimensões, unidades e caminhos. Leitores não precisam executar `generate.py`.
- glTF: X leste, Y altura, Z sul; coordenadas locais relativas ao centro da ravina. Usar transformação de `ravine-metadata.json`, sem confundir Y vertical com Y norte dos JSON.
- Manter um único terreno global e recortar para streaming; não regenerar montanhas ou rios por hexágono. Bordas compartilhadas devem consultar a mesma superfície.
- O recorte da ravina **substitui** a superfície continental no seu interior. A malha contém buracos reais e cavernas; sobrepor um heightfield intacto tamparia as entradas.
- O canal de saída da ravina é uma incisão geográfica e pode cruzar hexágonos; a fissura principal permanece dentro de uma região tropical. Os cursos locais são descendentes e terminam em confluências ou poças reais.
- As trajetórias de fluxo no interior dos lagos preservam a conectividade numérica, mas ficam ocultas nas imagens e no visualizador porque representam escoamento sob uma superfície de água parada.
- A vila é apenas uma reserva de terreno temperado plano com água, sem construções ou lógica de gameplay.

Não integrar automaticamente à Alpha0.1 nem alterar gameplay. Próximas etapas possíveis: conversão de unidades/LOD/origem flutuante, materiais, colisão e navegação, revisão da escala jogável e vegetação individual. Clima, geologia e erosão são aproximações declaradas; os dados são a entrega reproduzível de referência, não uma simulação científica calibrada nem um cenário de gameplay finalizado.
