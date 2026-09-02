const MONTHS = {
  jan: 1,
  january: 1,
  fevereiro: 2,
  fev: 2,
  feb: 2,
  february: 2,
  marco: 3,
  março: 3,
  mar: 3,
  march: 3,
  abril: 4,
  abr: 4,
  apr: 4,
  april: 4,
  maio: 5,
  may: 5,
  junho: 6,
  jun: 6,
  june: 6,
  julho: 7,
  jul: 7,
  july: 7,
  agosto: 8,
  ago: 8,
  aug: 8,
  august: 8,
  setembro: 9,
  set: 9,
  sep: 9,
  september: 9,
  outubro: 10,
  out: 10,
  oct: 10,
  october: 10,
  novembro: 11,
  nov: 11,
  november: 11,
  dezembro: 12,
  dez: 12,
  dec: 12,
  december: 12
};

function parseAgendaRows(worksheets, options = {}) {
  const timezone = options.timezone || 'America/Fortaleza';
  const appointments = [];

  for (const worksheet of worksheets) {
    const rows = worksheet.rows || [];
    if (!rows.length) continue;

    const year = findYear(rows) || new Date().getFullYear();
    const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);

    for (let startColumn = 0; startColumn < maxColumns; startColumn += 1) {
      if (!isSchedulesCell(rows[1]?.[startColumn])) continue;

      const dayColumns = findDayColumns(rows[1], startColumn + 1);
      if (!dayColumns.length) continue;

      for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
        const baseTime = parseScheduleTime(rows[rowIndex]?.[startColumn]);
        const previousTime = rowIndex > 2 ? parseScheduleTime(rows[rowIndex - 1]?.[startColumn]) : null;
        const inferredTime = baseTime || (previousTime ? addMinutesToTime(previousTime, 30) : null);
        if (!inferredTime) continue;

        for (const dayColumn of dayColumns) {
          const cellText = cleanCellText(rows[rowIndex]?.[dayColumn.column]);
          if (!cellText) continue;

          const explicitTime = extractExplicitTime(cellText);
          const time = explicitTime.time || inferredTime;
          const title = explicitTime.title || cellText;
          const start = buildDateInTimezone({
            year,
            month: dayColumn.month,
            day: dayColumn.day,
            hour: time.hour,
            minute: time.minute,
            timezone
          });

          if (!start) continue;

          appointments.push({
            id: createAppointmentId(worksheet.title, dayColumn.column, rowIndex, start, title),
            title,
            start,
            source: worksheet.title,
            dayLabel: dayColumn.label,
            row: rowIndex + 1,
            column: dayColumn.column + 1
          });
        }
      }
    }
  }

  return appointments.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function findDayColumns(row = [], startColumn) {
  const columns = [];

  for (let column = startColumn; column < row.length; column += 1) {
    const label = cleanCellText(row[column]);
    if (!label) {
      if (columns.length) break;
      continue;
    }

    const parsed = parseDayLabel(label);
    if (!parsed) {
      if (columns.length) break;
      continue;
    }

    columns.push({ column, label, ...parsed });
  }

  return columns;
}

function parseDayLabel(value) {
  const text = cleanCellText(value);
  const match = text.match(/(?:^|[-\s])(\d{1,2})\/(\d{1,2})(?:\D|$)/);
  if (!match) return null;

  return {
    day: Number(match[1]),
    month: Number(match[2])
  };
}

function parseScheduleTime(value) {
  if (value instanceof Date) {
    return { hour: value.getUTCHours(), minute: value.getUTCMinutes() };
  }

  const text = cleanCellText(value);
  if (!text) return null;

  const dateMatch = text.match(/1899-12-30T(\d{2}):(\d{2})/);
  if (dateMatch) {
    return { hour: Number(dateMatch[1]), minute: Number(dateMatch[2]) };
  }

  const timeMatch = text.match(/^(\d{1,2})(?::|h)(\d{2})?(?::\d{2})?\s*(AM|PM)?$/i);
  if (!timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const period = String(timeMatch[3] || '').toUpperCase();
  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  return {
    hour,
    minute: Number(timeMatch[2] || 0)
  };
}

function extractExplicitTime(value) {
  const text = cleanCellText(value);
  const match = text.match(/^\s*(\d{1,2})(?:h|:)(\d{2})?\s*[-–—]?\s*(.+)$/i);
  if (!match) return { time: null, title: text };

  return {
    time: {
      hour: Number(match[1]),
      minute: Number(match[2] || 0)
    },
    title: cleanCellText(match[3])
  };
}

function findYear(rows) {
  for (const row of rows.slice(0, 3)) {
    for (const cell of row || []) {
      const match = cleanCellText(cell).match(/\b(20\d{2})\b/);
      if (match) return Number(match[1]);
    }
  }

  return null;
}

function isSchedulesCell(value) {
  return normalize(cleanCellText(value)) === 'schedules';
}

function addMinutesToTime(time, minutes) {
  const total = time.hour * 60 + time.minute + minutes;
  return {
    hour: Math.floor(total / 60) % 24,
    minute: total % 60
  };
}

function buildDateInTimezone({ year, month, day, hour, minute, timezone }) {
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(utc);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  const offset = localAsUtc - utc.getTime();

  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offset).toISOString();
}

function createAppointmentId(source, column, row, start, title) {
  return [
    normalize(source),
    column + 1,
    row + 1,
    start,
    normalize(title)
  ].join('|');
}

function cleanCellText(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (value.text) return cleanCellText(value.text);
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('').trim();
    }
    if (value.result !== undefined) return cleanCellText(value.result);
    return '';
  }

  return String(value).replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

module.exports = { parseAgendaRows };
