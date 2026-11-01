# DBO Dev Bridge Alpha 0.1

Ferramenta Windows para testar o DBO Rox/TFS localmente mesmo quando a operadora usa CGNAT ou não permite abrir portas.

## O que esta Alpha faz

- conecta por WebSocket seguro ao relay público no Render;
- não exige port-forward no modem;
- encaminha conexões WSS do navegador para `127.0.0.1:7172` no PC;
- gera um `deviceId` e um segredo aleatório localmente no primeiro uso;
- monitora porta 7172, processo TFS e RAM do PC;
- permite selecionar e iniciar/parar o executável local do DBO/TFS;
- mostra logs do processo e URLs de diagnóstico/túnel;
- limita o relay a 4 clientes simultâneos por dispositivo nesta Alpha.

## Segurança

O segredo do dispositivo é criado no PC e salvo apenas nas configurações locais do aplicativo. Ele não é versionado no GitHub. O relay faz pareamento do dispositivo usando esse segredo e o tráfego externo usa WSS/HTTPS.

## Limitação da Alpha 0.1

O aplicativo ainda não instala automaticamente MariaDB nem baixa/prepara o pacote completo do DBO Rox no Windows. Nesta fase ele gerencia e expõe um TFS local já preparado. A próxima etapa é adicionar o bootstrap do servidor/banco para transformar o fluxo em um botão único.

## Relay

O serviço `dbo-dev-relay` fornece `/health`, `/status`, `/agent` e `/game`. O PC usa `/agent`; o cliente web usa `/game` com o mesmo `deviceId` e segredo.
