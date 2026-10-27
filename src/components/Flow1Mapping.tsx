import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Search, 
  Download, 
  Upload, 
  RefreshCw,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { HotelRoomType, CompetitorHotel, CompetitorRoomMapping } from '../types/yama';
import { ExcelService } from '../services/excelService';
import { RapidApiService } from '../services/rapidApiService';

interface Flow1MappingProps {
  hotelName: string;
  setHotelName: (name: string) => void;
  hotelRooms: HotelRoomType[];
  setHotelRooms: React.Dispatch<React.SetStateAction<HotelRoomType[]>>;
  competitorHotels: CompetitorHotel[];
  setCompetitorHotels: React.Dispatch<React.SetStateAction<CompetitorHotel[]>>;
  mappedRooms: CompetitorRoomMapping[];
  setMappedRooms: React.Dispatch<React.SetStateAction<CompetitorRoomMapping[]>>;
  rapidApiKey: string;
  rapidApiHost: string;
  onResetDefaults: () => void;
  onProceedToFlow2?: () => void;
}

export const Flow1Mapping: React.FC<Flow1MappingProps> = ({
  hotelName,
  setHotelName,
  hotelRooms,
  setHotelRooms,
  competitorHotels,
  setCompetitorHotels,
  mappedRooms,
  setMappedRooms,
  rapidApiKey,
  rapidApiHost,
  onResetDefaults,
  onProceedToFlow2
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CompetitorHotel[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterHotel, setFilterHotel] = useState<string>('ALL');

  const [newRoomType, setNewRoomType] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newMinRate, setNewMinRate] = useState(90);
  const [newMaxRate, setNewMaxRate] = useState(150);
  const [showAddRoom, setShowAddRoom] = useState(false);

  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showNotify = (text: string, type: 'success' | 'info' | 'error' = 'info') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleAddHotelRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomType.trim()) return;
    const added: HotelRoomType = {
      room_type: newRoomType.trim(),
      room_name: newRoomName.trim() || newRoomType.trim(),
      min_rate: Number(newMinRate) || 0,
      max_rate: Number(newMaxRate) || 0
    };
    setHotelRooms([...hotelRooms, added]);
    setNewRoomType('');
    setNewRoomName('');
    setShowAddRoom(false);
    showNotify(`Bilik ${added.room_type} berjaya ditambah.`, 'success');
  };

  const handleRemoveHotelRoom = (index: number) => {
    const roomToRemove = hotelRooms[index];
    setHotelRooms(hotelRooms.filter((_, i) => i !== index));
    setMappedRooms(mappedRooms.map(m => m.our_room_type === roomToRemove.room_type ? { ...m, our_room_type: 'UNMAPPED' } : m));
    showNotify(`Bilik ${roomToRemove.room_type} dibuang.`, 'info');
  };

  const handleSearchCompetitors = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await RapidApiService.searchHotels(searchQuery.trim(), rapidApiKey, rapidApiHost);
      setSearchResults(results);
      if (results.length === 0) {
        showNotify(`Tiada hotel ditemui untuk "${searchQuery}".`, 'info');
      }
    } catch (err: any) {
      showNotify(`Ralat carian: ${err.message}`, 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleAddCompetitorHotel = async (hotel: CompetitorHotel) => {
    if (competitorHotels.some(h => h.competitor_hotel_id === hotel.competitor_hotel_id)) {
      showNotify(`Hotel "${hotel.competitor_hotel_name}" sudah berada dalam senarai.`, 'info');
      return;
    }

    setCompetitorHotels([...competitorHotels, hotel]);
    showNotify(`Mendapatkan senarai bilik untuk ${hotel.competitor_hotel_name}...`, 'info');

    try {
      const today = new Date();
      const in14Days = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
      const in15Days = new Date(today.getTime() + 15 * 86400000).toISOString().slice(0, 10);

      const rooms = await RapidApiService.getRoomList(
        hotel.competitor_hotel_id,
        in14Days,
        in15Days,
        rapidApiKey,
        rapidApiHost
      );

      const newMappings: CompetitorRoomMapping[] = rooms.map(r => {
        const rName = r.room_name.toLowerCase();
        let matchedType = 'UNMAPPED';
        for (const hr of hotelRooms) {
          if (rName.includes(hr.room_type.toLowerCase().split(' ')[0])) {
            matchedType = hr.room_type;
            break;
          }
        }

        return {
          competitor_hotel_id: hotel.competitor_hotel_id,
          competitor_hotel_name: hotel.competitor_hotel_name,
          competitor_room_id: r.competitor_room_id,
          competitor_room_name: r.room_name,
          gross_amount: r.gross_amount,
          our_room_type: matchedType
        };
      });

      setMappedRooms([...mappedRooms, ...newMappings]);
      showNotify(`Berjaya menambah ${hotel.competitor_hotel_name} dengan ${rooms.length} bilik!`, 'success');
    } catch (err: any) {
      showNotify(`Hotel ditambah, tapi gagal muat turun bilik: ${err.message}`, 'error');
    }
  };

  const handleRemoveCompetitorHotel = (hotelId: string) => {
    setCompetitorHotels(competitorHotels.filter(h => h.competitor_hotel_id !== hotelId));
    setMappedRooms(mappedRooms.filter(m => m.competitor_hotel_id !== hotelId));
    showNotify('Hotel pesaing dibuang.', 'info');
  };

  const handleUpdateMapping = (index: number, newType: string) => {
    const updated = [...mappedRooms];
    updated[index].our_room_type = newType;
    setMappedRooms(updated);
  };

  const handleExportInputWorkbook = () => {
    ExcelService.exportInputWorkbook(hotelName, hotelRooms, competitorHotels, mappedRooms);
    showNotify(`Fail Excel disimpan: ${hotelName}.xlsx (4 sheets)`, 'success');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await ExcelService.importInputWorkbook(file);
      if (data.hotelRooms.length > 0) setHotelRooms(data.hotelRooms);
      if (data.competitorHotels.length > 0) setCompetitorHotels(data.competitorHotels);
      if (data.mappedRooms.length > 0) setMappedRooms(data.mappedRooms);
      if (data.hotelName) setHotelName(data.hotelName);

      showNotify(`Berjaya memuat naik "${file.name}" (${data.mappedRooms.length} mapping).`, 'success');
    } catch (err: any) {
      showNotify(`Gagal membaca fail Excel: ${err.message}`, 'error');
    }
  };

  const filteredMappedRooms = mappedRooms.filter(r => {
    const matchesType = filterType === 'ALL' 
      ? true 
      : filterType === 'UNMAPPED' 
        ? r.our_room_type === 'UNMAPPED' 
        : r.our_room_type === filterType;
    const matchesHotel = filterHotel === 'ALL' ? true : r.competitor_hotel_id === filterHotel;
    return matchesType && matchesHotel;
  });

  const totalMappedCount = mappedRooms.filter(r => r.our_room_type !== 'UNMAPPED' && r.our_room_type !== 'IGNORE').length;

  return (
    <div className="space-y-6 pb-12">
      {/* Clean Editorial Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Flow 1: Hotel & Room Mapping Setup
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Daftar hotel pesaing Booking.com dan tentukan pemadanan (mapping) ID bilik ke jenis bilik hotel anda.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="cursor-pointer px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 shadow-xs">
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Muat Naik .xlsx</span>
            <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleExportInputWorkbook}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Eksport Input Workbook (.xlsx)</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between border ${
          notification.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
            : notification.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200'
              : 'bg-blue-50 text-blue-900 border-blue-200'
        }`}>
          <span>{notification.text}</span>
          <button onClick={() => setNotification(null)} className="text-[11px] underline ml-4 font-semibold">Tutup</button>
        </div>
      )}

      {/* Main Grid: Hotel Profile & Competitors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: hotel_data */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Sheet: hotel_data</h3>
                <p className="text-[11px] text-slate-500">Nama hotel & had kadar harga</p>
              </div>
              <button
                onClick={() => setShowAddRoom(!showAddRoom)}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Bilik
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">Nama Hotel Kita</label>
              <input
                type="text"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            {showAddRoom && (
              <form onSubmit={handleAddHotelRoom} className="mt-3.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="text-xs font-semibold text-slate-800">Tambah Jenis Bilik Baru</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-500">Kod Bilik</label>
                    <input
                      type="text"
                      placeholder="cth: Standard Queen"
                      value={newRoomType}
                      onChange={(e) => setNewRoomType(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Nama Penuh</label>
                    <input
                      type="text"
                      placeholder="cth: Standard Queen (No Window)"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Kadar Min (RM)</label>
                    <input
                      type="number"
                      value={newMinRate}
                      onChange={(e) => setNewMinRate(Number(e.target.value))}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Kadar Max (RM)</label>
                    <input
                      type="number"
                      value={newMaxRate}
                      onChange={(e) => setNewMaxRate(Number(e.target.value))}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddRoom(false)}
                    className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800"
                  >
                    Simpan
                  </button>
                </div>
              </form>
            )}

            <div className="mt-4 space-y-2">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Senarai Bilik ({hotelRooms.length})
              </div>
              {hotelRooms.map((room, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-xs text-slate-900 truncate">
                      {room.room_type}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {room.room_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs font-mono text-slate-700 tabular-nums">
                      RM {room.min_rate} - {room.max_rate}
                    </span>
                    <button
                      onClick={() => handleRemoveHotelRoom(idx)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      title="Buang bilik"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: competitor_hotel */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Sheet: competitor_hotel</h3>
                <p className="text-[11px] text-slate-500">Hotel pesaing yang dipantau ({competitorHotels.length})</p>
              </div>
            </div>

            <form onSubmit={handleSearchCompetitors} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Cari hotel di Booking.com (cth: Premiere Klang, Crystal Crown)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0"
              >
                {searching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                {searching ? 'Mencari...' : 'Cari Hotel'}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 max-h-52 overflow-y-auto">
                <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                  <span>Hasil Carian ({searchResults.length})</span>
                  <button onClick={() => setSearchResults([])} className="text-slate-500 hover:text-slate-900">Tutup</button>
                </div>
                {searchResults.map((res, sIdx) => {
                  const isTracked = competitorHotels.some(h => h.competitor_hotel_id === res.competitor_hotel_id);
                  return (
                    <div
                      key={`search_res_${res.competitor_hotel_id}_${sIdx}`}
                      className="p-2 bg-white rounded-md border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{res.competitor_hotel_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          ID: {res.competitor_hotel_id} · {res.city || res.address}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddCompetitorHotel(res)}
                        disabled={isTracked}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          isTracked
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {isTracked ? 'Dipantau' : '+ Tambah'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 space-y-2">
              {competitorHotels.map((comp, cIdx) => {
                const roomCount = mappedRooms.filter(m => m.competitor_hotel_id === comp.competitor_hotel_id).length;
                return (
                  <div
                    key={`comp_hotel_${comp.competitor_hotel_id}_${cIdx}`}
                    className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {comp.competitor_hotel_name}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          (ID: {comp.competitor_hotel_id})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {comp.city || comp.address || 'Malaysia'} · {roomCount} bilik ditemui
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {comp.review_score && (
                        <span className="text-xs font-semibold text-slate-700">
                          ★ {comp.review_score}
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveCompetitorHotel(comp.competitor_hotel_id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Buang hotel"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Full Width Table: competitor_room */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-200 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-sm">Sheet: competitor_room</h3>
              <span className="text-xs text-slate-500">
                ({totalMappedCount} daripada {mappedRooms.length} telah dipetakan)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Padankan setiap ID bilik pesaing kepada jenis bilik hotel anda.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">Tapis Hotel:</span>
            <select
              value={filterHotel}
              onChange={(e) => setFilterHotel(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1 bg-white focus:outline-none"
            >
              <option value="ALL">Semua Hotel</option>
              {competitorHotels.map((h, hIdx) => (
                <option key={`filter_hotel_${h.competitor_hotel_id}_${hIdx}`} value={h.competitor_hotel_id}>
                  {h.competitor_hotel_name}
                </option>
              ))}
            </select>

            <span className="text-xs text-slate-500 font-medium ml-2">Mapping:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1 bg-white focus:outline-none"
            >
              <option value="ALL">Semua Bilik</option>
              <option value="UNMAPPED">Perlu Dipadankan</option>
              {hotelRooms.map((r, rIdx) => (
                <option key={`filter_room_${r.room_type}_${rIdx}`} value={r.room_type}>
                  {r.room_type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <th className="py-2.5 px-3">Hotel Pesaing</th>
                <th className="py-2.5 px-3">ID Bilik</th>
                <th className="py-2.5 px-3">Nama Bilik Pesaing</th>
                <th className="py-2.5 px-3">Kadar Anggaran</th>
                <th className="py-2.5 px-3 w-64">Padankan ke Jenis Bilik</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMappedRooms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Tiada bilik pesaing dijumpai.
                  </td>
                </tr>
              ) : (
                filteredMappedRooms.map((room, idx) => {
                  const actualIndex = mappedRooms.findIndex(
                    m => m.competitor_hotel_id === room.competitor_hotel_id && m.competitor_room_id === room.competitor_room_id
                  );
                  const isMapped = room.our_room_type && room.our_room_type !== 'UNMAPPED' && room.our_room_type !== 'IGNORE';

                  return (
                    <tr
                      key={`mapped_room_${room.competitor_hotel_id}_${room.competitor_room_id}_${idx}`}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {room.competitor_hotel_name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {room.competitor_room_id}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {room.competitor_room_name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-900 tabular-nums">
                        {room.gross_amount ? `RM ${room.gross_amount}` : <span className="text-slate-400 italic">N/A</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={room.our_room_type || 'UNMAPPED'}
                          onChange={(e) => handleUpdateMapping(actualIndex, e.target.value)}
                          className={`w-full py-1 px-2 rounded-md text-xs border transition-colors focus:outline-none ${
                            isMapped
                              ? 'bg-white text-slate-900 border-slate-300 font-medium'
                              : 'bg-amber-50/50 text-amber-900 border-amber-300 font-normal'
                          }`}
                        >
                          <option value="UNMAPPED">-- Belum Dipadankan --</option>
                          <option value="IGNORE">Abaikan (Jangan Pantau)</option>
                          <optgroup label="Jenis Bilik Kita">
                            {hotelRooms.map((h, hIdx) => (
                              <option key={`opt_hotel_room_${h.room_type}_${hIdx}`} value={h.room_type}>
                                {h.room_type} (RM {h.min_rate}-{h.max_rate})
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isMapped ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Dipadankan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Menunggu
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Hanya bilik yang telah dipadankan akan dimasukkan dalam laporan Flow 2.
          </span>
          <button
            onClick={onResetDefaults}
            className="text-xs text-slate-600 hover:text-slate-900 underline flex items-center gap-1 font-medium"
          >
            Muat Semula Contoh D'Spark Bayu
          </button>
        </div>

        {totalMappedCount > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs text-white">
                  Langkah Seterusnya: Bilik Telah Siap Dipadankan ({totalMappedCount} bilik aktif)
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Anda kini boleh eksport fail input Excel (.xlsx) sebagai fail rujukan hotel, atau terus beralih ke <strong>Flow 2</strong> untuk mengekstrak harga pasaran Booking.com terkini.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExportInputWorkbook}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Eksport .xlsx</span>
              </button>

              {onProceedToFlow2 && (
                <button
                  onClick={onProceedToFlow2}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <span>Ke Flow 2: Pantau Harga</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
