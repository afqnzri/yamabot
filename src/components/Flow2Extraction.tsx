import React, { useState } from 'react';
import { 
  Play, 
  Download, 
  Send, 
  Calendar, 
  FileSpreadsheet, 
  RefreshCw, 
  Upload, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Terminal, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  FileText,
  Database
} from 'lucide-react';
import { HotelRoomType, CompetitorRoomMapping, PriceReportRow, ExtractionResult } from '../types/yama';
import { RapidApiService } from '../services/rapidApiService';
import { ExcelService } from '../services/excelService';
import { TelegramService } from '../services/telegramService';
import { DbClientService } from '../services/dbClientService';

interface Flow2ExtractionProps {
  hotelName: string;
  hotelRooms: HotelRoomType[];
  mappedRooms: CompetitorRoomMapping[];
  rapidApiKey: string;
  rapidApiHost: string;
  telegramToken: string;
  telegramChatId: string;
  onOpenSettings: () => void;
  onUploadWorkbook: (file: File, autoRun?: boolean) => Promise<any>;
  uploadedFileName?: string | null;
  onSwitchToFlow1: () => void;
  onOpenDatabase?: () => void;
  botStatus?: {
    isOnline: boolean;
    isBusy: boolean;
    currentTask: string | null;
    lastCompletedFile: string | null;
    lastCompletedAt: string | null;
    processedCount: number;
    botUsername: string;
  };
}

export const Flow2Extraction: React.FC<Flow2ExtractionProps> = ({
  hotelName,
  hotelRooms,
  mappedRooms,
  rapidApiKey,
  rapidApiHost,
  telegramToken,
  telegramChatId,
  onOpenSettings,
  onUploadWorkbook,
  uploadedFileName,
  onSwitchToFlow1,
  onOpenDatabase,
  botStatus
}) => {
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const today = new Date();
  const defaultArrival = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  const defaultDeparture = new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10);

  const [arrivalDate, setArrivalDate] = useState(defaultArrival);
  const [departureDate, setDepartureDate] = useState(defaultDeparture);

  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);

  const [outputSheetTab, setOutputSheetTab] = useState<'competitor_price' | 'competitor_room'>('competitor_price');
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);

  // Telegram Live Monitor state
  const [checkingTelegram, setCheckingTelegram] = useState(false);
  const [telegramLogs, setTelegramLogs] = useState<any[] | null>(null);
  const [botInfo, setBotInfo] = useState<{ name: string; username: string } | null>(null);
  const [showTelegramLogs, setShowTelegramLogs] = useState(false);

  const handleCheckTelegram = async () => {
    if (!telegramToken) {
      onOpenSettings();
      return;
    }
    setCheckingTelegram(true);
    const res = await TelegramService.getRecentActivity(telegramToken);
    if (res.ok) {
      setTelegramLogs(res.recentUpdates || []);
      if (res.botInfo) setBotInfo(res.botInfo);
      setShowTelegramLogs(true);
    } else {
      setUploadMessage(`Telegram check error: ${res.error}`);
    }
    setCheckingTelegram(false);
  };

  const activeMappedRooms = mappedRooms.filter(
    r => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
  );

  const handleRunExtraction = async () => {
    if (activeMappedRooms.length === 0) {
      setUploadMessage("No mapped competitor rooms found. Please complete room mapping in Flow 1 first.");
      return;
    }

    setExtracting(true);
    setProgress(10);
    setStatusMessage('Initiating YAMA Bot price extraction...');

    try {
      const { priceReport, updatedRooms } = await RapidApiService.runPriceExtraction(
        hotelRooms,
        mappedRooms,
        arrivalDate,
        departureDate,
        rapidApiKey,
        rapidApiHost,
        (pct, text) => {
          setProgress(pct);
          setStatusMessage(text);
        }
      );

      const datePrefix = new Date().toISOString().slice(0, 10);
      const result: ExtractionResult = {
        runDate: datePrefix,
        arrivalDate,
        departureDate,
        hotelName,
        outputWorkbookName: `${datePrefix}-${hotelName}.xlsx`,
        priceReport,
        updatedRooms
      };

      setExtractionResult(result);
      setStatusMessage('Price analysis completed!');
      
      // Auto-save run to Cloudflare D1 / SQLite database
      DbClientService.recordRun(result).catch(e => {
        console.warn('Could not record run to database:', e);
      });
    } catch (err: any) {
      setStatusMessage(`Extraction error: ${err.message}`);
    } finally {
      setExtracting(false);
    }
  };

  const handleDownloadOutputWorkbook = () => {
    if (!extractionResult) return;
    ExcelService.exportOutputWorkbook(
      extractionResult.hotelName,
      extractionResult.arrivalDate,
      extractionResult.departureDate,
      extractionResult.priceReport,
      extractionResult.updatedRooms,
      true // Download to PC only when explicitly requested
    );
  };

  const handleSendTelegram = async () => {
    if (!extractionResult) return;
    if (!telegramToken || !telegramChatId) {
      onOpenSettings();
      return;
    }

    setSendingTelegram(true);
    setTelegramStatus(null);

    try {
      const { filename, blob } = ExcelService.exportOutputWorkbook(
        extractionResult.hotelName,
        extractionResult.arrivalDate,
        extractionResult.departureDate,
        extractionResult.priceReport,
        extractionResult.updatedRooms,
        false
      );

      const lines = [
        `🏨 *YAMA Bot Alert: ${extractionResult.hotelName}*`,
        `📅 *Dates:* ${extractionResult.arrivalDate} → ${extractionResult.departureDate}`,
        ``,
        `📊 *Market Price Summary:*`
      ];

      extractionResult.priceReport.forEach(p => {
        const lowest = typeof p.lowest_competitor_price === 'number' ? `RM ${p.lowest_competitor_price.toFixed(2)}` : 'N/A';
        const avg = typeof p.average_competitor_price === 'number' ? `RM ${p.average_competitor_price.toFixed(2)}` : 'N/A';
        lines.push(`• *${p.our_room_type}*: Lowest ${lowest} | Average ${avg} (${p.valid_quotes} quotes)`);
      });

      lines.push(``);
      lines.push(`📁 Attached Excel report: \`${filename}\``);

      const res = await TelegramService.sendDocument(
        telegramToken,
        telegramChatId,
        blob,
        filename,
        lines.join('\n')
      );

      if (res.ok) {
        setTelegramStatus('Report and Excel workbook sent to Telegram successfully!');
      } else {
        setTelegramStatus(`Failed to send to Telegram: ${res.error}`);
      }
    } catch (e: any) {
      setTelegramStatus(`Error: ${e.message}`);
    } finally {
      setSendingTelegram(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, autoRun: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    setUploadMessage(null);
    try {
      const data = await onUploadWorkbook(file);
      setUploadMessage(`Successfully imported "${file.name}" (${data.mappedRooms.length} room mappings).`);
      if (autoRun) {
        setTimeout(() => {
          handleRunExtraction();
        }, 300);
      }
    } catch (err: any) {
      setUploadMessage(`Failed to read Excel workbook: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Flow 2: Recurring Competitor Price Extraction
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Extract live competitor rates from Booking.com for mapped rooms and generate structured report workbooks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenDatabase && (
            <button
              onClick={onOpenDatabase}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              title="View past extraction runs stored in the database"
            >
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>DB History</span>
            </button>
          )}

          <label className="cursor-pointer px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 shadow-xs">
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>{uploadLoading ? 'Reading...' : 'Upload .xlsx'}</span>
            <input
              type="file"
              accept=".xlsx, .xls"
              disabled={uploadLoading}
              onChange={(e) => handleFileChange(e, false)}
              className="hidden"
            />
          </label>

          <label className="cursor-pointer px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs">
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Upload & Auto-Run</span>
            <input
              type="file"
              accept=".xlsx, .xls"
              disabled={uploadLoading}
              onChange={(e) => handleFileChange(e, true)}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {uploadMessage && (
        <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center justify-between">
          <span>{uploadMessage}</span>
          <button onClick={() => setUploadMessage(null)} className="underline text-[11px] font-semibold">Dismiss</button>
        </div>
      )}

      {telegramStatus && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
          <span>{telegramStatus}</span>
          <button onClick={() => setTelegramStatus(null)} className="underline text-[11px] font-semibold">Dismiss</button>
        </div>
      )}

      {/* Telegram Bot Live Status & Monitor Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              <span className={`w-2.5 h-2.5 rounded-full ${
                botStatus?.isBusy
                  ? 'bg-amber-500 animate-pulse'
                  : botStatus?.isOnline
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-rose-500'
              }`} />
              {botStatus?.isOnline && (
                <span className={`w-4 h-4 rounded-full absolute ${
                  botStatus?.isBusy ? 'bg-amber-400/30' : 'bg-emerald-400/30'
                }`} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-xs text-slate-900">
                  Telegram Bot Auto-Runner:
                </span>
                <a
                  href={`https://t.me/${botStatus?.botUsername || 'YamaHotelBot'}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  @{botStatus?.botUsername || 'YamaHotelBot'} <ExternalLink className="w-3 h-3" />
                </a>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  botStatus?.isBusy
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : botStatus?.isOnline
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {botStatus?.isBusy ? 'PROCESSING' : botStatus?.isOnline ? 'LIVE (ONLINE)' : 'OFFLINE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {botStatus?.isBusy
                  ? `Processing file from Telegram: ${botStatus.currentTask || ''}`
                  : botStatus?.isOnline
                    ? `Daemon is actively listening to Telegram (${botStatus.processedCount} files processed this session)`
                    : 'Daemon is offline. Please make sure the server process is running.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCheckTelegram}
              disabled={checkingTelegram}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 shrink-0"
            >
              <RefreshCw className={`w-3 h-3 ${checkingTelegram ? 'animate-spin' : ''}`} />
              <span>{checkingTelegram ? 'Checking...' : 'Check Telegram Activity'}</span>
            </button>
            {telegramLogs && (
              <button
                onClick={() => setShowTelegramLogs(!showTelegramLogs)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 text-xs font-medium"
                title="Toggle Log View"
              >
                {showTelegramLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Live Processing Notice */}
        {botStatus?.isBusy && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
            <span className="font-medium">Running Telegram Task: {botStatus.currentTask || 'Extracting prices...'}</span>
          </div>
        )}

        {/* Multi-User Support Notice */}
        <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-lg text-xs text-blue-900 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-blue-950 text-[11px]">
            <span>👥 Multi-User Support:</span>
          </div>
          <p className="text-[11px] text-blue-800 leading-relaxed">
            Any user (hotel staff, managers, colleagues) sending a <code>.xlsx</code> file to <strong>@{botStatus?.botUsername || 'YamaHotelBot'}</strong> will receive the price report directly in their own chat. Output is not restricted to a single account!
          </p>
        </div>

        {/* 3 Visual Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[10px] flex items-center justify-center font-bold">1</span>
              <span>Instant Telegram Reply</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              When a .xlsx file is sent, the bot immediately confirms: <em>"📥 Workbook Received... ⏳ Initiating extraction..."</em>.
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[10px] flex items-center justify-center font-bold">2</span>
              <span>Telegram Action Status</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              While querying the Booking.com API, the chat header shows <span className="font-semibold text-slate-700">"yamabot is sending a file..."</span>.
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[10px] flex items-center justify-center font-bold">3</span>
              <span>Delivered Excel Report</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              The bot delivers the dated Excel report <span className="font-mono text-[10px]">YYYY-MM-DD-Hotel.xlsx</span> with market price recommendations directly to your chat.
            </p>
          </div>
        </div>

        {/* Live Telegram Recent Messages Log */}
        {showTelegramLogs && telegramLogs && (
          <div className="mt-2 pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
              <span>Recent Messages / Files Received by @{botInfo?.username || 'YamaHotelBot'}:</span>
              <span>{telegramLogs.length} activity records</span>
            </div>

            {telegramLogs.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg text-center">
                No new messages received yet. Open <a href="https://t.me/YamaHotelBot" target="_blank" rel="noreferrer" className="text-blue-600 underline">@YamaHotelBot</a> and send a message or .xlsx workbook!
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {telegramLogs.map((log, idx) => (
                  <div key={`telegram_log_${log.updateId || idx}_${idx}`} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/60 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{log.sender}:</span>
                      {log.documentName ? (
                        <span className="flex items-center gap-1 font-mono text-[11px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                          <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                          {log.documentName}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">"{log.text || 'Message'}"</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">{log.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control Card: Dates & Extraction Action */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Arrival Date:</span>
              <div className="relative">
                <input
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                />
              </div>
            </div>

            <span className="text-slate-300 hidden sm:inline">→</span>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Departure Date:</span>
              <div className="relative">
                <input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                />
              </div>
            </div>

            <span className="text-xs text-slate-400 pl-1">
              · {activeMappedRooms.length} rooms tracked ({hotelName || 'Hotel'})
            </span>
          </div>

          <button
            onClick={handleRunExtraction}
            disabled={extracting}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-xs"
          >
            {extracting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{extracting ? 'Extracting Rates...' : 'Start Price Extraction'}</span>
          </button>
        </div>

        {extracting && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-600 font-medium">
              <span>{statusMessage}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-slate-900 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Results or Empty State */}
      {!extractionResult ? (
        <div className="bg-white rounded-xl p-10 border border-slate-200 text-center space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-5 h-5 text-slate-500" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-slate-900">Ready to Extract Competitor Rates</h3>
            <p className="text-xs text-slate-500 mt-1">
              Select dates above and click <strong>"Start Price Extraction"</strong> to fetch live Booking.com rates and calculate lowest and average competitor prices.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Metrics summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-[11px] font-medium text-slate-500">Tracked Room Types</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {extractionResult.priceReport.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {extractionResult.updatedRooms.length} competitor records
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-[11px] font-medium text-slate-500">Lowest Market Rate</div>
              <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                RM {
                  Math.min(
                    ...extractionResult.priceReport
                      .map(p => typeof p.lowest_competitor_price === 'number' ? p.lowest_competitor_price : 9999)
                  )
                }
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Valid competitor floor rate
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-[11px] font-medium text-slate-500">Generated Output File</div>
              <div className="text-xs font-mono font-semibold text-slate-800 truncate mt-1">
                {extractionResult.outputWorkbookName}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Original input file untouched
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="text-[11px] font-medium text-slate-500">Telegram Notification</div>
              <div className="mt-1">
                <button
                  onClick={handleSendTelegram}
                  disabled={sendingTelegram}
                  className="w-full py-1.5 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5 text-slate-600" />
                  <span>{sendingTelegram ? 'Sending...' : 'Send to Telegram'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Output Workbook View */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
                <button
                  onClick={() => setOutputSheetTab('competitor_price')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    outputSheetTab === 'competitor_price'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sheet: competitor_price
                </button>
                <button
                  onClick={() => setOutputSheetTab('competitor_room')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    outputSheetTab === 'competitor_room'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sheet: competitor_room
                </button>
              </div>

              <button
                onClick={handleDownloadOutputWorkbook}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Excel File (.xlsx)</span>
              </button>
            </div>

            {/* competitor_price Sheet */}
            {outputSheetTab === 'competitor_price' && (
              <div className="p-5">
                <div className="mb-3">
                  <h4 className="font-semibold text-slate-900 text-xs">
                    Market Price Summary Report
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Averages and valid minimums are calculated excluding missing rates (N/A is never treated as 0).
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                        <th className="py-2.5 px-3">Our Room Type</th>
                        <th className="py-2.5 px-3">Min Limit</th>
                        <th className="py-2.5 px-3">Max Limit</th>
                        <th className="py-2.5 px-3 font-semibold text-slate-900">Lowest Rate</th>
                        <th className="py-2.5 px-3 font-semibold text-slate-900">Average Rate</th>
                        <th className="py-2.5 px-3 text-center">Quotes</th>
                        <th className="py-2.5 px-3">Pricing Recommendation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {extractionResult.priceReport.map((p, idx) => (
                        <tr key={`price_report_row_${p.our_room_type}_${idx}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {p.our_room_type}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 tabular-nums">
                            RM {p.our_min_rate}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 tabular-nums">
                            RM {p.our_max_rate}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 tabular-nums">
                            {typeof p.lowest_competitor_price === 'number' ? `RM ${p.lowest_competitor_price.toFixed(2)}` : 'N/A'}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 tabular-nums">
                            {typeof p.average_competitor_price === 'number' ? `RM ${p.average_competitor_price.toFixed(2)}` : 'N/A'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                            {p.valid_quotes}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {p.recommendation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Sub-breakdown per competitor */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                    Rate Breakdown by Competitor Hotel
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {extractionResult.priceReport.map((p, idx) => (
                      <div key={`breakdown_card_${p.our_room_type}_${idx}`} className="p-3 rounded-lg border border-slate-200 bg-slate-50/40 text-xs">
                        <div className="font-semibold text-slate-900 flex justify-between mb-2">
                          <span>{p.our_room_type}</span>
                          <span className="font-normal text-slate-500">
                            Avg: {typeof p.average_competitor_price === 'number' ? `RM ${p.average_competitor_price}` : 'N/A'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {p.competitor_breakdown.map((cb, cIdx) => (
                            <div key={`comp_item_${idx}_${cIdx}_${cb.hotel_name}_${cb.room_name}`} className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 text-[11px]">
                              <span className="text-slate-700 truncate pr-2">
                                <strong>{cb.hotel_name}</strong> ({cb.room_name})
                              </span>
                              <span className="font-mono font-medium text-slate-900 shrink-0">
                                {typeof cb.price === 'number' ? `RM ${cb.price}` : <span className="text-slate-400">N/A</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* competitor_room Sheet */}
            {outputSheetTab === 'competitor_room' && (
              <div className="p-5">
                <div className="mb-3">
                  <h4 className="font-semibold text-slate-900 text-xs">
                    competitor_room Sheet (Updated gross_amount)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Table of mapped rooms updated with live Booking.com rate values.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                        <th className="py-2.5 px-3">Competitor Hotel ID</th>
                        <th className="py-2.5 px-3">Competitor Hotel Name</th>
                        <th className="py-2.5 px-3">Competitor Room ID</th>
                        <th className="py-2.5 px-3">Competitor Room Name</th>
                        <th className="py-2.5 px-3 font-semibold text-slate-900">Latest gross_amount</th>
                        <th className="py-2.5 px-3">Our Room Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {extractionResult.updatedRooms.map((room, idx) => (
                        <tr key={`updated_room_${room.competitor_hotel_id}_${room.competitor_room_id}_${idx}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {room.competitor_hotel_id}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {room.competitor_hotel_name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {room.competitor_room_id}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {room.competitor_room_name}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 tabular-nums">
                            {typeof room.gross_amount === 'number' ? `RM ${room.gross_amount.toFixed(2)}` : <span className="text-slate-400">N/A</span>}
                          </td>
                          <td className="py-2.5 px-3 text-slate-900 font-medium">
                            {room.our_room_type}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
