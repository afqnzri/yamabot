import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Calendar, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Upload, 
  Send, 
  FileSpreadsheet, 
  Terminal, 
  HelpCircle, 
  ShieldCheck, 
  Check, 
  ArrowRight, 
  ExternalLink 
} from 'lucide-react';
import { SchedulerConfig, SchedulerLogEntry } from '../types/scheduler';
import { HotelRoomType, CompetitorHotel, CompetitorRoomMapping } from '../types/yama';

interface TaskSchedulerProps {
  hotelName: string;
  hotelRooms: HotelRoomType[];
  competitorHotels: CompetitorHotel[];
  mappedRooms: CompetitorRoomMapping[];
  telegramChatId: string;
  telegramToken: string;
  onOpenSettings: () => void;
  onSwitchToFlow1: () => void;
}

export const TaskScheduler: React.FC<TaskSchedulerProps> = ({
  hotelName,
  hotelRooms,
  competitorHotels,
  mappedRooms,
  telegramChatId,
  telegramToken,
  onOpenSettings,
  onSwitchToFlow1
}) => {
  const [config, setConfig] = useState<SchedulerConfig>({
    enabled: false,
    time: '07:00',
    frequency: 'daily',
    targetDaysAhead: 1,
    targetStayNights: 1,
    telegramChatId: telegramChatId || '',
    hasMasterWorkbook: false,
    masterHotelName: '',
    masterMappedRoomsCount: 0,
    lastRunTime: null,
    lastRunStatus: null,
    nextRunTime: null
  });

  const [logs, setLogs] = useState<SchedulerLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeGuideTab, setActiveGuideTab] = useState<'builtin' | 'github' | 'windows'>('builtin');

  const fetchSchedulerData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/scheduler');
      if (res.ok) {
        const data = await res.json();
        if (data.config) setConfig(data.config);
        if (data.logs) setLogs(data.logs);
      }
    } catch (e: any) {
      console.warn('Could not fetch scheduler data:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedulerData();
    const interval = setInterval(fetchSchedulerData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveConfig = async (newConfig?: Partial<SchedulerConfig>) => {
    try {
      setSaving(true);
      setMessage(null);
      const payload = newConfig ? { ...config, ...newConfig } : config;
      const res = await fetch('/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setMessage({ type: 'success', text: 'Scheduler configuration saved successfully!' });
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnable = (enabled: boolean) => {
    setConfig(prev => ({ ...prev, enabled }));
    handleSaveConfig({ enabled });
  };

  const handleTriggerNow = async () => {
    try {
      setTriggering(true);
      setMessage(null);
      const res = await fetch('/api/scheduler/trigger', { method: 'POST' });
      if (res.ok) {
        setMessage({
          type: 'success',
          text: '🚀 Scheduled run triggered in background! The Excel report will be delivered to Telegram once complete.'
        });
        setTimeout(fetchSchedulerData, 2000);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to trigger run');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setTriggering(false);
    }
  };

  const handleUseCurrentMappingAsMaster = async () => {
    const activeRooms = mappedRooms.filter(
      r => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
    );

    if (activeRooms.length === 0) {
      setMessage({
        type: 'error',
        text: 'No mapped rooms found in Flow 1. Please map your rooms first or upload a workbook.'
      });
      return;
    }

    try {
      setSaving(true);
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const hotelRows = hotelRooms.map(r => ({
        hotel_name: hotelName || 'Hotel',
        room_type: r.room_type,
        room_name: r.room_name,
        min_rate: r.min_rate,
        max_rate: r.max_rate
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hotelRows), 'hotel_data');

      const compRows = competitorHotels.map(h => ({
        competitor_hotel_id: h.competitor_hotel_id,
        competitor_hotel_name: h.competitor_hotel_name,
        address: h.address || '',
        city: h.city || '',
        review_score: h.review_score || '',
        url: h.url || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compRows), 'competitor_hotel');

      const roomRows = mappedRooms.map(m => ({
        competitor_hotel_id: m.competitor_hotel_id,
        competitor_hotel_name: m.competitor_hotel_name,
        competitor_room_id: m.competitor_room_id,
        competitor_room_name: m.competitor_room_name,
        gross_amount: m.gross_amount ?? '',
        our_room_type: m.our_room_type
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roomRows), 'competitor_room');

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

      const res = await fetch('/api/scheduler/upload-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: wbout,
          filename: `${hotelName || 'Master'}.xlsx`
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({
          type: 'success',
          text: `Master Workbook successfully synced from Flow 1: ${data.hotelName} (${data.mappedRoomsCount} active rooms)!`
        });
        fetchSchedulerData();
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `Failed to save master mapping: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadMasterFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSaving(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/scheduler/upload-master', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, filename: file.name })
        });
        if (res.ok) {
          const data = await res.json();
          setMessage({
            type: 'success',
            text: `Reference workbook "${file.name}" uploaded as Master (${data.mappedRoomsCount} rooms)!`
          });
          fetchSchedulerData();
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Task Scheduler: Recurring Automated Extractions
            </h1>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              config.enabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              {config.enabled ? '🟢 AUTO-RUN ACTIVE' : '⚪ INACTIVE'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Schedule automated daily Booking.com rate extractions and deliver Excel reports directly to Telegram without opening a computer.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSchedulerData}
            disabled={loading}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleTriggerNow}
            disabled={triggering || !config.hasMasterWorkbook}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs text-white ${
              !config.hasMasterWorkbook
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            title={!config.hasMasterWorkbook ? 'Upload Master file first' : 'Run scheduler extraction now'}
          >
            <Play className={`w-3.5 h-3.5 ${triggering ? 'animate-spin' : ''}`} />
            <span>{triggering ? 'Processing...' : 'Run Test Now'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between border ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
            : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-[11px] underline ml-4 font-semibold">Dismiss</button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium flex items-center justify-between">
            <span>Scheduler Status</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${config.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            {config.enabled ? 'Active (Running)' : 'Disabled'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {config.enabled ? `Every day at ${config.time} (UTC+8)` : 'Toggle switch below to enable'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium flex items-center justify-between">
            <span>Next Scheduled Run</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-base font-bold text-slate-900 mt-1">
            {config.enabled ? config.time : '--:--'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            {config.enabled && config.nextRunTime ? config.nextRunTime : 'Scheduler inactive'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium flex items-center justify-between">
            <span>Master Reference File</span>
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 truncate">
            {config.hasMasterWorkbook ? config.masterHotelName : 'None Configured'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {config.hasMasterWorkbook ? `${config.masterMappedRoomsCount} active rooms tracked` : 'Upload required'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium flex items-center justify-between">
            <span>Notification Destination</span>
            <Send className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 truncate">
            {config.telegramChatId ? `Chat: ${config.telegramChatId}` : 'No Chat ID'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Delivered via @YamaHotelBot
          </div>
        </div>
      </div>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Schedule Settings */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Automated Schedule Configuration</h3>
                <p className="text-[11px] text-slate-500">Configure daily run time and target check-in window</p>
              </div>

              {/* Master Toggle */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => handleToggleEnable(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ml-2.5 text-xs font-semibold text-slate-700">
                  {config.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Daily Run Time (24h)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={config.time}
                    onChange={(e) => setConfig({ ...config, time: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Local Malaysia time (UTC+8). e.g. 07:00 AM</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Frequency
                </label>
                <select
                  value={config.frequency}
                  onChange={(e) => setConfig({ ...config, frequency: e.target.value as any })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="daily">Daily (Once per day)</option>
                  <option value="twice_daily">Twice Daily (Morning & Evening)</option>
                  <option value="every_6h">Every 6 Hours</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Recommended: Daily at 7:00 AM</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Target Check-in Date (Days Ahead)
                </label>
                <select
                  value={config.targetDaysAhead}
                  onChange={(e) => setConfig({ ...config, targetDaysAhead: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value={1}>Tomorrow (+1 Day)</option>
                  <option value={2}>Day After Tomorrow (+2 Days)</option>
                  <option value={3}>3 Days Ahead</option>
                  <option value={7}>This Weekend (+7 Days)</option>
                  <option value={14}>2 Weeks Ahead (+14 Days)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Target arrival date to query on Booking.com</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Destination Telegram Chat ID
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={config.telegramChatId}
                    onChange={(e) => setConfig({ ...config, telegramChatId: e.target.value })}
                    placeholder="e.g. 54041669"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                  {telegramChatId && (
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, telegramChatId })}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold shrink-0"
                      title="Use My Current ID"
                    >
                      Mine
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Personal Chat ID or Staff Group ID</p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => handleSaveConfig()}
                disabled={saving}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{saving ? 'Saving...' : 'Save Schedule Settings'}</span>
              </button>
            </div>
          </div>

          {/* Master Workbook Setup Card */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Master Reference Workbook (Master Mapping)</h3>
                <p className="text-[11px] text-slate-500">This Excel workbook informs the scheduler which hotel and competitor rooms to monitor</p>
              </div>
              {config.hasMasterWorkbook && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Ready to Use
                </span>
              )}
            </div>

            {config.hasMasterWorkbook ? (
              <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    <span>{config.masterHotelName}</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Contains <strong>{config.masterMappedRoomsCount} active rooms</strong> mapped against Booking.com competitors.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="cursor-pointer px-3 py-1.5 bg-white hover:bg-emerald-100/50 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Replace File</span>
                    <input type="file" accept=".xlsx, .xls" onChange={handleUploadMasterFile} className="hidden" />
                  </label>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold">Master Workbook Not Configured</h4>
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                      The scheduler requires a reference workbook to know which competitor hotels and room types to query each morning.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label className="cursor-pointer px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload .xlsx File</span>
                    <input type="file" accept=".xlsx, .xls" onChange={handleUploadMasterFile} className="hidden" />
                  </label>

                  {mappedRooms.length > 0 && (
                    <button
                      onClick={handleUseCurrentMappingAsMaster}
                      className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5 text-amber-700" />
                      <span>Use Current Flow 1 Mapping</span>
                    </button>
                  )}

                  <button
                    onClick={onSwitchToFlow1}
                    className="px-3 py-1.5 text-amber-800 hover:text-amber-950 underline text-xs font-medium"
                  >
                    Open Flow 1 to Setup Mapping
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Execution History & Logs */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Automated Execution History</h3>
                <p className="text-[11px] text-slate-500">Scheduler logs and delivery status to Telegram</p>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {logs.length} records
              </span>
            </div>

            {logs.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg space-y-2">
                <Clock className="w-6 h-6 mx-auto text-slate-300" />
                <p>No scheduler run records yet.</p>
                <button
                  onClick={handleTriggerNow}
                  disabled={!config.hasMasterWorkbook}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  Run First Test
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border text-xs space-y-1 transition-colors ${
                      log.status === 'success'
                        ? 'bg-emerald-50/40 border-emerald-200/80 text-emerald-950'
                        : log.status === 'failed'
                          ? 'bg-rose-50/40 border-rose-200/80 text-rose-950'
                          : 'bg-amber-50/40 border-amber-200/80 text-amber-950'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : log.status === 'failed' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                        )}
                        <span>{log.hotelName}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">{log.timestamp}</span>
                    </div>

                    <div className="text-[11px] text-slate-600 flex items-center justify-between">
                      <span>Query Dates: <strong>{log.arrivalDate} → {log.departureDate}</strong></span>
                      {log.roomsQueried > 0 && <span>{log.roomsQueried} rooms</span>}
                    </div>

                    <p className="text-[11px] leading-tight text-slate-700 mt-0.5">
                      {log.message}
                    </p>

                    {log.outputFileName && (
                      <div className="text-[10px] font-mono text-slate-500 pt-0.5">
                        📁 {log.outputFileName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alternative External Schedulers Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">External Scheduler Options</h3>
            <p className="text-[11px] text-slate-500">You can also run scheduled cron jobs via GitHub Actions Cloud or your hotel PC</p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveGuideTab('builtin')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                activeGuideTab === 'builtin' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              In-App Scheduler (Active)
            </button>
            <button
              onClick={() => setActiveGuideTab('github')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                activeGuideTab === 'github' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              GitHub Actions Cron
            </button>
            <button
              onClick={() => setActiveGuideTab('windows')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                activeGuideTab === 'windows' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Windows Task Scheduler
            </button>
          </div>
        </div>

        {activeGuideTab === 'builtin' && (
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              In-App Scheduler is active inside this server!
            </h4>
            <p className="text-slate-600 leading-relaxed">
              YAMA Bot's built-in scheduler runs directly inside your web server. As long as the server is running or managed with <code>pm2</code> on your server/PC, it will evaluate the timer every minute, query Booking.com, and automatically deliver the output report to Telegram.
            </p>
          </div>
        )}

        {activeGuideTab === 'github' && (
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <ExternalLink className="w-4 h-4 text-blue-600" />
              100% Free Cloud Cron: GitHub Actions
            </div>
            <p className="text-slate-600 leading-relaxed">
              If you prefer not to keep any PC or web browser open, you can use the bundled GitHub Actions workflow included in the project:
            </p>
            <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto">
{`# Location: .github/workflows/daily_price_monitor.yml
name: YAMA Daily Price Extraction
on:
  schedule:
    - cron: '0 23 * * *'  # 7:00 AM Malaysia Time (UTC+8)
  workflow_dispatch:      # Can also trigger manually from GitHub UI`}
            </pre>
            <p className="text-[11px] text-slate-500">
              Simply set <code>RAPIDAPI_KEY</code> and <code>TELEGRAM_BOT_TOKEN</code> in your GitHub Repository Secrets. GitHub will execute the rate extraction every morning completely free.
            </p>
          </div>
        )}

        {activeGuideTab === 'windows' && (
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-slate-800" />
              Run on Front Desk Hotel PC (Windows Task Scheduler)
            </div>
            <p className="text-slate-600 leading-relaxed">
              If your hotel has an always-on front desk computer, you can create a simple <code>run_yama.bat</code> script and add it to Windows Task Scheduler:
            </p>
            <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto">
{`@echo off
cd "C:\\Users\\Hotel\\yama-bot"
python -m yama_bot.flow2_extract --workbook "master_workbook.xlsx"
pause`}
            </pre>
            <p className="text-[11px] text-slate-500">
              Configure a trigger for 7:00 AM daily inside the Windows <strong>Task Scheduler</strong> app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
