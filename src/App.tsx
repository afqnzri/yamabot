import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Flow1Mapping } from './components/Flow1Mapping';
import { Flow2Extraction } from './components/Flow2Extraction';
import { TaskScheduler } from './components/TaskScheduler';
import { SettingsModal } from './components/SettingsModal';
import { DatabaseModal } from './components/DatabaseModal';
import { 
  DEFAULT_HOTEL_NAME, 
  DEFAULT_HOTEL_ROOMS, 
  DEFAULT_COMPETITOR_HOTELS, 
  DEFAULT_MAPPED_ROOMS 
} from './data/defaultHotel';
import { HotelRoomType, CompetitorHotel, CompetitorRoomMapping } from './types/yama';
import { BotStatusService } from './services/botStatusService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'flow1' | 'flow2' | 'scheduler'>('flow1');

  // Live Bot Daemon Status
  const [botStatus, setBotStatus] = useState({
    isOnline: false,
    isBusy: false,
    currentTask: null as string | null,
    lastCompletedFile: null as string | null,
    lastCompletedAt: null as string | null,
    processedCount: 0,
    botUsername: 'YamaHotelBot'
  });

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      const res = await BotStatusService.checkStatus();
      if (mounted) setBotStatus(res);
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Core Workbook state: Auto-resets to empty on every page visit / refresh (No localStorage caching)
  const [hotelName, setHotelName] = useState<string>('');
  const [hotelRooms, setHotelRooms] = useState<HotelRoomType[]>([]);
  const [competitorHotels, setCompetitorHotels] = useState<CompetitorHotel[]>([]);
  const [mappedRooms, setMappedRooms] = useState<CompetitorRoomMapping[]>([]);

  // Clear any previously cached Flow 1 data from localStorage on load
  useEffect(() => {
    localStorage.removeItem('yama_hotel_name');
    localStorage.removeItem('yama_hotel_rooms');
    localStorage.removeItem('yama_competitor_hotels');
    localStorage.removeItem('yama_mapped_rooms');
  }, []);

  // Settings
  const [rapidApiKey, setRapidApiKey] = useState<string>(() => {
    const saved = localStorage.getItem('yama_rapidapi_key');
    return (saved && saved.trim()) ? saved : 'f659e796f5mshede0a10caa98d60p1f7437jsn2a0469f81edb';
  });

  const [rapidApiHost, setRapidApiHost] = useState<string>(() => {
    return localStorage.getItem('yama_rapidapi_host') || 'booking-com15.p.rapidapi.com';
  });

  const [telegramToken, setTelegramToken] = useState<string>(() => {
    const saved = localStorage.getItem('yama_telegram_token');
    return (saved && saved.trim()) ? saved : '8806821205:AAF6Z956tPfW2BsnMKzPkDmEzuAj1_5VYFM';
  });

  const [telegramChatId, setTelegramChatId] = useState<string>(() => {
    return localStorage.getItem('yama_telegram_chat_id') || '';
  });

  // Consolidated Settings Modal & Database Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDatabaseOpen, setIsDatabaseOpen] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const handleUploadWorkbook = async (file: File, autoRun: boolean = false) => {
    try {
      const data = await import('./services/excelService').then(m => m.ExcelService.importInputWorkbook(file));
      if (data.hotelName) setHotelName(data.hotelName);
      if (data.hotelRooms.length > 0) setHotelRooms(data.hotelRooms);

      let finalHotels = data.competitorHotels;
      let finalRooms = data.mappedRooms;

      const hasSearchQueries = finalHotels.some(h => !!h.competitor_hotel_search);
      const hasMissingRooms = finalRooms.length === 0 || finalHotels.some(
        h => !h.competitor_hotel_id || !finalRooms.some(r => r.competitor_hotel_id === h.competitor_hotel_id)
      );

      if (finalHotels.length > 0 && (hasSearchQueries || hasMissingRooms)) {
        const { RapidApiService } = await import('./services/rapidApiService');
        const defaultArr = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        const defaultDep = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
        const resolved = await RapidApiService.resolveCompetitorsAndRooms(
          finalHotels,
          data.hotelRooms.length > 0 ? data.hotelRooms : hotelRooms,
          defaultArr,
          defaultDep,
          rapidApiKey,
          rapidApiHost
        );
        finalHotels = resolved.updatedHotels;

        let genRooms = resolved.generatedRooms;
        if (finalRooms.length > 0) {
          genRooms = genRooms.map(gen => {
            const existing = finalRooms.find(
              ex => (ex.competitor_room_id && ex.competitor_room_id === gen.competitor_room_id) ||
                    (ex.competitor_hotel_id === gen.competitor_hotel_id && ex.competitor_room_name.toLowerCase() === gen.competitor_room_name.toLowerCase())
            );
            if (existing && existing.our_room_type && existing.our_room_type !== 'UNMAPPED') {
              return { ...gen, our_room_type: existing.our_room_type };
            }
            return gen;
          });
        }
        finalRooms = genRooms;
      }

      setCompetitorHotels(finalHotels);
      setMappedRooms(finalRooms);
      setUploadedFileName(file.name);
      return { ...data, competitorHotels: finalHotels, mappedRooms: finalRooms };
    } catch (e: any) {
      console.error(`Error reading uploaded Excel file:`, e);
      throw e;
    }
  };

  useEffect(() => {
    localStorage.setItem('yama_rapidapi_key', rapidApiKey);
  }, [rapidApiKey]);

  useEffect(() => {
    localStorage.setItem('yama_rapidapi_host', rapidApiHost);
  }, [rapidApiHost]);

  useEffect(() => {
    localStorage.setItem('yama_telegram_token', telegramToken);
  }, [telegramToken]);

  useEffect(() => {
    localStorage.setItem('yama_telegram_chat_id', telegramChatId);
  }, [telegramChatId]);

  const handleResetDefaults = () => {
    setHotelName(DEFAULT_HOTEL_NAME);
    setHotelRooms(DEFAULT_HOTEL_ROOMS);
    setCompetitorHotels(DEFAULT_COMPETITOR_HOTELS);
    setMappedRooms(DEFAULT_MAPPED_ROOMS);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenDatabase={() => setIsDatabaseOpen(true)}
        isSimulated={!rapidApiKey.trim()}
        telegramConfigured={Boolean(telegramToken.trim() && telegramChatId.trim())}
        botStatus={botStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'flow1' && (
          <Flow1Mapping
            hotelName={hotelName}
            setHotelName={setHotelName}
            hotelRooms={hotelRooms}
            setHotelRooms={setHotelRooms}
            competitorHotels={competitorHotels}
            setCompetitorHotels={setCompetitorHotels}
            mappedRooms={mappedRooms}
            setMappedRooms={setMappedRooms}
            rapidApiKey={rapidApiKey}
            rapidApiHost={rapidApiHost}
            onResetDefaults={handleResetDefaults}
            onProceedToFlow2={() => setActiveTab('flow2')}
            onOpenDatabase={() => setIsDatabaseOpen(true)}
          />
        )}

        {activeTab === 'flow2' && (
          <Flow2Extraction
            hotelName={hotelName}
            hotelRooms={hotelRooms}
            mappedRooms={mappedRooms}
            rapidApiKey={rapidApiKey}
            rapidApiHost={rapidApiHost}
            telegramToken={telegramToken}
            telegramChatId={telegramChatId}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onUploadWorkbook={handleUploadWorkbook}
            uploadedFileName={uploadedFileName}
            onSwitchToFlow1={() => setActiveTab('flow1')}
            onOpenDatabase={() => setIsDatabaseOpen(true)}
            botStatus={botStatus}
          />
        )}

        {activeTab === 'scheduler' && (
          <TaskScheduler
            hotelName={hotelName}
            hotelRooms={hotelRooms}
            competitorHotels={competitorHotels}
            mappedRooms={mappedRooms}
            telegramChatId={telegramChatId}
            telegramToken={telegramToken}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onSwitchToFlow1={() => setActiveTab('flow1')}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            <strong>YAMA Bot</strong> • Hotel Competitor Room Mapping & Price Monitoring (Cloudflare D1 &amp; SQLite)
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsDatabaseOpen(true)} className="hover:text-indigo-600 transition-colors font-medium text-indigo-700">
              Database &amp; Cloudflare D1
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="hover:text-blue-600 transition-colors font-medium">
              Settings &amp; Telegram
            </button>
          </div>
        </div>
      </footer>

      {/* Database Modal */}
      <DatabaseModal
        isOpen={isDatabaseOpen}
        onClose={() => setIsDatabaseOpen(false)}
        currentSetup={{
          hotelName,
          hotelRooms,
          competitorHotels,
          mappedRooms
        }}
        onLoadSetup={(setup) => {
          setHotelName(setup.hotelName);
          setHotelRooms(setup.hotelRooms);
          setCompetitorHotels(setup.competitorHotels);
          setMappedRooms(setup.mappedRooms);
        }}
      />

      {/* Unified Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        rapidApiKey={rapidApiKey}
        setRapidApiKey={setRapidApiKey}
        rapidApiHost={rapidApiHost}
        setRapidApiHost={setRapidApiHost}
        telegramToken={telegramToken}
        setTelegramToken={setTelegramToken}
        telegramChatId={telegramChatId}
        setTelegramChatId={setTelegramChatId}
      />
    </div>
  );
}
