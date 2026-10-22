# Gridium 2 Alpha 1.0 — WhatsApp Daily

## Objetivo

Enviar um Daily Report das quatro contas do Gridium diretamente pelo WhatsApp, usando a WhatsApp Business Cloud API da Meta.

## Configuração no Gridium

Abra **Configurações → WhatsApp Daily Report** e informe:

- Número destino com DDI e DDD, apenas dígitos. Ex.: `5521999999999`.
- Phone Number ID da WhatsApp Business Cloud API.
- Access Token permanente da Meta. O Gridium salva o token usando `safeStorage` do Electron; ele não é devolvido ao renderer depois de salvo.
- Horário diário no fuso `America/Sao_Paulo`.
- Template do Daily Report, padrão `gridium_daily_report`.
- Template de alertas, padrão `gridium_alert`.
- Idioma do template, padrão `pt_BR`.

## Templates sugeridos

### gridium_daily_report

Corpo:

```text
📊 Gridium Daily Report
{{1}}
```

### gridium_alert

Corpo:

```text
🚨 Gridium Alert
{{1}}
```

Os templates precisam ser aprovados pela Meta para envios proativos fora da janela de atendimento de 24 horas. O destinatário também deve ter autorizado o recebimento das mensagens.

## Dados do relatório

O relatório usa apenas dados confirmados pelo Gridium:

- XP do Pokémon por conta e total.
- Capturas totais.
- Capturas P1, P2, P3, P4 e P5.
- Capturas com nota oficial maior ou igual a 3,5.
- Shinies capturados.
- Drops raros confirmados pelo aumento do inventário.
- Gold ganho por aumento real de saldo.
- Ranking de melhor conta em XP, capturas e Gold.

O relatório não inventa kills ou shinies vistos quando o protocolo não fornece confirmação suficiente.

## Persistência

O Gridium salva um baseline por conta. O relatório diário calcula a diferença entre o baseline anterior e o estado atual, então reiniciar o app não zera a contabilidade. Períodos em que o PC esteve desligado não são estimados.

## Alertas opcionais

- Shiny capturado.
- P5 capturado.

Ao iniciar o Gridium, eventos antigos já presentes no histórico são marcados como conhecidos para evitar reenvio de notificações antigas.

## Segurança

- Cloud API fixa na Graph API v26.0 para esta release.
- Token criptografado via Electron `safeStorage` quando disponível.
- O token nunca é incluído no snapshot enviado ao renderer.
- A interface recebe apenas `tokenConfigured: true/false`.
