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

    sendJson(response, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    console.error('Erro no webhook WAHA:', error);
    sendJson(response, 500, { ok: false, error: 'internal_error' });
  }
});

server.listen(port, () => {
  console.log(`Webhook WAHA ouvindo na porta ${port}`);
  console.log(`Sessao esperada: ${config.wahaSessionName || 'qualquer sessao'}`);
});
