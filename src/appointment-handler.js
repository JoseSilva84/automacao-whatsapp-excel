const { parseAppointment } = require('./parser');
const { appendToExcel } = require('./excel');
const { createCalendarEvent, appendToGoogleSheet } = require('./google');

async function handleAppointmentText(text) {
  const appointment = await parseAppointment(text);
  if (!appointment) {
    console.log('Mensagem ignorada, nao parece ser um agendamento:', text);
    return null;
  }

  console.log('Agendamento detectado:', appointment);
  const excelPath = await appendToExcel(appointment);
  await appendToGoogleSheet(appointment);
  await createCalendarEvent(appointment);

  console.log(`Agendamento salvo. Excel: ${excelPath}`);
  return appointment;
}

module.exports = { handleAppointmentText };
