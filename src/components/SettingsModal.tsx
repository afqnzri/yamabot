import React, { useState } from 'react';
import { 
  X, 
  Key, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  ShieldCheck, 
  Cloud, 
  Terminal, 
  Code2, 
  Copy, 
  Check, 
  Download, 
  Zap,
  SlidersHorizontal
} from 'lucide-react';
import { TelegramService } from '../services/telegramService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rapidApiKey: string;
  setRapidApiKey: (key: string) => void;
  rapidApiHost: string;
  setRapidApiHost: (host: string) => void;
  telegramToken: string;
  setTelegramToken: (token: string) => void;
  telegramChatId: string;
  setTelegramChatId: (chatId: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  rapidApiKey,
  setRapidApiKey,
  rapidApiHost,
  setRapidApiHost,
  telegramToken,
  setTelegramToken,
  telegramChatId,
  setTelegramChatId
}) => {
  const [activeSection, setActiveSection] = useState<'api' | 'cloudflare' | 'python'>('api');
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: ''
  });

  // Python tab state
  const [activeScriptTab, setActiveScriptTab] = useState<'listener' | 'flow2' | 'flow1' | 'excel' | 'api' | 'telegram' | 'cron'>('listener');
  const [copied, setCopied] = useState(false);
  const [detectingChatId, setDetectingChatId] = useState(false);

  if (!isOpen) return null;

  const handleTestTelegram = async () => {
    if (!telegramToken.trim()) {
      setTelegramStatus({ type: 'error', message: 'Please enter a Telegram Bot Token first.' });
      return;
    }
    setTestingTelegram(true);
    setTelegramStatus({ type: 'idle', message: '' });

    const botCheck = await TelegramService.testBotToken(telegramToken);
    if (!botCheck.ok) {
      setTelegramStatus({ type: 'error', message: `Bot check failed: ${botCheck.error}` });
      setTestingTelegram(false);
      return;
    }

    if (telegramChatId.trim()) {
      const sendCheck = await TelegramService.sendMessage(
        telegramToken,
        telegramChatId,
        `👋 *YAMA Bot Connected!*\nConnection test successful. Hotel price monitoring reports will be delivered here.`
      );
      if (sendCheck.ok) {
        setTelegramStatus({
          type: 'success',
          message: `Successfully connected to @${botCheck.botName || 'Bot'}! A test message has been sent to the chat.`
        });
      } else {
        setTelegramStatus({
          type: 'error',
          message: `Bot is valid (@${botCheck.botName}), but failed to send message: ${sendCheck.error}. Please ensure you have sent /start to the bot.`
        });
      }
    } else {
      setTelegramStatus({
        type: 'success',
        message: `Token valid! Bot: @${botCheck.botName}. Enter a Chat ID to test sending messages.`
      });
    }

    setTestingTelegram(false);
  };

  const handleAutoDetectChatId = async () => {
    if (!telegramToken.trim()) {
      setTelegramStatus({ type: 'error', message: 'Please enter a Telegram Bot Token first.' });
      return;
    }
    setDetectingChatId(true);
    setTelegramStatus({ type: 'idle', message: '' });
    const res = await TelegramService.getLatestChatId(telegramToken);
    if (res.ok && res.chatId) {
      setTelegramChatId(res.chatId);
      setTelegramStatus({
        type: 'success',
        message: `Chat ID (${res.chatId}) from "${res.senderName}" successfully detected and saved!`
      });
    } else {
      setTelegramStatus({
        type: 'error',
        message: res.error || 'Failed to detect Chat ID. Please open @YamaHotelBot on Telegram and press START first.'
      });
    }
    setDetectingChatId(false);
  };

  const scripts = {
    listener: {
      name: 'telegram_bot_listener.py',
      description: 'Interactive Telegram Bot: Receive .xlsx file uploads directly in Telegram chat & auto-run Flow 2!',
      code: `"""
YAMA Bot - Interactive Telegram Auto-Runner Daemon
Run this bot on your PC or server:
  python -m yama_bot.telegram_bot_listener

How to use:
1. Drag & drop your Flow 1 mapping .xlsx file directly into your Telegram bot chat.
2. The bot downloads the file and automatically executes Flow 2 (Booking.com API).
3. The bot sends back the dated Excel file (YYYY-MM-DD-Hotel.xlsx) and market rate analysis!
"""
from yama_bot.telegram_bot_listener import main

if __name__ == "__main__":
    main()`
    },
    flow2: {
      name: 'flow2_extract.py',
      description: 'Periodic competitor price extraction script matching room IDs and dispatching to Telegram.',
      code: `"""
YAMA Bot: Flow 2 - Recurring Competitor Price Extraction
"""
import sys, argparse
from pathlib import Path
from datetime import datetime, timedelta
from .config import INPUT_DIR, OUTPUT_DIR, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
from .rapidapi_client import RapidApiBookingClient
from .excel_engine import ExcelEngine
from .telegram_notifier import TelegramNotifier

def run_flow2_extraction(input_workbook_path: Path, arrival_date: str, departure_date: str, send_telegram: bool = True):
    wb_data = ExcelEngine.load_input_workbook(input_workbook_path)
    active_mappings = [r for r in wb_data["competitor_room"] if r.get("our_room_type") and r["our_room_type"] not in ["UNMAPPED", "IGNORE", ""]]
    unique_hotel_ids = sorted(list(set(str(r["competitor_hotel_id"]).strip() for r in active_mappings)))

    client = RapidApiBookingClient()
    api_records = []
    for h_id in unique_hotel_ids:
        api_records.extend(client.get_room_list(h_id, arrival_date, departure_date))

    date_prefix = datetime.now().strftime("%Y-%m-%d")
    output_path = OUTPUT_DIR / f"{date_prefix}-{wb_data['hotel_name']}.xlsx"
    out_file = ExcelEngine.generate_output_workbook(output_path, wb_data["hotel_name"], wb_data["hotel_data"], active_mappings, api_records, arrival_date, departure_date)

    notifier = TelegramNotifier(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
    if send_telegram and notifier.is_configured:
        notifier.send_workbook(out_file, caption=f"📊 YAMA Bot Alert: {out_file.name}")
    return out_file`
    },
    flow1: {
      name: 'flow1_setup.py',
      description: 'Competitor discovery & room onboarding script using Booking.com API.',
      code: `"""
YAMA Bot: Flow 1 - Initial Hotel and Room Mapping Setup
"""
from pathlib import Path
from .config import INPUT_DIR
from .rapidapi_client import RapidApiBookingClient
from .excel_engine import ExcelEngine

def run_flow1_setup(hotel_name: str, hotel_rooms: list, competitor_queries: list):
    client = RapidApiBookingClient()
    # Search destination -> Get Hotel Details -> Get Room List -> Save Input Workbook
    target = INPUT_DIR / f"{hotel_name}.xlsx"
    print(f"Workbook template created at: {target}")`
    },
    excel: {
      name: 'excel_engine.py',
      description: 'Excel engine handling 4 input sheets and 2 output sheets (openpyxl).',
      code: `"""
Excel Engine for YAMA Bot (Requirements v3)
Rule: Missing prices are marked N/A and excluded from average/lowest calculations; never 0.
"""
import openpyxl
from pathlib import Path

class ExcelEngine:
    @staticmethod
    def generate_output_workbook(output_path, hotel_name, hotel_rooms, mapped_rooms, api_room_records, arrival_date, departure_date):
        wb = openpyxl.Workbook()
        wb.remove(wb.active)
        ws_room = wb.create_sheet(title="competitor_room")
        ws_price = wb.create_sheet(title="competitor_price")
        # Appends records and saves output workbook
        wb.save(output_path)
        return output_path`
    },
    api: {
      name: 'rapidapi_client.py',
      description: 'Booking.com API client on RapidAPI.',
      code: `import requests
class RapidApiBookingClient:
    def __init__(self, api_key=None, api_host="booking-com15.p.rapidapi.com"):
        self.headers = {"x-rapidapi-key": api_key, "x-rapidapi-host": api_host}
    def search_hotel_destination(self, query):
        return requests.get(f"https://{self.headers['x-rapidapi-host']}/api/v1/hotels/searchDestination", headers=self.headers, params={"query": query}).json().get("data", [])`
    },
    telegram: {
      name: 'telegram_notifier.py',
      description: 'Dispatches rate summaries and Excel files directly to Telegram.',
      code: `import requests
from pathlib import Path
class TelegramNotifier:
    def __init__(self, bot_token, chat_id):
        self.bot_token, self.chat_id = bot_token, chat_id
    def send_workbook(self, file_path: Path, caption=""):
        with open(file_path, "rb") as f:
            return requests.post(f"https://api.telegram.org/bot{self.bot_token}/sendDocument", data={"chat_id": self.chat_id, "caption": caption}, files={"document": (file_path.name, f)}).json()`
    },
    cron: {
      name: 'daily_price_monitor.yml',
      description: 'GitHub Actions daily cron workflow for 100% free automated extraction.',
      code: `name: YAMA Bot - Daily Competitor Price Extraction
on:
  schedule:
    - cron: '0 7 * * *'
  workflow_dispatch:
jobs:
  run-bot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.10' }
      - run: pip install -r yama_bot/requirements.txt
      - env:
          RAPIDAPI_KEY: \${{ secrets.RAPIDAPI_KEY }}
          TELEGRAM_BOT_TOKEN: \${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: \${{ secrets.TELEGRAM_CHAT_ID }}
        run: python -m yama_bot.flow2_extract --telegram`
    }
  };

  const handleCopyCode = () => {
    const s = scripts[activeScriptTab] || scripts.listener;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(s.code).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadScript = () => {
    const s = scripts[activeScriptTab] || scripts.listener;
    const blob = new Blob([s.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = s.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold">System Settings & Configuration</h2>
              <p className="text-xs text-slate-400">Manage API keys, Telegram bot, Cloudflare & automation scripts in one place</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Unified Sub-Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 shrink-0">
          <button
            onClick={() => setActiveSection('api')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
              activeSection === 'api'
                ? 'border-blue-600 bg-white text-blue-700 shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            API & Telegram
          </button>

          <button
            onClick={() => setActiveSection('cloudflare')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
              activeSection === 'cloudflare'
                ? 'border-orange-500 bg-white text-orange-700 shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            Cloudflare Deployment
          </button>

          <button
            onClick={() => setActiveSection('python')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
              activeSection === 'python'
                ? 'border-emerald-600 bg-white text-emerald-700 shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Python Scripts
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: API & Telegram */}
          {activeSection === 'api' && (
            <div className="space-y-6">
              {/* RapidAPI */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Key className="w-4 h-4 text-blue-600" />
                    RapidAPI Key (Booking.com API)
                  </label>
                  <a
                    href="https://rapidapi.com/apidojo/api/booking"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Get Key on RapidAPI <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <input
                  type="password"
                  value={rapidApiKey}
                  onChange={(e) => setRapidApiKey(e.target.value)}
                  placeholder="e.g. 74d89a2468msh... (Leave empty for Simulation Mode)"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">RapidAPI Host:</span>
                  <input
                    type="text"
                    value={rapidApiHost}
                    onChange={(e) => setRapidApiHost(e.target.value)}
                    placeholder="booking-com15.p.rapidapi.com"
                    className="flex-1 px-2.5 py-1 text-xs rounded border border-slate-200 focus:outline-none font-mono"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  💡 <strong>Simulation Mode:</strong> If you do not provide an API key, the system automatically generates realistic Booking.com market rates so you can test all features without consuming API quota.
                </p>
              </div>

              <hr className="border-slate-200" />

              {/* Telegram */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Send className="w-4 h-4 text-emerald-600" />
                    Telegram Bot Notifications (Flow 2 & Auto-Runner)
                  </label>
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Create Bot at @BotFather <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Telegram Bot Token</label>
                  <input
                    type="password"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="e.g. 7123456789:AAFx... from @BotFather"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600 font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-slate-600">Telegram Chat ID</label>
                    <a
                      href="https://t.me/YamaHotelBot"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                    >
                      Open @YamaHotelBot in Telegram <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="e.g. 123456789 or click 'Detect Chat ID'"
                      className="flex-1 px-3.5 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAutoDetectChatId}
                      disabled={detectingChatId}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors shrink-0"
                    >
                      {detectingChatId ? 'Detecting...' : 'Detect Chat ID'}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Open <code>@YamaHotelBot</code> in Telegram, press <strong>START</strong>, then click <strong>Detect Chat ID</strong> above.
                  </span>
                </div>

                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    onClick={handleTestTelegram}
                    disabled={testingTelegram}
                    className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors flex items-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {testingTelegram ? 'Testing Connection...' : 'Test Telegram Connection'}
                  </button>
                </div>

                {telegramStatus.type !== 'idle' && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                      telegramStatus.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {telegramStatus.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span>{telegramStatus.message}</span>
                  </div>
                )}

                {/* Telegram Bot Auto-Runner Callout */}
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5 text-xs text-blue-900">
                  <div className="font-bold flex items-center gap-1.5 text-blue-950">
                    <Zap className="w-4 h-4 text-blue-600" />
                    Upload Files Directly from Telegram & Auto-Run!
                  </div>
                  <p className="text-blue-800 leading-relaxed text-[11px]">
                    You can send your mapping <code>.xlsx</code> file directly into your Telegram bot chat without opening a browser. The background runner downloads the file, runs Flow 2 with Booking.com API automatically, and replies with your dated report file directly in chat!
                  </p>
                  <p className="text-[11px] font-mono bg-blue-100/80 p-1.5 rounded text-blue-950">
                    $ python -m yama_bot.telegram_bot_listener
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Cloudflare Deployment */}
          {activeSection === 'cloudflare' && (
            <div className="space-y-5 text-xs text-slate-700">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-900 text-xs">
                    Yes, this application can be deployed to Cloudflare Pages 100% free!
                  </h4>
                  <p className="text-emerald-800 mt-0.5 leading-relaxed">
                    The frontend web app is built with Vite + React and can be hosted on Cloudflare Pages with automatic SSL. For daily price monitoring without opening your laptop, use the included free GitHub Actions cron workflow.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-orange-500" />
                  Steps to Deploy on Cloudflare Pages:
                </h4>

                <div className="p-3 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px] space-y-1">
                  <p className="text-slate-400"># Option 1: Direct Deploy from Git (Recommended)</p>
                  <p>1. Open <strong>Cloudflare Dashboard &gt; Workers &amp; Pages &gt; Create Application &gt; Pages</strong></p>
                  <p>2. Connect your GitHub repository</p>
                  <p>3. Framework preset: <span className="text-amber-300">Vite</span></p>
                  <p>4. Build command: <span className="text-amber-300">npm run build</span></p>
                  <p>5. Build output directory: <span className="text-amber-300">dist</span></p>
                </div>

                <div className="p-3 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px] space-y-1">
                  <p className="text-slate-400"># Option 2: Deploy using Wrangler CLI from Terminal</p>
                  <p>npm run build</p>
                  <p>npx wrangler pages deploy dist --project-name=yama-bot</p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="font-bold text-slate-800">Daily Cron Automation (Free):</div>
                  <p className="text-slate-600">
                    Add secrets <code>RAPIDAPI_KEY</code>, <code>TELEGRAM_BOT_TOKEN</code>, and <code>TELEGRAM_CHAT_ID</code> in GitHub Repo &gt; Settings &gt; Secrets. The file <code>.github/workflows/daily_price_monitor.yml</code> will automatically extract prices every day and deliver them to your Telegram!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Python Scripts */}
          {activeSection === 'python' && (
            <div className="space-y-4">
              <div className="flex border-b border-slate-200 gap-1.5 overflow-x-auto pb-1 text-xs">
                {[
                  { id: 'listener', label: 'telegram_listener.py (Auto-Run)' },
                  { id: 'flow2', label: 'flow2_extract.py' },
                  { id: 'flow1', label: 'flow1_setup.py' },
                  { id: 'excel', label: 'excel_engine.py' },
                  { id: 'api', label: 'rapidapi_client.py' },
                  { id: 'telegram', label: 'telegram_notifier.py' },
                  { id: 'cron', label: 'daily_monitor.yml' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveScriptTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold shrink-0 transition-colors ${
                      activeScriptTab === tab.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">{(scripts[activeScriptTab] || scripts.listener).description}</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-semibold flex items-center gap-1 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy Code'}
                  </button>
                  <button
                    onClick={handleDownloadScript}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download Script
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-[11px] max-h-60 overflow-y-auto leading-relaxed">
                <pre>{(scripts[activeScriptTab] || scripts.listener).code}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Configuration is safely stored in your local browser
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
