# Wildhaven Hex Factory — Alpha 0.4

Editor de cenários 3D mid-poly **no navegador**, isolado da Alpha 0.1 do jogo. O atlas é o continente Auralis original gerado pelo Codex; cada hexágono observável representa 10 km de ponta a ponta, sem reescrever o mundo.

## O que mudou na 0.4

- DNA geográfico determinístico por macrorregião (relevo, biomas, hidrologia e perfil ecológico).
- Relevo com macroformas distintas e malhas recortadas no hexágono, organizadas em setores de 1 km.
- Mistura de biomas por zonas ecológicas internas quando presentes nos dados geográficos.
- Rios opcionais traçados pela inclinação descendente do terreno, leitos escavados e margens rochosas; lagoas condicionadas a dados de lagos.
- Árvores mid-poly de espécies e silhuetas diferentes (geometria própria), com InstancedMesh, clareiras e agrupamentos; rochas com variações e footprint validado.
- Nenhuma ponte, ruína ou construção é gerada obrigatoriamente.
- Pincéis 3D: Shift + clique, selecionar elevar/abaixar/achatar/suavizar/plantar/remover árvores/adicionar rochas, Ctrl+Z e limpar pinceladas.
- Exportar GLB e importar/exportar projeto JSON; aprovações são locais ao navegador.
- Modelagem GLB original do Bosque das Cascatas preservada no botão de referência.

## Como usar

Abra o ateliê web, selecione uma macrorregião, ajuste seed/densidade/relevo e clique em **Gerar paisagem 3D**. Para uma edição, selecione o pincel e use **Shift + clique** no terreno; a malha é regenerada. Salve em JSON para preservar em outro navegador.

## Desenvolvimento

```bash
npm install
npm run test
npm run dev
npm run build
```

A compilação com Vite usa os arquivos geográficos de `../outputs/` por `copy-assets.mjs`. O repositório mantém o Bosque original compactado em `../hex-scenes/H_5_7/forest-temperate.glb.br`.

## Limites atuais

A distribuição local de biomas ainda é inferida das proporções globais, pois o raster de Auralis é mais grosseiro que a escala da cena. Rios downhill e setores não equivalem à conclusão do sistema de conexões entre macrorregiões nem a streaming/LOD dinâmico. Pincéis usam regeneração integral da cena. A fidelidade artística à imagem aprovada precisa de avaliação visual. Ver [ENTREGA-HEX-FACTORY-ALPHA04.md](./ENTREGA-HEX-FACTORY-ALPHA04.md) para um relatório completo.

O jogo Wildhaven Alpha 0.1 não foi modificado.