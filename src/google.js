const { google } = require('googleapis');
const { authorize, authorizeServiceAccount } = require('./google-auth');
const config = require('./config');
const ExcelJS = require('exceljs');

let calendarAuthClient;
let sheetsAuthClient;
let driveAuthClient;

const sheetHeaders = ['Evento', 'Data', 'Horario', 'Local'];

function formatBrazilDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value));
}

function formatBrazilTime(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

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

async function getDriveAuthClient() {
  if (!driveAuthClient) {
    driveAuthClient = await authorizeServiceAccount([
      'https://www.googleapis.com/auth/drive.readonly'
    ]);
  }
  return driveAuthClient;
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
    appointment.title,
    formatBrazilDate(appointment.start),
    formatBrazilTime(appointment.start),
    appointment.location || ''
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
    range: `${config.googleSheetName}!A:D`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });

  return response.data;
}

async function readSpreadsheetValues(range = config.agendaReminderSheetRange) {
  if (!config.googleSpreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID nao configurado.');
  }

  try {
    return await readNativeGoogleSpreadsheetValues(range);
  } catch (error) {
    if (!isOfficeFileError(error)) throw error;

    console.log('Arquivo no Drive esta em formato Excel. Lendo .xlsx pelo Google Drive.');
    return readOfficeSpreadsheetValuesFromDrive();
  }
}

async function readNativeGoogleSpreadsheetValues(range) {
  const auth = await getSheetsAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSpreadsheetId,
    fields: 'sheets.properties.title'
  });

  const sheetTitles = spreadsheet.data.sheets
    ?.map((sheet) => sheet.properties?.title)
    .filter(Boolean) || [];

  const worksheets = [];
  for (const title of sheetTitles) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSpreadsheetId,
      range: `'${String(title).replace(/'/g, "''")}'!${range}`,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    }).catch((error) => {
      console.warn(`Nao foi possivel ler a aba "${title}":`, error.message);
      return null;
    });

    worksheets.push({
      title,
      rows: response?.data?.values || []
    });
  }

  return worksheets;
}

async function readOfficeSpreadsheetValuesFromDrive() {
  const auth = await getDriveAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const response = await drive.files.get(
    {
      fileId: config.googleSpreadsheetId,
      alt: 'media'
    },
    {
      responseType: 'arraybuffer'
    }
  );

  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.from(response.data);
  await workbook.xlsx.load(buffer);

  return workbook.worksheets.map((worksheet) => ({
    title: worksheet.name,
    rows: worksheetToRows(worksheet)
  }));
}

function worksheetToRows(worksheet) {
  const maxRow = Math.min(worksheet.rowCount, 80);
  const maxColumn = worksheet.columnCount;
  const rows = [];

  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = [];

    for (let columnNumber = 1; columnNumber <= maxColumn; columnNumber += 1) {
      values.push(row.getCell(columnNumber).value);
    }

    rows.push(values);
  }

  return rows;
}

function isOfficeFileError(error) {
  return error?.errors?.some((item) => item.reason === 'failedPrecondition')
    || String(error?.message || '').includes('must not be an Office file');
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
  const range = `${config.googleSheetName}!A1:D1`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSpreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [sheetHeaders]
    }
  });
}

module.exports = { createCalendarEvent, appendToGoogleSheet, readSpreadsheetValues };
