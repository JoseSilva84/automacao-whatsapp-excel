const config = require('./config');

function createZproTextSender() {
  return async function sendTextMessage(text) {
    const integrationUrl = trimTrailingSlash(config.zproIntegrationUrl);
    const baseUrl = trimTrailingSlash(config.zproApiBaseUrl);
    const token = config.zproApiToken;
    const number = onlyDigits(config.zproSelfNumber);

    if (!integrationUrl && !baseUrl) {
      throw new Error('ZPRO_INTEGRATION_URL ou ZPRO_API_BASE_URL nao configurado.');
    }

    if (!token) {
      throw new Error('ZPRO_API_TOKEN nao configurado.');
    }

    if (!number) {
      throw new Error('ZPRO_SELF_NUMBER nao configurado.');
    }

    const url = resolveSendTextUrl(integrationUrl, baseUrl);
    const body = buildSendTextBody(text, number, resolveExternalKey(integrationUrl));

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

function resolveSendTextUrl(integrationUrl, baseUrl) {
  if (config.zproSendTextPath) {
    const path = ensureLeadingSlash(
      config.zproSendTextPath
        .replace('{channelId}', encodeURIComponent(config.zproChannelId))
        .replace('{integrationUrl}', integrationUrl)
    );
    return `${baseUrl || integrationUrl}${path}`;
  }

  if (integrationUrl) {
    return integrationUrl;
  }

  if (!config.zproChannelId) {
    throw new Error('ZPRO_CHANNEL_ID nao configurado.');
  }

  return `${baseUrl}/api/messages/sendText/${encodeURIComponent(config.zproChannelId)}`;
}

function buildSendTextBody(text, number, externalKey) {
  return {
    externalKey,
    number,
    phone: number,
    to: number,
    body: text,
    text,
    message: text
  };
}

function resolveExternalKey(integrationUrl) {
  if (config.zproExternalKey) return config.zproExternalKey;
  if (!integrationUrl) return '';

  try {
    const url = new URL(integrationUrl);
    return url.pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return integrationUrl.split('/').filter(Boolean).pop() || '';
  }
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
