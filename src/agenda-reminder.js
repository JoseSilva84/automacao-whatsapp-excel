const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { readSpreadsheetValues } = require('./google');
const { parseAgendaRows } = require('./agenda-reader');

let running = false;
const sentInCurrentRun = new Set();
let lastStatusLog = '';

function startAgendaReminderScheduler(sendTextMessage) {
  if (!config.agendaReminderEnabled) {
    console.log('Lembretes da agenda desligados. Defina AGENDA_REMINDER_ENABLED=true para ativar.');
    return null;
  }

  const intervalMs = Math.max(15, config.agendaReminderCheckIntervalSeconds) * 1000;

  console.log(
    `Lembretes da agenda ligados. Aviso ${config.agendaReminderMinutesBefore} minutos antes.`
  );

  checkAndSendReminders(sendTextMessage).catch((error) => {
    console.error('Erro ao verificar lembretes da agenda:', error);
  });

  return setInterval(() => {
    checkAndSendReminders(sendTextMessage).catch((error) => {
      console.error('Erro ao verificar lembretes da agenda:', error);
    });
  }, intervalMs);
}

async function checkAndSendReminders(sendTextMessage, now = new Date()) {
  if (running) return;
  running = true;

  try {
    const sent = await loadSentReminders();
    const worksheets = await readSpreadsheetValues();
    const appointments = parseAgendaRows(worksheets, { timezone: config.timezone });
    const dueAppointments = uniqueAppointments(appointments).filter((appointment) => {
      if (sent[appointment.id] || sentInCurrentRun.has(appointment.id)) return false;
      return isReminderDue(appointment.start, now);
    });

    logReminderStatus(appointments, dueAppointments, sent, now);

    for (const appointment of dueAppointments) {
      await sendReminder(sendTextMessage, appointment);
      sent[appointment.id] = new Date().toISOString();
      sentInCurrentRun.add(appointment.id);
      await saveSentReminders(cleanOldSentReminders(sent, now));
      console.log(`Lembrete marcado como enviado: ${appointment.title} - ${appointment.start}`);
    }

    if (dueAppointments.length) {
      console.log(`${dueAppointments.length} lembrete(s) da agenda enviado(s).`);
    }
  } finally {
    running = false;
  }
}

function logReminderStatus(appointments, dueAppointments, sent, now) {
  const nextAppointment = uniqueAppointments(appointments)
    .filter((appointment) => !sent[appointment.id] && !sentInCurrentRun.has(appointment.id))
    .filter((appointment) => new Date(appointment.start).getTime() > now.getTime())
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0];

  const status = JSON.stringify({
    total: appointments.length,
    due: dueAppointments.length,
    next: nextAppointment ? `${nextAppointment.title} - ${nextAppointment.start}` : 'nenhum'
  });

  if (status === lastStatusLog && dueAppointments.length === 0) return;

  lastStatusLog = status;
  console.log(`Agenda verificada: ${status}`);
}

function uniqueAppointments(appointments) {
  const seen = new Set();
  const unique = [];

  for (const appointment of appointments) {
    const key = appointment.id;
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(appointment);
  }

  return unique;
}

function isReminderDue(start, now) {
  const startTime = new Date(start).getTime();
  const reminderTime = startTime - config.agendaReminderMinutesBefore * 60 * 1000;
  const currentTime = now.getTime();

  return currentTime >= reminderTime && currentTime < startTime;
}

async function sendReminder(sendTextMessage, appointment) {
  const message = formatReminderMessage(appointment);

  if (config.dryRun) {
    console.log('[DRY_RUN] Lembrete WhatsApp:', message);
    return;
  }

  await sendTextMessage(message);
}

function formatReminderMessage(appointment) {
  const start = new Date(appointment.start);
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(start);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit'
  }).format(start);

  return [
    'Agenda:',
    `${appointment.title}`,
    `${date} às ${time}`,
    `Origem: ${appointment.source}`
  ].join('\n');
}

async function loadSentReminders() {
  try {
    const raw = await fs.readFile(sentFilePath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveSentReminders(sent) {
  await fs.writeFile(sentFilePath(), JSON.stringify(sent, null, 2));
}

function sentFilePath() {
  return path.resolve(config.agendaReminderSentFile);
}

function cleanOldSentReminders(sent, now) {
  const limit = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return Object.fromEntries(
    Object.entries(sent).filter(([, value]) => new Date(value).getTime() >= limit)
  );
}

module.exports = {
  startAgendaReminderScheduler,
  checkAndSendReminders,
  formatReminderMessage
};
