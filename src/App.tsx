import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Flow1Mapping } from './components/Flow1Mapping';
import { Flow2Extraction } from './components/Flow2Extraction';
import { SettingsModal } from './components/SettingsModal';
import { 
  DEFAULT_HOTEL_NAME, 
  DEFAULT_HOTEL_ROOMS, 
  DEFAULT_COMPETITOR_HOTELS, 
  DEFAULT_MAPPED_ROOMS 
} from './data/defaultHotel';
import { HotelRoomType, CompetitorHotel, CompetitorRoomMapping } from './types/yama';

export default function App() {
  const [activeTab, setActiveTab] = useState<'flow1' | 'flow2'>('flow2');

  // Core Workbook state (Pre-loaded with MSP D'Spark Hotel Bayu example)
  const [hotelName, setHotelName] = useState<string>(() => {
    return localStorage.getItem('yama_hotel_name') || DEFAULT_HOTEL_NAME;
  });

  const [hotelRooms, setHotelRooms] = useState<HotelRoomType[]>(() => {
    const saved = localStorage.getItem('yama_hotel_rooms');
    return saved ? JSON.parse(saved) : DEFAULT_HOTEL_ROOMS;
  });

  const [competitorHotels, setCompetitorHotels] = useState<CompetitorHotel[]>(() => {
    const saved = localStorage.getItem('yama_competitor_hotels');
    return saved ? JSON.parse(saved) : DEFAULT_COMPETITOR_HOTELS;
  });

  const [mappedRooms, setMappedRooms] = useState<CompetitorRoomMapping[]>(() => {
    const saved = localStorage.getItem('yama_mapped_rooms');
    return saved ? JSON.parse(saved) : DEFAULT_MAPPED_ROOMS;
  });

  // Settings
  const [rapidApiKey, setRapidApiKey] = useState<string>(() => {
    return localStorage.getItem('yama_rapidapi_key') || '';
  });

  const [rapidApiHost, setRapidApiHost] = useState<string>(() => {
    return localStorage.getItem('yama_rapidapi_host') || 'booking-com15.p.rapidapi.com';
  });

  const [telegramToken, setTelegramToken] = useState<string>(() => {
    return localStorage.getItem('yama_telegram_token') || '';
  });

  const [telegramChatId, setTelegramChatId] = useState<string>(() => {
    return localStorage.getItem('yama_telegram_chat_id') || '';
  });

  // Consolidated Settings Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Sync to local storage for persistence across reloads
  useEffect(() => {
    localStorage.setItem('yama_hotel_name', hotelName);
  }, [hotelName]);

  const handleUploadWorkbook = async (file: File, autoRun: boolean = false) => {
    try {
      const data = await import('./services/excelService').then(m => m.ExcelService.importInputWorkbook(file));
      if (data.hotelName) setHotelName(data.hotelName);
      if (data.hotelRooms.length > 0) setHotelRooms(data.hotelRooms);
      if (data.competitorHotels.length > 0) setCompetitorHotels(data.competitorHotels);
      if (data.mappedRooms.length > 0) setMappedRooms(data.mappedRooms);
      setUploadedFileName(file.name);
      return data;
    } catch (e: any) {
      console.error(`Error reading uploaded Excel file:`, e);
      throw e;
    }
  };

  useEffect(() => {
    localStorage.setItem('yama_hotel_rooms', JSON.stringify(hotelRooms));
  }, [hotelRooms]);

  useEffect(() => {
    localStorage.setItem('yama_competitor_hotels', JSON.stringify(competitorHotels));
  }, [competitorHotels]);

  useEffect(() => {
    localStorage.setItem('yama_mapped_rooms', JSON.stringify(mappedRooms));
  }, [mappedRooms]);

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
        isSimulated={!rapidApiKey.trim()}
        telegramConfigured={Boolean(telegramToken.trim() && telegramChatId.trim())}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'flow1' ? (
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
          />
        ) : (
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
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            <strong>YAMA Bot</strong> • Hotel Competitor Room Mapping & Price Monitoring
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSettingsOpen(true)} className="hover:text-blue-600 transition-colors font-medium">
              Tetapan, Cloudflare & Skrip Python
            </button>
          </div>
        </div>
      </footer>

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
