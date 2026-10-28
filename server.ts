/**
 * YAMA Bot - Full-Stack Express Server & Background Telegram Runner
 * Mounts Vite dev middleware on port 3000 and runs:
 * 1. Continuous Telegram Bot listener (@YamaHotelBot)
 * 2. Automated Task Scheduler (Daily / Periodic Auto Price Monitoring & Telegram Alerts)
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ExcelService } from './src/services/excelService';
import { RapidApiService } from './src/services/rapidApiService';
import type { CompetitorRoomMapping, PriceReportRow } from './src/types/yama';
import type { SchedulerConfig, SchedulerLogEntry } from './src/types/scheduler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Environment constraint: Dev server must always bind strictly to port 3000
const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

// Increase payload limit for base64 workbook uploads
app.use(express.json({ limit: '20mb' }));

// Telegram & API Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8806821205:AAF6Z956tPfW2BsnMKzPkDmEzuAj1_5VYFM';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'f659e796f5mshede0a10caa98d60p1f7437jsn2a0469f81edb';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'booking-com15.p.rapidapi.com';
const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID || '54041669';

const STATUS_FILE = path.resolve(__dirname, 'public', 'bot_status.json');
const SCHEDULER_CONFIG_FILE = path.resolve(__dirname, 'scheduler_config.json');
const SCHEDULER_LOGS_FILE = path.resolve(__dirname, 'scheduler_logs.json');
const MASTER_WORKBOOK_FILE = path.resolve(__dirname, 'master_workbook.xlsx');

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

setInterval(updateHeartbeat, 3000);
updateHeartbeat();

// ==========================================
// TASK SCHEDULER STATE & STORAGE
// ==========================================
let schedulerConfig: SchedulerConfig = {
  enabled: false,
  time: '07:00',
  frequency: 'daily',
  targetDaysAhead: 1,
  targetStayNights: 1,
  telegramChatId: OWNER_CHAT_ID,
  hasMasterWorkbook: false,
  masterHotelName: '',
  masterMappedRoomsCount: 0,
  lastRunTime: null,
  lastRunStatus: null,
  nextRunTime: null
};

let schedulerLogs: SchedulerLogEntry[] = [];

// Load persisted scheduler state
try {
  if (fs.existsSync(SCHEDULER_CONFIG_FILE)) {
    const raw = fs.readFileSync(SCHEDULER_CONFIG_FILE, 'utf-8');
    schedulerConfig = { ...schedulerConfig, ...JSON.parse(raw) };
  }
  if (fs.existsSync(SCHEDULER_LOGS_FILE)) {
    const raw = fs.readFileSync(SCHEDULER_LOGS_FILE, 'utf-8');
    schedulerLogs = JSON.parse(raw);
  }
  if (fs.existsSync(MASTER_WORKBOOK_FILE)) {
    const buf = fs.readFileSync(MASTER_WORKBOOK_FILE);
    const parsed = ExcelService.parseWorkbookFromBuffer(buf);
    schedulerConfig.hasMasterWorkbook = true;
    schedulerConfig.masterHotelName = parsed.hotelName;
    schedulerConfig.masterMappedRoomsCount = parsed.mappedRooms.filter(
      r => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
    ).length;
  }
} catch (e: any) {
  console.warn('Could not load scheduler files:', e.message);
}

function saveSchedulerState() {
  try {
    fs.writeFileSync(SCHEDULER_CONFIG_FILE, JSON.stringify(schedulerConfig, null, 2));
    fs.writeFileSync(SCHEDULER_LOGS_FILE, JSON.stringify(schedulerLogs.slice(0, 50), null, 2));
  } catch (err: any) {
    console.error('Failed to save scheduler state:', err.message);
  }
}

function calculateNextRunTime(): string | null {
  if (!schedulerConfig.enabled) return null;
  const now = new Date();
  const [hours, minutes] = schedulerConfig.time.split(':').map(Number);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' });
}

schedulerConfig.nextRunTime = calculateNextRunTime();

// ==========================================
// SCHEDULER & BOT API ROUTES (BEFORE VITE MIDDLEWARE)
// ==========================================
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

app.get('/api/scheduler', (_req, res) => {
  schedulerConfig.nextRunTime = calculateNextRunTime();
  res.json({
    config: schedulerConfig,
    logs: schedulerLogs
  });
});

app.post('/api/scheduler', (req, res) => {
  const updates = req.body;
  schedulerConfig = {
    ...schedulerConfig,
    ...updates,
    nextRunTime: calculateNextRunTime()
  };
  saveSchedulerState();
  res.json({ ok: true, config: schedulerConfig });
});

app.post('/api/scheduler/upload-master', (req, res) => {
  try {
    const { base64, filename } = req.body;
    if (!base64) return res.status(400).json({ error: 'Missing base64 data' });

    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(MASTER_WORKBOOK_FILE, buffer);

    const parsed = ExcelService.parseWorkbookFromBuffer(buffer);
    const activeRooms = parsed.mappedRooms.filter(
      r => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
    );

    schedulerConfig.hasMasterWorkbook = true;
    schedulerConfig.masterHotelName = parsed.hotelName || filename || 'Master Hotel';
    schedulerConfig.masterMappedRoomsCount = activeRooms.length;
    saveSchedulerState();

    res.json({
      ok: true,
      hotelName: schedulerConfig.masterHotelName,
      mappedRoomsCount: schedulerConfig.masterMappedRoomsCount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scheduler/trigger', async (_req, res) => {
  res.json({ ok: true, message: 'Scheduler run triggered in background' });
  runScheduledTask('Manual Trigger from Web UI');
});

// ==========================================
// SCHEDULER EXECUTION CORE
// ==========================================
let isSchedulerRunning = false;
let lastTriggeredDateString = '';

async function runScheduledTask(triggerSource = 'Automated Timer') {
  if (isSchedulerRunning) {
    console.log('⚠️ Scheduled task already running, skipping.');
    return;
  }

  isSchedulerRunning = true;
  schedulerConfig.lastRunStatus = 'running';
  saveSchedulerState();

  const now = new Date();
  const daysAhead = Number(schedulerConfig.targetDaysAhead) || 1;
  const nights = Number(schedulerConfig.targetStayNights) || 1;

  const arrDate = new Date(now.getTime() + daysAhead * 86400000);
  const depDate = new Date(arrDate.getTime() + nights * 86400000);

  const arrivalDate = arrDate.toISOString().slice(0, 10);
  const departureDate = depDate.toISOString().slice(0, 10);

  const logEntry: SchedulerLogEntry = {
    id: `run_${Date.now()}`,
    timestamp: new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' }),
    status: 'running',
    hotelName: schedulerConfig.masterHotelName || 'Hotel',
    arrivalDate,
    departureDate,
    roomsQueried: 0,
    message: `Starting automated extraction (${triggerSource})...`
  };

  schedulerLogs.unshift(logEntry);
  saveSchedulerState();

  try {
    if (!fs.existsSync(MASTER_WORKBOOK_FILE)) {
      throw new Error('Master Workbook file has not been uploaded yet. Please upload a reference .xlsx file first.');
    }

    const buffer = fs.readFileSync(MASTER_WORKBOOK_FILE);
    const parsed = ExcelService.parseWorkbookFromBuffer(buffer);
    const hotelName = parsed.hotelName || schedulerConfig.masterHotelName || 'Hotel';
    const hotelRooms = parsed.hotelRooms || [];
    let mappedRooms = parsed.mappedRooms || [];
    let competitorHotels = parsed.competitorHotels || [];

    let activeRooms: CompetitorRoomMapping[] = mappedRooms.filter(
      r => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
    );

    if (activeRooms.length === 0 && competitorHotels.length > 0) {
      console.log(`⏰ [Scheduler] Auto-resolving competitor_hotel_search for ${competitorHotels.length} hotels...`);
      const resolved = await RapidApiService.resolveCompetitorsAndRooms(
        competitorHotels,
        hotelRooms,
        arrivalDate,
        departureDate,
        RAPIDAPI_KEY,
        RAPIDAPI_HOST
      );
      mappedRooms = resolved.generatedRooms;
      activeRooms = mappedRooms.filter(
        r => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
      );
    }

    if (activeRooms.length === 0) {
      throw new Error('No competitor rooms have been mapped in the Master Workbook.');
    }

    logEntry.hotelName = hotelName;
    logEntry.roomsQueried = activeRooms.length;

    console.log(`⏰ [Scheduler] Running automated extraction for ${hotelName} (${activeRooms.length} rooms)`);

    const targetChat = schedulerConfig.telegramChatId || OWNER_CHAT_ID;
    if (targetChat) {
      await sendTelegramMessage(
        targetChat,
        `⏰ *YAMA Bot: Task Scheduler Auto-Run Triggered!*\n\n` +
        `🏨 *Hotel:* ${hotelName}\n` +
        `📅 *Check Dates:* \`${arrivalDate}\` → \`${departureDate}\`\n` +
        `📊 *Monitored Rooms:* ${activeRooms.length} rooms\n` +
        `⏳ *Status:* Contacting Booking.com API...`
      );
    }

    const { priceReport, updatedRooms } = await RapidApiService.runPriceExtraction(
      hotelRooms,
      activeRooms,
      arrivalDate,
      departureDate,
      RAPIDAPI_KEY,
      RAPIDAPI_HOST
    );

    const outputBuffer = ExcelService.generateOutputWorkbookBuffer(
      hotelName,
      priceReport,
      updatedRooms
    );

    const datePrefix = new Date().toISOString().slice(0, 10);
    const outputFilename = `${datePrefix}-${hotelName}-Auto.xlsx`;

    const summaryLines = priceReport.map((p: PriceReportRow) => {
      const lowStr = typeof p.lowest_competitor_price === 'number' ? `RM ${p.lowest_competitor_price.toFixed(2)}` : 'N/A';
      const avgStr = typeof p.average_competitor_price === 'number' ? `RM ${p.average_competitor_price.toFixed(2)}` : 'N/A';
      return `• *${p.our_room_type}*: Lowest ${lowStr} | Average ${avgStr} (${p.valid_quotes} quotes)`;
    });

    const caption =
      `⏰ *Automated Daily Report Completed!*\n\n` +
      `🏨 *Hotel:* ${hotelName}\n` +
      `📅 *Check Dates:* ${arrivalDate} → ${departureDate}\n` +
      `⏱️ *Execution Time:* ${logEntry.timestamp}\n\n` +
      `📊 *Market Rate Summary:*\n` +
      (summaryLines.length > 0 ? summaryLines.join('\n') : '• No prices found.') +
      `\n\n📁 Complete Excel report workbook attached above.`;

    if (targetChat) {
      await sendTelegramDocument(targetChat, outputBuffer, outputFilename, caption);
    }

    logEntry.status = 'success';
    logEntry.outputFileName = outputFilename;
    logEntry.message = `Successfully extracted prices for ${activeRooms.length} rooms and delivered report to Telegram (${targetChat}).`;
    schedulerConfig.lastRunStatus = 'success';
    schedulerConfig.lastRunTime = logEntry.timestamp;
    schedulerConfig.nextRunTime = calculateNextRunTime();
    console.log(`✅ [Scheduler] Completed successfully for ${hotelName}`);

  } catch (err: any) {
    console.error('❌ [Scheduler Error]:', err.message);
    logEntry.status = 'failed';
    logEntry.message = `Error: ${err.message}`;
    schedulerConfig.lastRunStatus = 'failed';
    schedulerConfig.lastRunTime = logEntry.timestamp;
    schedulerConfig.nextRunTime = calculateNextRunTime();

    const targetChat = schedulerConfig.telegramChatId || OWNER_CHAT_ID;
    if (targetChat) {
      await sendTelegramMessage(
        targetChat,
        `❌ *YAMA Bot Automated Run Error:*\n\`${err.message}\``
      );
    }
  } finally {
    isSchedulerRunning = false;
    saveSchedulerState();
  }
}

// Background scheduler checker (evaluates every 30 seconds)
setInterval(() => {
  if (!schedulerConfig.enabled || isSchedulerRunning) return;

  const now = new Date();
  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentTimeString = `${currentHours}:${currentMinutes}`;
  const currentDateString = now.toISOString().slice(0, 10);

  if (currentTimeString === schedulerConfig.time && lastTriggeredDateString !== currentDateString) {
    lastTriggeredDateString = currentDateString;
    console.log(`⏰ [Scheduler] Time matched (${currentTimeString}). Triggering auto-run...`);
    runScheduledTask('Daily Scheduled Cron');
  }
}, 30000);

// ==========================================
// TELEGRAM BOT HELPERS & HANDLERS
// ==========================================
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
      '⚠️ Please upload a valid Excel workbook (`.xlsx` or `.xls`) exported from YAMA Bot Flow 1.',
      msgId
    );
    return;
  }

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

  daemonStatus.isProcessing = true;
  daemonStatus.status = 'busy';
  daemonStatus.currentTask = `Extracting ${fileName} for ${senderName}...`;
  updateHeartbeat();

  await sendTelegramMessage(
    chatId,
    `📥 *Workbook Received:*\n\`${fileName}\`\n\n` +
    `📅 *Check Dates:* \`${arrivalDate}\` → \`${departureDate}\`\n` +
    `⏳ *Initiating YAMA Bot price extraction...*\n` +
    `Please wait while the bot contacts Booking.com API...`,
    msgId
  );

  await sendTelegramChatAction(chatId, 'upload_document');

  const buffer = await downloadTelegramFile(fileId);
  if (!buffer) {
    await sendTelegramMessage(chatId, '❌ Failed to download file from Telegram. Please resend.', msgId);
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
    let mappedRooms = parsed.mappedRooms || [];
    let competitorHotels = parsed.competitorHotels || [];

    let activeRooms: CompetitorRoomMapping[] = mappedRooms.filter(
      r => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
    );

    // Auto-resolve if competitor_room is empty but competitor_hotel has competitor_hotel_search
    if (activeRooms.length === 0 && competitorHotels.length > 0) {
      console.log(`🔍 [Telegram] Resolving competitor_hotel_search for ${competitorHotels.length} hotels...`);
      await sendTelegramMessage(
        chatId,
        `🔍 Reading \`competitor_hotel_search\` from Tab competitor_hotel...\nAuto-discovering ${competitorHotels.length} hotels & room lists via Booking.com API...`,
        msgId
      );
      const resolved = await RapidApiService.resolveCompetitorsAndRooms(
        competitorHotels,
        hotelRooms,
        arrivalDate,
        departureDate,
        RAPIDAPI_KEY,
        RAPIDAPI_HOST
      );
      competitorHotels = resolved.updatedHotels;
      mappedRooms = resolved.generatedRooms;
      activeRooms = mappedRooms.filter(
        r => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
      );
    }

    if (activeRooms.length === 0) {
      await sendTelegramMessage(
        chatId,
        `⚠️ File \`${fileName}\` does not contain any mapped competitor rooms or competitor_hotel_search entries.\n` +
        `Please open Flow 1 on the website and map your hotel rooms first.`,
        msgId
      );
      daemonStatus.isProcessing = false;
      daemonStatus.status = 'online';
      daemonStatus.currentTask = null;
      updateHeartbeat();
      return;
    }

    console.log(`🏨 Extracting rates for hotel: ${hotelName} (${activeRooms.length} mapped rooms)`);

    // Auto-save uploaded workbook as Master Workbook for the scheduler if none exists
    if (!schedulerConfig.hasMasterWorkbook) {
      fs.writeFileSync(MASTER_WORKBOOK_FILE, buffer);
      schedulerConfig.hasMasterWorkbook = true;
      schedulerConfig.masterHotelName = hotelName;
      schedulerConfig.masterMappedRoomsCount = activeRooms.length;
      saveSchedulerState();
      console.log(`💾 Saved ${fileName} as Master Workbook for automated scheduling.`);
    }

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

    const outputBuffer = ExcelService.generateOutputWorkbookBuffer(
      hotelName,
      priceReport,
      updatedRooms
    );

    const datePrefix = new Date().toISOString().slice(0, 10);
    const outputFilename = `${datePrefix}-${hotelName}.xlsx`;

    const summaryLines = priceReport.map((p: PriceReportRow) => {
      const lowStr = typeof p.lowest_competitor_price === 'number' ? `RM ${p.lowest_competitor_price.toFixed(2)}` : 'N/A';
      const avgStr = typeof p.average_competitor_price === 'number' ? `RM ${p.average_competitor_price.toFixed(2)}` : 'N/A';
      return `• *${p.our_room_type}*: Lowest ${lowStr} | Average ${avgStr} (${p.valid_quotes} quotes)`;
    });

    const caption =
      `✅ *Price Extraction Completed!*\n\n` +
      `📍 *Hotel:* ${hotelName}\n` +
      `📅 *Dates:* ${arrivalDate} → ${departureDate}\n\n` +
      `📊 *Market Rate Summary:*\n` +
      (summaryLines.length > 0 ? summaryLines.join('\n') : '• No prices found.') +
      `\n\n📁 Complete Excel report workbook attached above.`;

    await sendTelegramDocument(chatId, outputBuffer, outputFilename, caption);
    console.log(`🚀 Report sent to chat ${chatId} (${senderName})`);

    if (String(chatId) !== String(OWNER_CHAT_ID) && OWNER_CHAT_ID) {
      await sendTelegramMessage(
        OWNER_CHAT_ID,
        `🔔 *Owner Notification:*\n` +
        `User *${senderName}* (ID: \`${chatId}\`) just processed file \`${fileName}\` for hotel *${hotelName}* via @${daemonStatus.botUsername}.`
      );
    }

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
      `❌ *Error during price extraction:*\n\`${err.message || err}\`\n\n` +
      `Please ensure the sheet format is valid.`,
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
              `👋 *Welcome to YAMA Bot!*\n\n` +
              `🚀 *How to Use:*\n` +
              `1. *Send your Excel workbook* (\`.xlsx\`) directly here.\n` +
              `2. YAMA Bot reads the room mappings and queries Booking.com API automatically.\n` +
              `3. The dated Excel report workbook (\`YYYY-MM-DD-Hotel.xlsx\`) and market price analysis will be sent back directly here!\n\n` +
              `⏰ *Task Scheduler Status:*\n` +
              `Status: *${schedulerConfig.enabled ? `Active (Daily at ${schedulerConfig.time})` : 'Inactive'}*\n` +
              `Next Run: \`${schedulerConfig.nextRunTime || 'None'}\`\n\n` +
              `🛠 *Commands:*\n` +
              `• \`/dates YYYY-MM-DD YYYY-MM-DD\` - Set custom check-in and check-out dates\n` +
              `• \`/scheduler\` - Check automated scheduler status\n` +
              `• \`/status\` - Check bot daemon status`;
            await sendTelegramMessage(chatId, welcome, msg.message_id);
          } else if (text.startsWith('/scheduler')) {
            await sendTelegramMessage(
              chatId,
              `⏰ *YAMA Task Scheduler Status:*\n` +
              `• Auto-Run: *${schedulerConfig.enabled ? 'ACTIVE (ON)' : 'INACTIVE (OFF)'}*\n` +
              `• Run Time: *${schedulerConfig.time}*\n` +
              `• Frequency: *${schedulerConfig.frequency}*\n` +
              `• Master Hotel: *${schedulerConfig.masterHotelName || 'Not Set'}*\n` +
              `• Monitored Rooms: *${schedulerConfig.masterMappedRoomsCount} rooms*\n` +
              `• Last Run: \`${schedulerConfig.lastRunTime || 'Never'}\`\n` +
              `• Next Run: \`${schedulerConfig.nextRunTime || 'None'}\``,
              msg.message_id
            );
          } else if (text.startsWith('/dates')) {
            const parts = text.split(/\s+/);
            if (parts.length >= 3) {
              const [_, arr, dep] = parts;
              userDates.set(chatId, { arrival: arr, departure: dep });
              await sendTelegramMessage(
                chatId,
                `✅ *Dates set successfully!*\nCheck-in: \`${arr}\`\nCheck-out: \`${dep}\`\n\nPlease upload your \`.xlsx\` workbook now.`,
                msg.message_id
              );
            } else {
              await sendTelegramMessage(
                chatId,
                `Format: \`/dates YYYY-MM-DD YYYY-MM-DD\`\nExample: \`/dates 2026-11-01 2026-11-02\``,
                msg.message_id
              );
            }
          } else if (text.startsWith('/status')) {
            await sendTelegramMessage(
              chatId,
              `⚙️ *YAMA Bot Status:*\n` +
              `• Telegram Listener: *Active & Online (24/7)*\n` +
              `• RapidAPI Host: \`${RAPIDAPI_HOST}\`\n` +
              `• Scheduler: *${schedulerConfig.enabled ? 'Active' : 'Inactive'}*\n` +
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
  // IMPORTANT: Vite middlewares must be mounted AFTER API routes so /api/* is handled by Express
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
    startTelegramPoller();
  });
}

startServer();
