const { google } = require('googleapis');
const { authorize } = require('./google-auth');
const config = require('./config');

let authClient;

async function getAuthClient() {
  if (!authClient) {
    authClient = await authorize();
  }
  return authClient;
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
  if (config.dryRun) {
    console.log('[DRY_RUN] Evento Google Calendar:', toCalendarEvent(appointment));
    return null;
  }

  const auth = await getAuthClient();
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

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
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
