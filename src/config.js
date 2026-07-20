require('dotenv').config();

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

module.exports = {
  aiProvider: process.env.AI_PROVIDER || 'auto',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  whatsappSelfChatName: process.env.WHATSAPP_SELF_CHAT_NAME || 'Voce',
  timezone: process.env.TIMEZONE || 'America/Fortaleza',
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  googleSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
  googleSheetName: process.env.GOOGLE_SHEET_NAME || 'Agendamentos',
  excelFile: process.env.EXCEL_FILE || 'agendamentos.xlsx',
  dryRun: bool(process.env.DRY_RUN, false)
};
