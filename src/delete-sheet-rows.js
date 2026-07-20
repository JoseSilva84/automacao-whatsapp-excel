require('dotenv').config();

const { google } = require('googleapis');
const { authorizeServiceAccount } = require('./google-auth');
const config = require('./config');

async function main() {
  const startRow = Number(process.argv[2]);
  const endRow = Number(process.argv[3]);

  if (!Number.isInteger(startRow) || !Number.isInteger(endRow) || startRow < 1 || endRow < startRow) {
    throw new Error('Informe as linhas assim: npm run sheet:delete-rows -- 2 7');
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

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.googleSpreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: startRow - 1,
              endIndex: endRow
            }
          }
        }
      ]
    }
  });

  console.log(`Linhas ${startRow} ate ${endRow} removidas.`);
}

main().catch((error) => {
  console.error('Erro ao remover linhas:', error.message);
  process.exit(1);
});
