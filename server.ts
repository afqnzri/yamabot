/**
 * YAMA Bot - Full-Stack Express Server & Background Telegram Runner
 * Mounts Vite dev middleware on port 3000 and runs the continuous Telegram Bot listener.
 * This keeps the bot permanently LIVE and active 24/7 inside the application runtime.
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ExcelService } from './src/services/excelService';
import { RapidApiService } from './src/services/rapidApiService';
import type { CompetitorRoomMapping, PriceReportRow } from './src/types/yama';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8806821205:AAF6Z956tPfW2BsnMKzPkDmEzuAj1_5VYFM';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'f659e796f5mshede0a10caa98d60p1f7437jsn2a0469f81edb';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'booking-com15.p.rapidapi.com';
const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID || '54041669';

const STATUS_FILE = path.resolve(__dirname, 'public', 'bot_status.json');

// In-memory Daemon State
const daemonStatus = {
  status: 'online' as 'online' | 'busy' | 'offline',
  botUsername: 'YamaHotelBot',
  timestamp: Date.now(),
  isProcessing: false,
  currentTask: null as string | null,
  lastCompletedFile: null as string | null,
  lastCompletedAt: null as string | null,
  processedCount: 0
};

const userDates = new Map<number | string, { arrival: string; departure: string }>();

function updateHeartbeat() {
  daemonStatus.timestamp = Date.now();
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(daemonStatus, null, 2));
  } catch {
    // ignore
  }
}

// Continuous Heartbeat Interval
setInterval(updateHeartbeat, 3000);
updateHeartbeat();

// API endpoint for bot status
app.get('/api/bot-status', (_req, res) => {
  daemonStatus.timestamp = Date.now();
  res.json({
    status: daemonStatus.status,
    botUsername: daemonStatus.botUsername,
    timestamp: daemonStatus.timestamp,
    isProcessing: daemonStatus.isProcessing,
    currentTask: daemonStatus.currentTask,
    lastCompletedFile: daemonStatus.lastCompletedFile,
    lastCompletedAt: daemonStatus.lastCompletedAt,
    processedCount: daemonStatus.processedCount
  });
});

// Helper functions for Telegram Bot
async function sendTelegramMessage(chatId: string | number, text: string, replyToMsgId?: number) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const body: Record<string, any> = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    };
    if (replyToMsgId) body.reply_to_message_id = replyToMsgId;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e: any) {
    console.error('Failed to send Telegram message:', e.message);
  }
}

async function sendTelegramChatAction(chatId: string | number, action = 'upload_document') {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action })
    });
  } catch {
    // ignore
  }
}

async function sendTelegramDocument(chatId: string | number, fileBuffer: Buffer, filename: string, caption = '') {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('document', new Blob([new Uint8Array(fileBuffer)]), filename);
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');

    await fetch(url, {
      method: 'POST',
      body: formData
    });
    console.log(`✅ Document ${filename} sent to chat ${chatId}`);
  } catch (e: any) {
    console.error('Failed to send document to Telegram:', e.message);
  }
}

async function downloadTelegramFile(fileId: string): Promise<Buffer | null> {
  try {
    const getFileUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const res = await fetch(getFileUrl);
    const data = await res.json();
    if (!data.ok || !data.result?.file_path) return null;

    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
    const fileRes = await fetch(fileUrl);
    const arrayBuf = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (e: any) {
    console.error('Failed to download file from Telegram:', e.message);
    return null;
  }
}

async function handleDocumentUpload(chatId: number | string, message: any) {
  const doc = message.document;
  if (!doc) return;

  const fileName: string = doc.file_name || 'hotel_workbook.xlsx';
  const fileId: string = doc.file_id;
  const msgId: number = message.message_id;
  const senderName = message.from?.first_name || message.from?.username || `User ${chatId}`;

  if (!fileName.toLowerCase().endsWith('.xlsx') && !fileName.toLowerCase().endsWith('.xls')) {
    await sendTelegramMessage(
      chatId,
      '⚠️ Sila muat naik fail Excel (`.xlsx` atau `.xls`) daripada YAMA Bot Flow 1.',
      msgId
    );
    return;
  }

  // Determine arrival & departure dates
  let arrivalDate: string;
  let departureDate: string;

  const custom = userDates.get(chatId);
  if (custom) {
    arrivalDate = custom.arrival;
    departureDate = custom.departure;
  } else {
    const tomorrow = new Date(Date.now() + 86400000);
    const dayAfter = new Date(Date.now() + 86400000 * 2);
    arrivalDate = tomorrow.toISOString().slice(0, 10);
    departureDate = dayAfter.toISOString().slice(0, 10);
  }

  console.log(`📥 [Chat ${chatId} (${senderName})] Received workbook: ${fileName} (${arrivalDate} -> ${departureDate})`);

  // Mark status as BUSY
  daemonStatus.isProcessing = true;
  daemonStatus.status = 'busy';
  daemonStatus.currentTask = `Sedang mengekstrak ${fileName} untuk ${senderName}...`;
  updateHeartbeat();

  // Send immediate acknowledgement to this user
  await sendTelegramMessage(
    chatId,
    `📥 *Workbook Diterima:*\n\`${fileName}\`\n\n` +
    `📅 *Tarikh Pemeriksaan:* \`${arrivalDate}\` → \`${departureDate}\`\n` +
    `⏳ *Memulakan ekstraksi harga YAMA Bot...*\n` +
    `Sila tunggu sebentar sementara bot menghubungi Booking.com API...`,
    msgId
  );

  await sendTelegramChatAction(chatId, 'upload_document');

  // Download workbook
  const buffer = await downloadTelegramFile(fileId);
  if (!buffer) {
    await sendTelegramMessage(chatId, '❌ Gagal memuat turun fail dari Telegram. Sila hantar semula.', msgId);
    daemonStatus.isProcessing = false;
    daemonStatus.status = 'online';
    daemonStatus.currentTask = null;
    updateHeartbeat();
    return;
  }

  try {
    const parsed = ExcelService.parseWorkbookFromBuffer(buffer);
    const hotelName = parsed.hotelName || 'Hotel';
    const hotelRooms = parsed.hotelRooms || [];
    const mappedRooms = parsed.mappedRooms || [];

    const activeRooms: CompetitorRoomMapping[] = mappedRooms.filter(
      (r: CompetitorRoomMapping) => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
    );

    if (activeRooms.length === 0) {
      await sendTelegramMessage(
        chatId,
        `⚠️ Fail \`${fileName}\` tidak mengandungi bilik yang telah dipadankan.\n` +
        `Sila buka Flow 1 di laman web dan padankan bilik hotel anda dahulu.`,
        msgId
      );
      daemonStatus.isProcessing = false;
      daemonStatus.status = 'online';
      daemonStatus.currentTask = null;
      updateHeartbeat();
      return;
    }

    console.log(`🏨 Extracting rates for hotel: ${hotelName} (${activeRooms.length} mapped rooms)`);

    // Call Booking.com RapidAPI
    const { priceReport, updatedRooms } = await RapidApiService.runPriceExtraction(
      hotelRooms,
      activeRooms,
      arrivalDate,
      departureDate,
      RAPIDAPI_KEY,
      RAPIDAPI_HOST,
      (pct: number, status: string) => {
        daemonStatus.currentTask = `[${pct}%] ${status}`;
        updateHeartbeat();
        sendTelegramChatAction(chatId, 'upload_document');
      }
    );

    // Generate output workbook
    const outputBuffer = ExcelService.generateOutputWorkbookBuffer(
      hotelName,
      priceReport,
      updatedRooms
    );

    const datePrefix = new Date().toISOString().slice(0, 10);
    const outputFilename = `${datePrefix}-${hotelName}.xlsx`;

    // Compile summary
    const summaryLines = priceReport.map((p: PriceReportRow) => {
      const lowStr = typeof p.lowest_competitor_price === 'number' ? `RM ${p.lowest_competitor_price.toFixed(2)}` : 'N/A';
      const avgStr = typeof p.average_competitor_price === 'number' ? `RM ${p.average_competitor_price.toFixed(2)}` : 'N/A';
      return `• *${p.our_room_type}*: Terendah ${lowStr} | Purata ${avgStr} (${p.valid_quotes} sebut harga)`;
    });

    const caption =
      `✅ *Laporan Selesai Diekstrak!*\n\n` +
      `📍 *Hotel:* ${hotelName}\n` +
      `📅 *Tarikh:* ${arrivalDate} → ${departureDate}\n\n` +
      `📊 *Ringkasan Pasaran:*\n` +
      (summaryLines.length > 0 ? summaryLines.join('\n') : '• Tiada harga ditemui.') +
      `\n\n📁 Fail Excel laporan disertakan di atas.`;

    // Reply directly to the user who sent the workbook
    await sendTelegramDocument(chatId, outputBuffer, outputFilename, caption);
    console.log(`🚀 Report sent to chat ${chatId} (${senderName})`);

    // If another user uploaded the file, send notice to owner
    if (String(chatId) !== String(OWNER_CHAT_ID) && OWNER_CHAT_ID) {
      await sendTelegramMessage(
        OWNER_CHAT_ID,
        `🔔 *Notifikasi Pemilik:*\n` +
        `Pengguna *${senderName}* (ID: \`${chatId}\`) baru sahaja memproses fail \`${fileName}\` untuk hotel *${hotelName}* melalui @${daemonStatus.botUsername}.`
      );
    }

    // Finish processing
    daemonStatus.isProcessing = false;
    daemonStatus.status = 'online';
    daemonStatus.currentTask = null;
    daemonStatus.lastCompletedFile = outputFilename;
    daemonStatus.lastCompletedAt = new Date().toLocaleTimeString();
    daemonStatus.processedCount += 1;
    updateHeartbeat();

  } catch (err: any) {
    console.error('Error during Telegram extraction:', err);
    daemonStatus.isProcessing = false;
    daemonStatus.status = 'online';
    daemonStatus.currentTask = null;
    updateHeartbeat();

    await sendTelegramMessage(
      chatId,
      `❌ *Ralat semasa ekstraksi harga:*\n\`${err.message || err}\`\n\n` +
      `Pastikan format sheet adalah betul.`,
      msgId
    );
  }
}

// Background Telegram Poller Loop
async function startTelegramPoller() {
  console.log('🤖 Starting background Telegram Bot Poller for @' + daemonStatus.botUsername);

  try {
    const meRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
    const meData = await meRes.json();
    if (meData.ok && meData.result?.username) {
      daemonStatus.botUsername = meData.result.username;
      daemonStatus.status = 'online';
      updateHeartbeat();
      console.log(`✅ Telegram bot connected as @${daemonStatus.botUsername}`);
    }
  } catch (e: any) {
    console.warn('⚠️ Could not connect to Telegram on startup:', e.message);
  }

  let offset: number | null = null;

  while (true) {
    try {
      const fetchUrl: string = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=20${offset ? `&offset=${offset}` : ''}`;
      const fetchRes = await fetch(fetchUrl);
      const data: any = await fetchRes.json();

      if (data.ok && Array.isArray(data.result)) {
        daemonStatus.status = daemonStatus.isProcessing ? 'busy' : 'online';
        updateHeartbeat();

        for (const update of data.result) {
          offset = update.update_id + 1;
          const msg = update.message || update.channel_post;
          if (!msg) continue;

          const chatId = msg.chat?.id;
          const text = msg.text ? msg.text.trim() : '';

          if (text.startsWith('/start') || text.startsWith('/help')) {
            const welcome =
              `👋 *Selamat datang ke YAMA Bot!*\n\n` +
              `🚀 *Cara Penggunaan Automatik:*\n` +
              `1. *Hantar terus fail Excel* (\`.xlsx\`) anda ke sini.\n` +
              `2. YAMA Bot akan membaca mapping bilik dan memanggil API Booking.com secara automatik.\n` +
              `3. Fail laporan bertarikh (\`YYYY-MM-DD-Hotel.xlsx\`) dan analisis harga pasaran akan dihantar semula ke sini!\n\n` +
              `🛠 *Perintah Tambahan:*\n` +
              `• \`/dates YYYY-MM-DD YYYY-MM-DD\` - Tukar tarikh semakan (cth: \`/dates 2026-11-10 2026-11-11\`)\n` +
              `• \`/status\` - Semak status bot`;
            await sendTelegramMessage(chatId, welcome, msg.message_id);
          } else if (text.startsWith('/dates')) {
            const parts = text.split(/\s+/);
            if (parts.length >= 3) {
              const [_, arr, dep] = parts;
              userDates.set(chatId, { arrival: arr, departure: dep });
              await sendTelegramMessage(
                chatId,
                `✅ *Tarikh ditetapkan!*\nTarikh Masuk: \`${arr}\`\nTarikh Keluar: \`${dep}\`\n\nSila muat naik fail \`.xlsx\` anda sekarang.`,
                msg.message_id
              );
            } else {
              await sendTelegramMessage(
                chatId,
                `Format: \`/dates YYYY-MM-DD YYYY-MM-DD\`\nContoh: \`/dates 2026-11-01 2026-11-02\``,
                msg.message_id
              );
            }
          } else if (text.startsWith('/status')) {
            await sendTelegramMessage(
              chatId,
              `⚙️ *Status YAMA Bot:*\n` +
              `• Telegram Listener: *Aktif & Online (24/7)*\n` +
              `• RapidAPI Host: \`${RAPIDAPI_HOST}\`\n` +
              `• Mode: *Live Booking.com API*`,
              msg.message_id
            );
          } else if (msg.document) {
            await handleDocumentUpload(chatId, msg);
          }
        }
      }
    } catch (e: any) {
      console.error('Telegram polling error:', e.message);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}

// Start Server & Telegram Daemon
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 YAMA Bot Full-Stack Server running at http://0.0.0.0:${PORT}`);
    // Start Telegram listener inside the same long-running process
    startTelegramPoller();
  });
}

startServer();
