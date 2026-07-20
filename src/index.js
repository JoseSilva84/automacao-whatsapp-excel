const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const config = require('./config');
const { handleAppointmentText } = require('./appointment-handler');

const processedMessages = new Set();

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'automacao-agendamentos' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('\nEscaneie este QR Code com o WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('WhatsApp conectado. Monitorando mensagens salvas no seu proprio chat.');
  console.log(`Chat configurado: "${config.whatsappSelfChatName}"`);
});

client.on('message_create', async (message) => {
  try {
    if (!message.fromMe || !message.body?.trim()) return;
    if (processedMessages.has(message.id.id)) return;

    const chat = await message.getChat();
    const chatName = chat.name || chat.formattedTitle || '';
    if (!isSelfChat(chatName)) return;

    processedMessages.add(message.id.id);
    await handleMessage(message.body.trim());
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
  }
});

function isSelfChat(chatName) {
  const configured = normalize(config.whatsappSelfChatName);
  const current = normalize(chatName);
  return current === configured || current.includes(configured);
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function handleMessage(text) {
  await handleAppointmentText(text);
}

client.initialize();
