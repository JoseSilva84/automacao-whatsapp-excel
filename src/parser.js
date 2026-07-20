const chrono = require('chrono-node');
const OpenAI = require('openai');
const config = require('./config');

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function looksLikeAppointment(text) {
  return /\b(agenda|agendar|reuniao|reunião|culto|visita|atividade|encontro|evento|compromisso|dia|amanha|amanhã|hoje|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo|\d{1,2}[:h]\d{0,2})\b/i.test(text);
}

async function parseAppointment(text) {
  if (!looksLikeAppointment(text)) return null;

  if (shouldUseGemini()) {
    const parsedByAi = await parseWithGemini(text).catch((error) => {
      console.warn('Falha ao interpretar com Gemini, usando regra simples:', error.message);
      return null;
    });

    if (parsedByAi) return parsedByAi;
  }

  if (shouldUseOpenAI()) {
    const parsedByAi = await parseWithOpenAI(text).catch((error) => {
      console.warn('Falha ao interpretar com IA, usando regra simples:', error.message);
      return null;
    });

    if (parsedByAi) return parsedByAi;
  }

  return parseWithRules(text);
}

function shouldUseGemini() {
  return config.geminiApiKey && ['auto', 'gemini'].includes(config.aiProvider);
}

function shouldUseOpenAI() {
  return config.openaiApiKey && ['auto', 'openai'].includes(config.aiProvider);
}

function buildExtractionPrompt(text) {
  const now = new Date().toISOString();

  return [
    'Extraia agendamentos de mensagens em portugues do Brasil.',
    'Responda somente JSON valido.',
    'Se nao houver agendamento claro, retorne {"isAppointment":false}.',
    'Campos: isAppointment, title, start, end, location, notes.',
    'start e end devem ser ISO 8601 com offset quando possivel.',
    'Se nao houver fim, use duracao padrao de 1 hora.',
    `Timezone padrao: ${config.timezone}. Agora: ${now}.`,
    `Mensagem: ${text}`
  ].join(' ');
}

function normalizeAiAppointment(parsed, originalText) {
  if (!parsed.isAppointment || !parsed.start || !parsed.title) return null;

  const start = new Date(parsed.start);
  if (Number.isNaN(start.getTime())) return null;

  const end = parsed.end && !Number.isNaN(new Date(parsed.end).getTime())
    ? new Date(parsed.end)
    : addHours(start, 1);

  return {
    title: parsed.title,
    start: start.toISOString(),
    end: end.toISOString(),
    location: parsed.location || '',
    notes: parsed.notes || '',
    originalText
  };
}

function parseJsonResponse(text) {
  const clean = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  return JSON.parse(clean);
}

async function parseWithGemini(text) {
  const model = String(config.geminiModel || 'gemini-2.5-flash').replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.geminiApiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildExtractionPrompt(text) }]
        }
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini respondeu ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json();
  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();

  if (!answer) return null;
  return normalizeAiAppointment(parseJsonResponse(answer), text);
}

async function parseWithOpenAI(text) {
  const client = new OpenAI({ apiKey: config.openaiApiKey });

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: buildExtractionPrompt('')
      },
      { role: 'user', content: text }
    ]
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return normalizeAiAppointment(parsed, text);
}

function parseWithRules(text) {
  const result = chrono.pt.parse(text, new Date(), { forwardDate: true })[0];
  if (!result?.start) return null;

  const start = result.start.date();
  const end = result.end?.date() || addHours(start, 1);
  const title = cleanTitle(text, result.text);

  return {
    title: title || 'Atividade agendada',
    start: start.toISOString(),
    end: end.toISOString(),
    location: extractLocation(text),
    notes: '',
    originalText: text
  };
}

function extractLocation(text) {
  const match = text.match(/\b(?:no|na|em|local:)\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function cleanTitle(text, dateText) {
  const withoutLocation = text.replace(/\b(?:no|na|em|local:)\s+.+$/i, '');
  const withoutDate = withoutLocation.replace(dateText, '');
  const withoutTime = withoutDate
    .replace(/\b(?:as|às|a)\s*\d{1,2}(?::\d{2}|h\d{0,2})?\b/gi, '')
    .replace(/\bdia\b/gi, '');

  return withoutTime.replace(/\s+/g, ' ').trim() || 'Atividade agendada';
}

module.exports = { parseAppointment, looksLikeAppointment };
