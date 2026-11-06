# Wildhaven Hex Factory — Alpha 0.4 | entrega incremental auditável

## Implementado nesta etapa

- Terreno observável de **10.000 metros de ponta a ponta**, com coordenadas métricas e setores de 1.000 m recortados geometricamente para o limite hexagonal.
- `geography-core.js`: DNA geográfico por região Auralis, relevo determinístico independente da seed artística, múltiplas zonas de biomas derivados da composição original, máscaras de fronteira e ruído multiescala.
- Traçado de curso de água pelo gradiente descendente real do relevo local, perfil de água estritamente decrescente e escavação do leito; sem rio se não houver drenagem plausível ou não existir água na região.
- Biblioteca procedural mid-poly com espécies arbóreas de geometria distinta, agrupamento ecológico e instancing; rochas de formas variadas e margens rochosas.
- Lagoas com leito escavado e água própria, apenas onde os dados macro-regionais permitem.
- Ferramentas de pincel no navegador: elevar, abaixar, achatar, suavizar, plantar/remover árvore e adicionar pedra; Shift+clique, desfazer (Ctrl+Z), limpar edições e salvar no JSON do projeto.
- Diagnóstico da área ocupada por árvores e rochas (não apenas pelo centro), aprovação apenas local, e testes de regressão.
- O Bosque das Cascatas em GLB continua preservado como referência e a Alpha 0.1 do jogo não foi alterada.

## Limitações que não devem ser chamadas de concluídas

- A distribuição de biomas dentro dos 10 km é **inferida de proporções e condições da macrorregião**, não reamostrada de dados climáticos de resolução métrica; a geografia original não permite essa precisão.
- O cálculo de rios segue a descida local, mas a continuidade rigorosa de **portais entre hexágonos adjacentes** ainda exige dados finos de entradas/saídas compartilhadas. Um rio poderá terminar em um vale local.
- O terreno já é dividido em malhas de 1 km, mas o **streaming / LOD dinâmico** ainda precisa de um gerenciador de setores assíncrono e testes de bordas entre LODs.
- O editor usa regeneração da cena a cada pincelada, não atualização incremental de GPU; operações grandes podem bloquear momentaneamente a interface.
- Esta atualização prioriza coerência geométrica e consistência dos cenários: fidelidade artística perfeita à referência aprovada, sistema completo de cavernas, fauna, erosão numérica, efeitos avançados e iluminação local ainda requerem trabalho.
- A aprovação local não grava o arquivo no GitHub ou sincroniza entre dispositivos.

## Testes

`npm install && npm run test && npm run build`

`test-geography.mjs` verifica metros, limites, hidrologia downhill, multi-bioma, determinismo e arquétipos. `test-generator.mjs` valida a existência das malhas e instâncias, espécies diversas, ausência de construções automáticas e footprint das árvores/pedras.

## Arquivos principais

- `geography-core.js` — geografia pura testável sem WebGL.
- `procedural.js` — malhas mid-poly, água e ecossistemas.
- `src.js` — interface Three.js, editor e exportação.
- `index.html`, `style.css` — visual e pincéis.
- `test-geography.mjs`, `test-generator.mjs` — testes.

## Próximos passos técnicos

Portais de fronteira compartilhados; geração e renderização por setor com Web Worker e LOD contínuo; seleção e movimentação direta de props; raster geográfico de resolução maior; validação visual comparativa automática; acabamento artístico do Bosque das Cascatas.