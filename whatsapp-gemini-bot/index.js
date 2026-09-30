
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { GoogleGenerativeAI } from '@google/generative-ai';
import qrcode from 'qrcode-terminal';

// Direct execution test
console.log(">>> Script execution started successfully! <<<");

const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; // <-- Apni API Key yahan paste karein
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction: "Aap ek professional Software Engineer ke AI assistant hain."
});

async function startBot() {
  console.log("Bot starting... Initializing Baileys...");

  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n--- SCAN THIS QR CODE WITH YOUR WHATSAPP ---\n');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log('Connection closed. Reconnecting:', shouldReconnect);
        if (shouldReconnect) startBot();
      } else if (connection === 'open') {
        console.log('\n>>> WhatsApp Bot is Successfully Online! <<<\n');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.endsWith('@g.us')) continue;

        const remoteJid = msg.key.remoteJid;
        const userMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!userMessage) continue;

        console.log(`\nIncoming Message from ${remoteJid}: ${userMessage}`);

        try {
          const result = await model.generateContent(userMessage);
          const aiReply = result.response.text();

          await sock.sendMessage(remoteJid, { text: aiReply });
          console.log(`Replied: ${aiReply}`);
        } catch (error) {
          console.error('Gemini API Error:', error);
        }
      }
    });
  } catch (err) {
    console.error("Fatal Error in startBot:", err);
  }
}

startBot();