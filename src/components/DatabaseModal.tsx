import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  Save, 
  Download, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Server, 
  Cloud, 
  Table, 
  Calendar, 
  Clock, 
  FileSpreadsheet,
  ChevronRight,
  ExternalLink,
  Code
} from 'lucide-react';
import { DbClientService, DatabaseStats, ExtractionRunRecord } from '../services/dbClientService';
import { HotelRoomType, CompetitorHotel, CompetitorRoomMapping, PriceReportRow } from '../types/yama';
import { ExcelService } from '../services/excelService';

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSetup: {
    hotelName: string;
    hotelRooms: HotelRoomType[];
    competitorHotels: CompetitorHotel[];
    mappedRooms: CompetitorRoomMapping[];
  };
  onLoadSetup: (setup: {
    hotelName: string;
    hotelRooms: HotelRoomType[];
    competitorHotels: CompetitorHotel[];
    mappedRooms: CompetitorRoomMapping[];
  }) => void;
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({
  isOpen,
  onClose,
  currentSetup,
  onLoadSetup
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'cloudflare'>('overview');
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [runs, setRuns] = useState<ExtractionRunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<{ run: ExtractionRunRecord; reports: PriceReportRow[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDatabaseInfo = async () => {
    setIsLoading(true);
    try {
      const [s, r] = await Promise.all([
        DbClientService.getStats(),
        DbClientService.getExtractionRuns()
      ]);
      setStats(s);
      setRuns(r);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDatabaseInfo();
      setMessage(null);
      setSelectedRun(null);
    }
  }, [isOpen]);

  const handleSaveCurrentSetup = async () => {
    if (!currentSetup.hotelName && currentSetup.hotelRooms.length === 0) {
      setMessage({ type: 'error', text: 'No hotel setup data currently loaded in Flow 1 to save.' });
      return;
    }
    setIsLoading(true);
    const res = await DbClientService.saveSetup(currentSetup);
    setIsLoading(false);
    if (res.success) {
      setMessage({ type: 'success', text: `Saved ${currentSetup.hotelName} (${currentSetup.mappedRooms.length} room mappings) to database successfully!` });
      fetchDatabaseInfo();
    } else {
      setMessage({ type: 'error', text: res.message || 'Failed to save setup to database.' });
    }
  };

  const handleLoadSavedSetup = async () => {
    setIsLoading(true);
    const setup = await DbClientService.getSavedSetup();
    setIsLoading(false);
    if (setup && setup.hotelRooms.length > 0) {
      onLoadSetup({
        hotelName: setup.hotelName,
        hotelRooms: setup.hotelRooms,
        competitorHotels: setup.competitorHotels,
        mappedRooms: setup.mappedRooms
      });
      setMessage({ type: 'success', text: `Loaded ${setup.hotelName} with ${setup.mappedRooms.length} mapped rooms into Flow 1!` });
    } else {
      setMessage({ type: 'error', text: 'No saved hotel setup found in database. Please upload or save one first.' });
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('Are you sure you want to clear all hotel data and historical reports from the database? This cannot be undone.')) {
      return;
    }
    setIsLoading(true);
    const ok = await DbClientService.clearSetup();
    setIsLoading(false);
    if (ok) {
      setMessage({ type: 'success', text: 'Database tables cleared successfully.' });
      fetchDatabaseInfo();
    } else {
      setMessage({ type: 'error', text: 'Failed to clear database.' });
    }
  };

  const handleExportSqlDump = async () => {
    const dump = await DbClientService.exportSqlDump();
    const blob = new Blob([dump], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yama_d1_backup_${new Date().toISOString().slice(0, 10)}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleViewRun = async (runId: string) => {
    setIsLoading(true);
    const details = await DbClientService.getRunDetails(runId);
    setIsLoading(false);
    if (details) {
      setSelectedRun(details);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Database Management</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Cloudflare D1 Ready
                </span>
              </div>
              <p className="text-xs text-slate-300">Serverless relational SQLite persistence for Malaysian hotel rate monitoring</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50 shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table className="w-4 h-4" />
            Database Overview & Setup
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            Extraction History ({runs.length})
          </button>
          <button
            onClick={() => setActiveTab('cloudflare')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'cloudflare'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cloud className="w-4 h-4 text-orange-500" />
            Cloudflare D1 Deployment Guide
          </button>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mx-6 mt-4 p-3 rounded-lg flex items-center gap-2 text-xs font-medium ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-700">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Hotel</div>
                  <div className="text-base font-bold text-slate-900 mt-1 truncate">
                    {stats?.activeHotel || 'None'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Primary monitored entity</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Room Types</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {stats?.roomTypesCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Configured with rate limits</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mapped Rooms</div>
                  <div className="text-xl font-bold text-indigo-600 mt-1">
                    {stats?.mappedRoomsCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Across {stats?.competitorHotelsCount || 0} competitors</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Past Runs</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    {stats?.extractionRunsCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Archived reports</div>
                </div>
              </div>

              {/* Action Buttons Panel */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white space-y-4">
                <h3 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                  <span>Database Operations</span>
                  <button 
                    onClick={fetchDatabaseInfo} 
                    disabled={isLoading}
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-normal"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleSaveCurrentSetup}
                    disabled={isLoading}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-900 transition-colors text-left"
                  >
                    <div>
                      <div className="font-semibold text-xs flex items-center gap-1.5">
                        <Save className="w-4 h-4 text-indigo-600" />
                        Save Current Flow 1 Setup to Database
                      </div>
                      <div className="text-[11px] text-indigo-700/80 mt-0.5">
                        Persists current hotel ({currentSetup.hotelName || 'My Hotel'}), rooms & mappings.
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-indigo-400 shrink-0" />
                  </button>

                  <button
                    onClick={handleLoadSavedSetup}
                    disabled={isLoading}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-900 transition-colors text-left"
                  >
                    <div>
                      <div className="font-semibold text-xs flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-emerald-600" />
                        Load Setup from Database
                      </div>
                      <div className="text-[11px] text-emerald-700/80 mt-0.5">
                        Restore saved hotel & competitor room mappings into Flow 1.
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
                  </button>

                  <button
                    onClick={handleExportSqlDump}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-colors text-left"
                  >
                    <div>
                      <div className="font-semibold text-xs flex items-center gap-1.5">
                        <Download className="w-4 h-4 text-slate-600" />
                        Download Cloudflare D1 SQL Backup
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Export full SQL dump for <code>wrangler d1 execute</code>.
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>

                  <button
                    onClick={handleClearDatabase}
                    disabled={isLoading}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-rose-900 transition-colors text-left"
                  >
                    <div>
                      <div className="font-semibold text-xs flex items-center gap-1.5">
                        <Trash2 className="w-4 h-4 text-rose-600" />
                        Wipe / Reset Database
                      </div>
                      <div className="text-[11px] text-rose-700/80 mt-0.5">
                        Clear all tables and reset database state cleanly.
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-rose-400 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Database Schema Summary */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="flex items-center gap-2 font-semibold text-xs text-slate-800 mb-2">
                  <Server className="w-4 h-4 text-indigo-600" />
                  Database Engine: Cloudflare D1 / SQLite WAL Engine
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  The system uses relational SQLite which mirrors <strong>Cloudflare D1</strong> 1:1. When deployed to Cloudflare Pages, the included Cloudflare Pages Functions (<code>/functions/api/[[route]].ts</code>) automatically execute against your serverless Cloudflare D1 database.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {selectedRun ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-slate-100 p-3 rounded-lg">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">
                        {selectedRun.run.hotel_name} - {selectedRun.run.run_date}
                      </h4>
                      <p className="text-xs text-slate-600">
                        Stay: {selectedRun.run.arrival_date} → {selectedRun.run.departure_date} | Quotes: {selectedRun.run.total_quotes}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedRun(null)}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md text-xs font-semibold"
                    >
                      Back to Run List
                    </button>
                  </div>

                  {/* Summary Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                        <tr>
                          <th className="p-2.5">Room Type</th>
                          <th className="p-2.5">Target Range</th>
                          <th className="p-2.5">Lowest Comp</th>
                          <th className="p-2.5">Average Comp</th>
                          <th className="p-2.5">Quotes</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Recommendation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedRun.reports.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-900">{r.our_room_type}</td>
                            <td className="p-2.5 text-slate-600">RM {r.our_min_rate} - {r.our_max_rate}</td>
                            <td className="p-2.5 font-semibold text-indigo-600">
                              {typeof r.lowest_competitor_price === 'number' ? `RM ${r.lowest_competitor_price.toFixed(2)}` : 'N/A'}
                            </td>
                            <td className="p-2.5 text-slate-700">
                              {typeof r.average_competitor_price === 'number' ? `RM ${r.average_competitor_price.toFixed(2)}` : 'N/A'}
                            </td>
                            <td className="p-2.5 text-slate-600">{r.valid_quotes}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                r.status === 'competitive'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : r.status === 'underpriced'
                                    ? 'bg-blue-100 text-blue-800'
                                    : r.status === 'premium'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-600'
                              }`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-600">{r.recommendation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : runs.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                  <Database className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No extraction runs recorded yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Run Flow 2 Price Extraction, trigger the Task Scheduler, or upload via Telegram to see historical runs stored here.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                      <tr>
                        <th className="p-3">Run Date</th>
                        <th className="p-3">Hotel</th>
                        <th className="p-3">Stay Dates</th>
                        <th className="p-3">Quotes</th>
                        <th className="p-3">Breakdown</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {runs.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 font-mono text-slate-600">{r.run_date}</td>
                          <td className="p-3 font-semibold text-slate-900">{r.hotel_name}</td>
                          <td className="p-3 text-slate-600">{r.arrival_date} → {r.departure_date}</td>
                          <td className="p-3 font-semibold text-slate-800">{r.total_quotes} quotes</td>
                          <td className="p-3 space-x-1">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium">
                              {r.competitive_count} comp
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">
                              {r.underpriced_count} under
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-medium">
                              {r.premium_count} prem
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleViewRun(r.id)}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded text-xs transition-colors"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cloudflare' && (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-center gap-2 font-bold text-orange-900 text-sm mb-1">
                  <Cloud className="w-4 h-4 text-orange-600" />
                  Deploying with Cloudflare D1 (Serverless Database)
                </div>
                <p className="text-xs text-orange-800 leading-relaxed">
                  Cloudflare D1 is Cloudflare's serverless SQLite database. This codebase is pre-configured with Cloudflare Pages Functions and D1 bindings ready for zero-friction deployment.
                </p>
              </div>

              <div className="space-y-3">
                <div className="border-l-2 border-orange-500 pl-3.5 space-y-1">
                  <div className="text-[11px] font-bold text-orange-600 uppercase">Step 1: Create your Cloudflare D1 Database</div>
                  <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg text-xs font-mono">
                    <code>npx wrangler d1 create yama_db</code>
                  </div>
                  <p className="text-xs text-slate-500">
                    Copy the <code>database_id</code> returned by Wrangler and paste it into <code>wrangler.toml</code>.
                  </p>
                </div>

                <div className="border-l-2 border-blue-500 pl-3.5 space-y-1">
                  <div className="text-[11px] font-bold text-blue-600 uppercase">Step 2: Initialize Database Schema</div>
                  <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg text-xs font-mono">
                    <code>npx wrangler d1 execute yama_db --file=src/db/schema.sql</code>
                  </div>
                  <p className="text-xs text-slate-500">
                    This automatically provisions all 8 tables, foreign keys, and indexes in Cloudflare D1.
                  </p>
                </div>

                <div className="border-l-2 border-emerald-500 pl-3.5 space-y-1">
                  <div className="text-[11px] font-bold text-emerald-600 uppercase">Step 3: Deploy Full-Stack to Cloudflare Pages</div>
                  <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg text-xs font-mono">
                    <code>npm run build && npx wrangler pages deploy dist --project-name=yama-bot</code>
                  </div>
                  <p className="text-xs text-slate-500">
                    Cloudflare Pages deploys both the frontend and the <code>/functions/api/</code> serverless D1 handlers automatically!
                  </p>
                </div>
              </div>

              {/* wrangler.toml snippet */}
              <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 flex items-center justify-between border-b border-slate-200">
                  <span className="flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5" />
                    wrangler.toml (Included in Root)
                  </span>
                </div>
                <pre className="p-3 bg-slate-900 text-emerald-400 text-xs font-mono overflow-x-auto">
{`name = "yama-bot"
compatibility_date = "2024-04-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "yama_db"
database_id = "<your-d1-database-id-from-step-1>"`}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            Database Engine: SQLite (Local) / Cloudflare D1 (Production)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
