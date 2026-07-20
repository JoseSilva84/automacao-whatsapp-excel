const fs = require('fs/promises');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const { google } = require('googleapis');
const config = require('./config');

const CREDENTIALS_PATH = 'credentials.json';
const TOKEN_PATH = 'token.json';
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function loadCredentials() {
  const raw = await fs.readFile(CREDENTIALS_PATH, 'utf8');
  const credentials = JSON.parse(raw);
  const config = credentials.installed || credentials.web;

  if (!config) {
    throw new Error('credentials.json precisa ser uma credencial OAuth de app desktop ou web.');
  }

  const redirectUri = config.redirect_uris?.[0] || 'http://localhost';
  return new google.auth.OAuth2(config.client_id, config.client_secret, redirectUri);
}

async function authorize() {
  const oauth2Client = await loadCredentials();

  try {
    const token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(token);
    return oauth2Client;
  } catch {
    return getNewToken(oauth2Client);
  }
}

async function authorizeServiceAccount(scopes = SHEETS_SCOPES) {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.googleServiceAccountFile,
    scopes
  });

  return auth.getClient();
}

async function getNewToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...CALENDAR_SCOPES, ...SHEETS_SCOPES]
  });

  console.log('\nAutorize o acesso abrindo este link:\n');
  console.log(authUrl);
  console.log('');

  const rl = readline.createInterface({ input, output });
  const code = await rl.question('Cole aqui o codigo de autorizacao do Google: ');
  rl.close();

  const { tokens } = await oauth2Client.getToken(code.trim());
  oauth2Client.setCredentials(tokens);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('\nAutorizacao salva em token.json.');

  return oauth2Client;
}

if (require.main === module) {
  authorize().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { authorize, authorizeServiceAccount };
