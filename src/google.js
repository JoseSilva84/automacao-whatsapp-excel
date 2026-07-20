const { google } = require('googleapis');
const { authorize, authorizeServiceAccount } = require('./google-auth');
const config = require('./config');

let calendarAuthClient;
let sheetsAuthClient;

async function getCalendarAuthClient() {
  if (!calendarAuthClient) {
    calendarAuthClient = await authorize();
  }
  return calendarAuthClient;
}

async function getSheetsAuthClient() {
  if (!sheetsAuthClient) {
    sheetsAuthClient = await authorizeServiceAccount();
  }
  return sheetsAuthClient;
}

function toCalendarEvent(appointment) {
  return {
    summary: appointment.title,
    location: appointment.location || undefined,
    description: [
      appointment.notes ? `Observacoes: ${appointment.notes}` : '',
      `Origem: WhatsApp`,
      `Mensagem original: ${appointment.originalText}`
    ].filter(Boolean).join('\n'),
    start: {
      dateTime: appointment.start,
      timeZone: config.timezone
    },
    end: {
      dateTime: appointment.end,
      timeZone: config.timezone
    }
  };
}

async function createCalendarEvent(appointment) {
  if (!config.googleCalendarEnabled) return null;

  if (config.dryRun) {
    console.log('[DRY_RUN] Evento Google Calendar:', toCalendarEvent(appointment));
    return null;
  }

  const auth = await getCalendarAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.events.insert({
    calendarId: config.googleCalendarId,
    requestBody: toCalendarEvent(appointment)
  });

  return response.data;
}

async function appendToGoogleSheet(appointment) {
  if (!config.googleSpreadsheetId) return null;

  const values = [[
    new Date().toISOString(),
    appointment.title,
    appointment.start,
    appointment.end,
    appointment.location || '',
    appointment.notes || '',
    appointment.originalText
  ]];

  if (config.dryRun) {
    console.log('[DRY_RUN] Linha Google Sheets:', values[0]);
    return null;
  }

  const auth = await getSheetsAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  await ensureSheetExists(sheets);
  await ensureSheetHeader(sheets);

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSpreadsheetId,
    range: `${config.googleSheetName}!A:G`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });

  return response.data;
}

async function ensureSheetExists(sheets) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSpreadsheetId,
    fields: 'sheets.properties.title'
  });

  const exists = spreadsheet.data.sheets?.some(
    (sheet) => sheet.properties?.title === config.googleSheetName
  );

  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.googleSpreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: config.googleSheetName
            }
          }
        }
      ]
    }
  });
}

async function ensureSheetHeader(sheets) {
  const range = `${config.googleSheetName}!A1:G1`;
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSpreadsheetId,
    range
  }).catch(() => null);

  if (current?.data?.values?.length) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSpreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'Registrado em',
        'Titulo',
        'Inicio',
        'Fim',
        'Local',
        'Observacoes',
        'Mensagem original'
      ]]
    }
  });
}

module.exports = { createCalendarEvent, appendToGoogleSheet };
