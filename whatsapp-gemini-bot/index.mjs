import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

console.log(">>> Script execution started successfully! <<<");

const GEMINI_API_KEY = "";

async function generateGeminiReply(userText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: userText }]
      }],
      systemInstruction: {
        parts: [{ 
          text: "You are the professional AI assistant for Sahil, a Software Engineer. Sahil is currently busy. Always respond politely and professionally strictly in fluent English, regardless of the language the incoming message is written in. Briefly ask for their requirements." 
        }]
      }
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Gemini API Error: ${data.error.message}`);
  }

  if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  } 

  if (data.candidates && data.candidates[0]?.finishReason) {
    return "Sahil is currently unavailable. Please leave a brief detail of your project requirements.";
  }

  throw new Error("Invalid response format received from Gemini API");
}

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
          const aiReply = await generateGeminiReply(userMessage);

          await sock.sendMessage(remoteJid, { text: aiReply });
          console.log(`Replied: ${aiReply}`);
        } catch (error) {
          console.error('Gemini API Error:', error.message);
        }
      }
    });
  } catch (err) {
    console.error("Fatal Error in startBot:", err);
  }
}

startBot();