# Automacao WhatsApp -> Planilha -> Google Calendar

Esta automacao monitora o chat em que voce envia mensagens para si mesmo no WhatsApp. Quando uma mensagem parece ser um agendamento de atividade, ela:

1. interpreta titulo, data, horario, local e observacoes;
2. registra em um arquivo Excel local (`agendamentos.xlsx`);
3. opcionalmente registra em uma planilha online do Google Sheets;
4. opcionalmente cria um evento no Google Calendar.

Ela tambem pode ler sua agenda pessoal em uma planilha do Google Drive e enviar uma mensagem para voce mesmo no WhatsApp 15 minutos antes de cada compromisso.

## Exemplos de mensagens no WhatsApp

Envie mensagens para voce mesmo em formatos como:

```text
Reuniao com equipe dia 22/07 as 15h no escritorio
```

```text
Visita missionaria amanha 19:30 na casa da Ana. Levar materiais.
```

```text
Culto jovem sexta as 20h na igreja central
```

## Como configurar

### 1. Instalar dependencias

```bash
npm install
```

### 2. Criar o arquivo `.env`

Copie `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

Campos principais:

- `WHATSAPP_SELF_CHAT_NAME`: nome do chat do seu proprio perfil no WhatsApp. Pode aparecer como `Voce`, `You` ou seu nome.
- `OPENAI_API_KEY`: recomendado para interpretar mensagens livres com mais inteligencia.
- `GOOGLE_SPREADSHEET_ID`: id da planilha online do Google Sheets, se quiser gravar online.
- `GOOGLE_CALENDAR_ID`: use `primary` para calendario principal.
- `AGENDA_REMINDER_ENABLED`: use `true` para ativar os lembretes lidos da agenda pessoal.
- `AGENDA_REMINDER_MINUTES_BEFORE`: quantos minutos antes do compromisso o WhatsApp deve avisar.
- `AGENDA_REMINDER_SHEET_RANGE`: area da planilha lida em cada aba. O padrao `A1:ZZ80` cobre o planner semanal.

Para o link abaixo, o id da planilha e o trecho entre `/d/` e `/edit`:

```text
1lo0Nd_6eFMsUxgY5gCq3eZjjnSy0OJe1
```

### 3. Configurar Google Calendar e Google Sheets

No Google Cloud Console:

1. crie um projeto;
2. ative as APIs **Google Calendar API** e **Google Sheets API**;
3. crie uma credencial OAuth do tipo **Desktop app**;
4. baixe o JSON e salve na raiz deste projeto com o nome `credentials.json`.

Depois rode:

```bash
npm run google:auth
```

O terminal vai mostrar um link. Abra, autorize sua conta Google, copie o codigo retornado e cole no terminal. Isso cria o arquivo `token.json`.

### 4. Rodar a automacao

```bash
npm start
```

Na primeira execucao, vai aparecer um QR Code no terminal. Escaneie com o WhatsApp.

Depois disso, envie uma mensagem de agendamento para voce mesmo no WhatsApp. A automacao vai registrar na planilha e no calendario.

## Observacoes importantes

- Esta automacao usa WhatsApp Web. Ela precisa que a sessao continue conectada.
- Para ler a agenda no Google Drive, compartilhe a planilha com o e-mail `client_email` do arquivo `service-account.json`.
- A planilha pode ficar no formato de planner semanal: uma coluna `SCHEDULES` com horarios e sete colunas ao lado com os dias. A automacao tambem entende itens que comecam com horario especifico, como `8h45 - CARDIOLOGISTA`.
- Cada lembrete enviado fica registrado em `agenda-reminders-sent.json`, para evitar mensagem duplicada.
- O WhatsApp nao oferece uma API oficial simples para ler mensagens pessoais. Para uso empresarial/oficial, o caminho correto e a WhatsApp Business Cloud API, mas ela nao le mensagens do seu perfil pessoal.
- Se `OPENAI_API_KEY` estiver vazio, o sistema tenta interpretar com regras simples. Para mensagens naturais em portugues, a chave da OpenAI melhora bastante o resultado.
- Se `DRY_RUN=true`, nada e criado no Google; a automacao apenas mostra o que entendeu.
