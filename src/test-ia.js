require('dotenv').config();

const { parseAppointment } = require('./parser');
const { appendToExcel } = require('./excel');
const { appendToGoogleSheet } = require('./google');

async function main() {
  const text = process.argv.slice(2).join(' ').trim()
    || 'Agendar visita na casa da Ana amanha as 19:30. Levar materiais.';

  console.log('Mensagem de teste:', text);

  const appointment = await parseAppointment(text);
  if (!appointment) {
    console.log('A IA/regras nao identificaram um agendamento nessa mensagem.');
    return;
  }

  console.log('Agendamento interpretado:');
  console.log(JSON.stringify(appointment, null, 2));

  const excelPath = await appendToExcel(appointment);
  console.log(`Salvo no Excel: ${excelPath}`);

  await appendToGoogleSheet(appointment);
  console.log('Salvo no Google Sheets, se GOOGLE_SPREADSHEET_ID estiver configurado.');
}

main().catch((error) => {
  console.error('Erro no teste da IA:', error.message);
  process.exit(1);
});
