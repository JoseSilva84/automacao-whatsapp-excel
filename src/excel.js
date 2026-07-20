const path = require('path');
const fs = require('fs/promises');
const ExcelJS = require('exceljs');
const config = require('./config');

const columns = [
  { header: 'Evento', key: 'title', width: 32 },
  { header: 'Data', key: 'eventDate', width: 14 },
  { header: 'Horario', key: 'eventTime', width: 12 },
  { header: 'Local', key: 'location', width: 28 }
];

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

async function appendToExcel(appointment) {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.resolve(config.excelFile);

  try {
    await fs.access(filePath);
    await workbook.xlsx.readFile(filePath);
  } catch {
    workbook.addWorksheet('Agendamentos');
  }

  const worksheet = workbook.getWorksheet('Agendamentos') || workbook.addWorksheet('Agendamentos');
  if (worksheet.rowCount === 0) {
    worksheet.columns = columns;
    worksheet.getRow(1).font = { bold: true };
  }

  worksheet.addRow({
    title: appointment.title,
    eventDate: formatBrazilDate(appointment.start),
    eventTime: formatBrazilTime(appointment.start),
    location: appointment.location || ''
  });

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

module.exports = { appendToExcel };
