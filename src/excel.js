const path = require('path');
const fs = require('fs/promises');
const ExcelJS = require('exceljs');
const config = require('./config');

const columns = [
  { header: 'Registrado em', key: 'createdAt', width: 24 },
  { header: 'Titulo', key: 'title', width: 32 },
  { header: 'Inicio', key: 'start', width: 24 },
  { header: 'Fim', key: 'end', width: 24 },
  { header: 'Local', key: 'location', width: 28 },
  { header: 'Observacoes', key: 'notes', width: 42 },
  { header: 'Mensagem original', key: 'originalText', width: 60 }
];

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
    createdAt: new Date().toISOString(),
    title: appointment.title,
    start: appointment.start,
    end: appointment.end,
    location: appointment.location || '',
    notes: appointment.notes || '',
    originalText: appointment.originalText
  });

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

module.exports = { appendToExcel };
