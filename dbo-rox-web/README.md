# DBO Rox V2 8.60 — Browser Bootstrap

Esta branch volta para a estratégia original do projeto: usar uma base Dragon Ball OT pronta e modificar por cima.

Base selecionada: **DBO Rox V2 8.60**.

No build, este diretório baixa os pacotes diretamente dos links comunitários originais (MediaFire), em vez de duplicar os arquivos de terceiros dentro do GitHub:

- cliente OTClient DBO Rox;
- servidor DBO Rox;
- sources;
- database.

O cliente é extraído e empacotado em `dist/dbo-rox-game-data.zip`, formato que pode ser instalado pela versão modular do OTClient Redemption Web.

## Render

Build command:

```bash
cd dbo-rox-web && npm install && npm run build
```

Start command:

```bash
cd dbo-rox-web && npm start
```

A raiz do serviço mostra um botão **ABRIR CLIENTE DBO NO NAVEGADOR** e disponibiliza o ZIP com CORS apenas para `https://webclient.otarchive.com`.

## Estado atual

1. Base DBO pronta: selecionada.
2. Cliente/servidor/source/database: baixados e validados a cada build.
3. Cliente DBO: empacotado para OTClient Web modular.
4. Próximo passo: adaptar os módulos do cliente para Redemption Web e conectar a um servidor DBO próprio via WSS.
5. Depois: Idle Hunt server-authoritative e, mais tarde, Market/RMT.

## Origem

Tópico comunitário DBO Rox V2 8.60 no TibiaKing e cliente DBO Rox publicado pela comunidade. Os arquivos de terceiros não são versionados nesta branch; são obtidos da origem no build.
