require('dotenv').config();

const http = require('http');
const config = require('./config');
const { handleAppointmentText } = require('./appointment-handler');

const processedMessages = new Set();
const port = Number(config.port || 3000);

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload muito grande.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function isAuthorized(request, url) {
  if (!config.webhookSecret) return true;

  const querySecret = url.searchParams.get('secret');
  const headerSecret = request.headers['x-webhook-secret'];
  return querySecret === config.webhookSecret || headerSecret === config.webhookSecret;
}

function isSelfMessage(event) {
  const payload = event.payload || {};
  if (!payload.fromMe) return false;
  if (!payload.body?.trim()) return false;
  if (payload.hasMedia) return false;
  if (payload.from?.endsWith('@g.us') || payload.to?.endsWith('@g.us')) return false;

  const me = event.me?.id;
  return !me || payload.from === me || payload.to === me || payload.from === payload.to;
}

function findFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractZproMessage(event) {
  const data = event.data || event.payload || event.message || event;
  const message = data.message || data.msg || data;
  const key = message.key || data.key || {};

  const text = findFirstString(
    message.body,
    message.text,
    message.content,
    message.conversation,
    message.message?.conversation,
    message.message?.extendedTextMessage?.text,
    data.body,
    data.text,
    data.content,
    data.message?.conversation,
    data.message?.extendedTextMessage?.text
  );

  const id = findFirstString(
    message.id,
    message.messageId,
    data.id,
    data.messageId,
    key.id
  );

  const fromMe = Boolean(
    message.fromMe ||
    data.fromMe ||
    key.fromMe ||
    message.key?.fromMe
  );

  const remoteJid = findFirstString(
    message.remoteJid,
    data.remoteJid,
    key.remoteJid,
    message.key?.remoteJid,
    message.from,
    data.from
  );

  const isGroup = remoteJid.endsWith('@g.us') || remoteJid.includes('-');
  return { id, text, fromMe, remoteJid, isGroup };
}

function preview(value, maxLength = 500) {
  const text = JSON.stringify(value);
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function handleWahaWebhook(request, response, url) {
  if (!isAuthorized(request, url)) {
    sendJson(response, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  const rawBody = await readBody(request);
  const event = JSON.parse(rawBody || '{}');

  if (config.wahaSessionName && event.session !== config.wahaSessionName) {
    sendJson(response, 200, { ok: true, ignored: 'other_session' });
    return;
  }

  if (!['message', 'message.any'].includes(event.event)) {
    sendJson(response, 200, { ok: true, ignored: 'other_event' });
    return;
  }

  if (!isSelfMessage(event)) {
    sendJson(response, 200, { ok: true, ignored: 'not_self_message' });
    return;
  }

  const messageId = event.payload.id;
  if (messageId && processedMessages.has(messageId)) {
    sendJson(response, 200, { ok: true, ignored: 'duplicate' });
    return;
  }

  if (messageId) processedMessages.add(messageId);

  const appointment = await handleAppointmentText(event.payload.body.trim());
  sendJson(response, 200, { ok: true, saved: Boolean(appointment) });
}

async function handleZproWebhook(request, response, url) {
  if (!isAuthorized(request, url)) {
    sendJson(response, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  const rawBody = await readBody(request);
  const event = JSON.parse(rawBody || '{}');
  const zproMessage = extractZproMessage(event);
  console.log('Webhook ZPRO recebido:', {
    event: event.event || event.type || event.action || event.name || '',
    text: zproMessage.text,
    fromMe: zproMessage.fromMe,
    remoteJid: zproMessage.remoteJid,
    isGroup: zproMessage.isGroup,
    keys: Object.keys(event || {}),
    preview: preview(event)
  });

  if (!zproMessage.text) {
    console.log('Webhook ZPRO ignorado: mensagem vazia ou formato nao reconhecido.');
    sendJson(response, 200, { ok: true, ignored: 'empty_message' });
    return;
  }

  if (zproMessage.isGroup) {
    console.log('Webhook ZPRO ignorado: mensagem de grupo.');
    sendJson(response, 200, { ok: true, ignored: 'group_message' });
    return;
  }

  if (config.zproFromMeOnly && !zproMessage.fromMe) {
    console.log('Webhook ZPRO ignorado: mensagem nao foi enviada por mim.');
    sendJson(response, 200, { ok: true, ignored: 'not_from_me' });
    return;
  }

  if (config.zproSelfNumber && !zproMessage.remoteJid.includes(config.zproSelfNumber)) {
    console.log('Webhook ZPRO ignorado: mensagem nao foi enviada para meu proprio chat.');
    sendJson(response, 200, { ok: true, ignored: 'not_self_chat' });
    return;
  }

  if (zproMessage.id && processedMessages.has(zproMessage.id)) {
    sendJson(response, 200, { ok: true, ignored: 'duplicate' });
    return;
  }

  if (zproMessage.id) processedMessages.add(zproMessage.id);

  const appointment = await handleAppointmentText(zproMessage.text);
  sendJson(response, 200, { ok: true, saved: Boolean(appointment) });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/webhooks/waha') {
      await handleWahaWebhook(request, response, url);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/webhooks/zpro') {
      await handleZproWebhook(request, response, url);
      return;
    }

    sendJson(response, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    console.error('Erro no webhook WhatsApp:', error);
    sendJson(response, 500, { ok: false, error: 'internal_error' });
  }
});

server.listen(port, () => {
  console.log(`Webhooks WhatsApp ouvindo na porta ${port}`);
  console.log(`WAHA: /webhooks/waha`);
  console.log(`ZPRO: /webhooks/zpro`);
  console.log(`Sessao esperada: ${config.wahaSessionName || 'qualquer sessao'}`);
});
