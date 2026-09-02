const config = require('./config');

function createZproTextSender() {
  return async function sendTextMessage(text) {
    const baseUrl = trimTrailingSlash(config.zproApiBaseUrl);
    const token = config.zproApiToken;
    const number = onlyDigits(config.zproSelfNumber);

    if (!baseUrl) {
      throw new Error('ZPRO_API_BASE_URL nao configurado.');
    }

    if (!token) {
      throw new Error('ZPRO_API_TOKEN nao configurado.');
    }

    if (!number) {
      throw new Error('ZPRO_SELF_NUMBER nao configurado.');
    }

    const path = resolveSendTextPath();
    const url = `${baseUrl}${path}`;
    const body = buildSendTextBody(text, number);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Erro ao enviar WhatsApp pelo ZPRO (${response.status}): ${responseText}`);
    }

    return parseJson(responseText);
  };
}

function resolveSendTextPath() {
  if (config.zproSendTextPath) {
    return ensureLeadingSlash(
      config.zproSendTextPath.replace('{channelId}', encodeURIComponent(config.zproChannelId))
    );
  }

  if (!config.zproChannelId) {
    throw new Error('ZPRO_CHANNEL_ID nao configurado.');
  }

  return `/api/messages/sendText/${encodeURIComponent(config.zproChannelId)}`;
}

function buildSendTextBody(text, number) {
  return {
    number,
    phone: number,
    to: number,
    body: text,
    text,
    message: text
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function ensureLeadingSlash(value) {
  return String(value || '').startsWith('/') ? value : `/${value}`;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

module.exports = { createZproTextSender };
