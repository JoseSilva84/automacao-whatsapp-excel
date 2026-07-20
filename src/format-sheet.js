require('dotenv').config();

const { google } = require('googleapis');
const { authorizeServiceAccount } = require('./google-auth');
const config = require('./config');

const headers = ['Evento', 'Data', 'Horario', 'Local'];

function formatBrazilDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function formatBrazilTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

async function main() {
  if (!config.googleSpreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID nao configurado.');
  }

  const auth = await authorizeServiceAccount();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSpreadsheetId,
    fields: 'sheets.properties'
  });

  const sheet = spreadsheet.data.sheets?.find(
    (item) => item.properties?.title === config.googleSheetName
  );

  if (!sheet?.properties?.sheetId) {
    throw new Error(`Aba "${config.googleSheetName}" nao encontrada.`);
  }

  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSpreadsheetId,
    range: `${config.googleSheetName}!A:G`
  }).catch(() => null);

  const rows = current?.data?.values || [];
  const oldSevenColumnFormat = rows[0]?.[2] === 'Inicio';
  const eventDateFormat = rows[0]?.[0] === 'Data do Evento';
  const formattedRows = rows.slice(1).map((row) => {
    if (oldSevenColumnFormat) {
      const start = row[2] || row[0];
      return [
        row[1] || '',
        formatBrazilDate(start),
        formatBrazilTime(start),
        row[4] || ''
      ];
    }

    if (eventDateFormat) {
      return [
        row[1] || '',
        formatBrazilDate(row[0]),
        formatBrazilTime(row[0]),
        row[2] || ''
      ];
    }

    return [
      row[2] || '',
      row[0] || '',
      row[1] || '',
      row[3] || ''
    ];
  });

  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.googleSpreadsheetId,
    range: `${config.googleSheetName}!A:Z`
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSpreadsheetId,
    range: `${config.googleSheetName}!A1:D${Math.max(formattedRows.length + 1, 1)}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [headers, ...formattedRows]
    }
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.googleSpreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheet.properties.sheetId,
              gridProperties: {
                columnCount: 4
              }
            },
            fields: 'gridProperties.columnCount'
          }
        }
      ]
    }
  });

  console.log(`Planilha formatada: ${config.googleSheetName}`);
}

main().catch((error) => {
  console.error('Erro ao formatar planilha:', error.message);
  process.exit(1);
});
