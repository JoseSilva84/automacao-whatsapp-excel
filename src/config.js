require('dotenv').config();

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

module.exports = {
  aiProvider: process.env.AI_PROVIDER || 'auto',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  whatsappSelfChatName: process.env.WHATSAPP_SELF_CHAT_NAME || 'Voce',
  timezone: process.env.TIMEZONE || 'America/Fortaleza',
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  googleCalendarEnabled: bool(process.env.GOOGLE_CALENDAR_ENABLED, false),
  googleSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
  googleSheetName: process.env.GOOGLE_SHEET_NAME || 'Agendamentos',
  googleServiceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE || 'service-account.json',
  excelFile: process.env.EXCEL_FILE || 'agendamentos.xlsx',
  dryRun: bool(process.env.DRY_RUN, false)
};
