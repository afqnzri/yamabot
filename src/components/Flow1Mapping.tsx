import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Search, 
  Download, 
  Upload, 
  RefreshCw, 
  ArrowRight, 
  CheckCircle2,
  Calendar,
  Zap,
  Info,
  ExternalLink,
  Building2,
  BedDouble,
  Sliders,
  Check,
  AlertTriangle,
  Database,
  Save
} from 'lucide-react';
import { HotelRoomType, CompetitorHotel, CompetitorRoomMapping } from '../types/yama';
import { ExcelService } from '../services/excelService';
import { RapidApiService } from '../services/rapidApiService';
import { DbClientService } from '../services/dbClientService';

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
  onOpenDatabase?: () => void;
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
  onProceedToFlow2,
  onOpenDatabase
}) => {
  // Discovery Dates for Step 3 (Get Hotel Details) and Step 4 (Get Room List)
  const defaultArr = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const defaultDep = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const [discoveryArrival, setDiscoveryArrival] = useState(defaultArr);
  const [discoveryDeparture, setDiscoveryDeparture] = useState(defaultDep);
  const [showDateSettings, setShowDateSettings] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CompetitorHotel[]>([]);

  // Filtering state
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterHotel, setFilterHotel] = useState<string>('ALL');

  // Add room modal/form state
  const [newRoomType, setNewRoomType] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newMinRate, setNewMinRate] = useState(90);
  const [newMaxRate, setNewMaxRate] = useState(150);
  const [showAddRoom, setShowAddRoom] = useState(false);

  // Batch / Single Fetching State
  const [isBatchFetching, setIsBatchFetching] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; hotelName: string } | null>(null);
  const [fetchingHotelId, setFetchingHotelId] = useState<string | null>(null);

  // Notification state
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showNotify = (text: string, type: 'success' | 'info' | 'error' = 'info') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSaveToDatabase = async () => {
    if (!hotelName && hotelRooms.length === 0) {
      showNotify('No hotel data to save. Please add hotel rooms or upload an Excel workbook first.', 'error');
      return;
    }
    const res = await DbClientService.saveSetup({
      hotelName: hotelName || 'My Hotel',
      hotelRooms,
      competitorHotels,
      mappedRooms
    });
    if (res.success) {
      showNotify(`Saved ${hotelName || 'hotel'} (${mappedRooms.length} mapped rooms) to Cloudflare D1 / SQLite database!`, 'success');
    } else {
      showNotify(`Failed to save to database: ${res.message}`, 'error');
    }
  };

  const handleLoadFromDatabase = async () => {
    const setup = await DbClientService.getSavedSetup();
    if (setup && (setup.hotelRooms.length > 0 || setup.mappedRooms.length > 0)) {
      setHotelName(setup.hotelName);
      setHotelRooms(setup.hotelRooms);
      setCompetitorHotels(setup.competitorHotels);
      setMappedRooms(setup.mappedRooms);
      showNotify(`Loaded ${setup.hotelName} (${setup.mappedRooms.length} room mappings) from database!`, 'success');
    } else {
      showNotify('No saved hotel setup found in database. Upload an Excel workbook or configure rooms and click "Save to DB".', 'info');
    }
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
    showNotify(`Room type "${added.room_type}" added to hotel_data.`, 'success');
  };

  const handleRemoveHotelRoom = (index: number) => {
    const roomToRemove = hotelRooms[index];
    setHotelRooms(hotelRooms.filter((_, i) => i !== index));
    setMappedRooms(mappedRooms.map(m => m.our_room_type === roomToRemove.room_type ? { ...m, our_room_type: 'UNMAPPED' } : m));
    showNotify(`Room "${roomToRemove.room_type}" removed.`, 'info');
  };

  // Step 2: Search Competitor Hotels (RapidAPI searchDestination or Direct Hotel ID)
  const handleSearchCompetitors = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);
    try {
      // If user typed a numeric ID directly (e.g. 104258), try direct lookup
      if (/^\d+$/.test(query)) {
        showNotify(`Querying hotel details for ID ${query}...`, 'info');
        const details = await RapidApiService.getHotelDetails(
          query,
          discoveryArrival,
          discoveryDeparture,
          rapidApiKey,
          rapidApiHost
        );
        setSearchResults([details]);
        setSearching(false);
        return;
      }

      const results = await RapidApiService.searchHotels(query, rapidApiKey, rapidApiHost);
      setSearchResults(results);
      if (results.length === 0) {
        showNotify(`No hotels found on Booking.com for "${query}".`, 'info');
      }
    } catch (err: any) {
      showNotify(`Search error: ${err.message}`, 'error');
    } finally {
      setSearching(false);
    }
  };

  /**
   * Helper: Matches competitor room name to our hotel room types using keyword proximity
   */
  const matchRoomType = (roomName: string): string => {
    const rName = roomName.toLowerCase();
    for (const hr of hotelRooms) {
      const tokens = hr.room_type.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      for (const t of tokens) {
        if (rName.includes(t)) {
          return hr.room_type;
        }
      }
    }
    return 'UNMAPPED';
  };

  /**
   * Step 3 & Step 4: Fetch single hotel details & rooms, and generate to competitor_room
   */
  const fetchAndGenerateForHotel = async (hotel: CompetitorHotel): Promise<{ updatedHotel: CompetitorHotel; roomsCount: number }> => {
    // Step 3: GET Get Hotel Details
    const details = await RapidApiService.getHotelDetails(
      hotel.competitor_hotel_id,
      discoveryArrival,
      discoveryDeparture,
      rapidApiKey,
      rapidApiHost
    );

    const mergedHotel: CompetitorHotel = {
      ...hotel,
      ...details,
      competitor_hotel_name: details.competitor_hotel_name || hotel.competitor_hotel_name
    };

    // Step 4: GET Get Room List
    const rooms = await RapidApiService.getRoomList(
      hotel.competitor_hotel_id,
      discoveryArrival,
      discoveryDeparture,
      rapidApiKey,
      rapidApiHost
    );

    // Map to competitor_room structure
    const newMappings: CompetitorRoomMapping[] = rooms.map(r => ({
      competitor_hotel_id: hotel.competitor_hotel_id,
      competitor_hotel_name: mergedHotel.competitor_hotel_name,
      competitor_room_id: r.competitor_room_id,
      competitor_room_name: r.room_name,
      gross_amount: r.gross_amount,
      our_room_type: matchRoomType(r.room_name)
    }));

    // Update mappedRooms: replace existing records for this hotel with freshly fetched ones
    setMappedRooms(prev => {
      const filtered = prev.filter(m => m.competitor_hotel_id !== hotel.competitor_hotel_id);
      return [...filtered, ...newMappings];
    });

    return { updatedHotel: mergedHotel, roomsCount: newMappings.length };
  };

  /**
   * Add Competitor Hotel from Search -> Triggers Step 3 (Details) & Step 4 (Rooms)
   */
  const handleAddCompetitorHotel = async (hotel: CompetitorHotel) => {
    if (competitorHotels.some(h => h.competitor_hotel_id === hotel.competitor_hotel_id)) {
      showNotify(`Hotel "${hotel.competitor_hotel_name}" is already in your tracking list.`, 'info');
      return;
    }

    setFetchingHotelId(hotel.competitor_hotel_id);
    showNotify(`Adding ${hotel.competitor_hotel_name} and fetching rooms from Booking.com API...`, 'info');

    try {
      const { updatedHotel, roomsCount } = await fetchAndGenerateForHotel(hotel);
      setCompetitorHotels(prev => [...prev, updatedHotel]);
      showNotify(`Successfully added ${updatedHotel.competitor_hotel_name} & generated ${roomsCount} rooms in Sheet: competitor_room!`, 'success');
    } catch (err: any) {
      // Fallback: still add hotel if details worked
      setCompetitorHotels(prev => [...prev, hotel]);
      showNotify(`Hotel added, but room list query failed: ${err.message}`, 'error');
    } finally {
      setFetchingHotelId(null);
    }
  };

  /**
   * Re-sync / Fetch rooms for a single hotel in the competitor list
   */
  const handleRefreshSingleHotel = async (hotel: CompetitorHotel) => {
    setFetchingHotelId(hotel.competitor_hotel_id);
    try {
      const { updatedHotel, roomsCount } = await fetchAndGenerateForHotel(hotel);
      setCompetitorHotels(prev => prev.map(h => h.competitor_hotel_id === hotel.competitor_hotel_id ? updatedHotel : h));
      showNotify(`Updated ${updatedHotel.competitor_hotel_name}: ${roomsCount} rooms generated.`, 'success');
    } catch (err: any) {
      showNotify(`Failed to fetch rooms for ${hotel.competitor_hotel_name}: ${err.message}`, 'error');
    } finally {
      setFetchingHotelId(null);
    }
  };

  /**
   * BATCH ACTION: Auto-discover & generate rooms for all competitor hotels
   * Reads competitor_hotel_search from competitor_hotel tab,
   * queries searchDestination, getHotelDetails (Step 3), and getRoomList (Step 4),
   * and populates both competitor_hotel and competitor_room!
   */
  const handleAutoGenerateAllRooms = async (hotelsToProcess?: CompetitorHotel[] | unknown) => {
    const list = Array.isArray(hotelsToProcess) ? hotelsToProcess : competitorHotels;
    if (list.length === 0) {
      showNotify('No competitor hotels found in Sheet: competitor_hotel. Please add hotels or upload a workbook.', 'error');
      return;
    }

    setIsBatchFetching(true);
    try {
      const resolved = await RapidApiService.resolveCompetitorsAndRooms(
        list,
        hotelRooms,
        discoveryArrival,
        discoveryDeparture,
        rapidApiKey,
        rapidApiHost,
        (current, total, hotelName) => {
          setBatchProgress({ current, total, hotelName });
        }
      );

      setCompetitorHotels(resolved.updatedHotels);
      setMappedRooms(resolved.generatedRooms);
      showNotify(
        `Successfully read competitor_hotel_search! Discovered ${resolved.updatedHotels.length} hotels & generated ${resolved.generatedRooms.length} rooms in Sheet: competitor_room!`,
        'success'
      );
    } catch (err: any) {
      showNotify(`Batch generation failed: ${err.message}`, 'error');
    } finally {
      setIsBatchFetching(false);
      setBatchProgress(null);
    }
  };

  const handleRemoveCompetitorHotel = (hotelId: string) => {
    setCompetitorHotels(competitorHotels.filter(h => h.competitor_hotel_id !== hotelId));
    setMappedRooms(mappedRooms.filter(m => m.competitor_hotel_id !== hotelId));
    showNotify('Competitor hotel and its room mappings removed.', 'info');
  };

  const handleUpdateMapping = (index: number, newType: string) => {
    const updated = [...mappedRooms];
    updated[index].our_room_type = newType;
    setMappedRooms(updated);
  };

  const handleExportInputWorkbook = () => {
    ExcelService.exportInputWorkbook(hotelName, hotelRooms, competitorHotels, mappedRooms);
    showNotify(`Excel workbook exported: ${hotelName || 'hotel_mapping'}.xlsx with all 4 sheets!`, 'success');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await ExcelService.importInputWorkbook(file);
      if (data.hotelName) setHotelName(data.hotelName);
      if (data.hotelRooms.length > 0) setHotelRooms(data.hotelRooms);

      const compHotels = data.competitorHotels;
      const fileMappedRooms = data.mappedRooms;

      if (compHotels.length > 0) {
        setCompetitorHotels(compHotels);

        // Always resolve if any hotel has competitor_hotel_search, lacks competitor_hotel_id, or competitor_room is empty
        const hasSearchQueries = compHotels.some(h => !!h.competitor_hotel_search);
        const hasMissingRooms = fileMappedRooms.length === 0 || compHotels.some(
          h => !h.competitor_hotel_id || !fileMappedRooms.some(m => m.competitor_hotel_id === h.competitor_hotel_id)
        );

        if (hasSearchQueries || hasMissingRooms) {
          showNotify(
            `Reading competitor_hotel_search from Tab competitor_hotel... Auto-generating ${compHotels.length} hotels and listing all rooms into Sheet: competitor_room!`,
            'info'
          );
          setIsBatchFetching(true);
          try {
            const resolved = await RapidApiService.resolveCompetitorsAndRooms(
              compHotels,
              data.hotelRooms.length > 0 ? data.hotelRooms : hotelRooms,
              discoveryArrival,
              discoveryDeparture,
              rapidApiKey,
              rapidApiHost,
              (current, total, hotelName) => {
                setBatchProgress({ current, total, hotelName });
              }
            );

            // Preserve any existing user mappings if present
            let finalRooms = resolved.generatedRooms;
            if (fileMappedRooms.length > 0) {
              finalRooms = finalRooms.map(gen => {
                const existing = fileMappedRooms.find(
                  ex => (ex.competitor_room_id && ex.competitor_room_id === gen.competitor_room_id) ||
                        (ex.competitor_hotel_id === gen.competitor_hotel_id && ex.competitor_room_name.toLowerCase() === gen.competitor_room_name.toLowerCase())
                );
                if (existing && existing.our_room_type && existing.our_room_type !== 'UNMAPPED') {
                  return { ...gen, our_room_type: existing.our_room_type };
                }
                return gen;
              });
            }

            setCompetitorHotels(resolved.updatedHotels);
            setMappedRooms(finalRooms);
            showNotify(
              `Read competitor_hotel_search successfully! Populated ${resolved.updatedHotels.length} competitor hotels and generated ${finalRooms.length} rooms in Sheet: competitor_room.`,
              'success'
            );
          } catch (autoErr: any) {
            console.warn('Auto-resolution failed:', autoErr);
            if (fileMappedRooms.length > 0) setMappedRooms(fileMappedRooms);
          } finally {
            setIsBatchFetching(false);
            setBatchProgress(null);
          }
        } else {
          setMappedRooms(fileMappedRooms);
          showNotify(`Successfully uploaded "${file.name}" (${compHotels.length} hotels, ${fileMappedRooms.length} mappings).`, 'success');
        }
      } else {
        if (fileMappedRooms.length > 0) setMappedRooms(fileMappedRooms);
        showNotify(`Successfully uploaded "${file.name}".`, 'success');
      }
    } catch (err: any) {
      showNotify(`Failed to read Excel workbook: ${err.message}`, 'error');
    }
  };

  // Find hotels with missing rooms
  const hotelsWithNoRooms = competitorHotels.filter(
    h => !mappedRooms.some(m => m.competitor_hotel_id === h.competitor_hotel_id)
  );

  const filteredMappedRooms = mappedRooms.filter(r => {
    const matchesType = filterType === 'ALL' 
      ? true 
      : filterType === 'UNMAPPED' 
        ? r.our_room_type === 'UNMAPPED' 
        : r.our_room_type === filterType;
    const matchesHotel = filterHotel === 'ALL' ? true : r.competitor_hotel_id === filterHotel;
    return matchesType && matchesHotel;
  });

  const totalMappedCount = mappedRooms.filter(
    r => r.our_room_type !== 'UNMAPPED' && r.our_room_type !== 'IGNORE' && r.our_room_type !== ''
  ).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Flow 1: Initial Hotel & Room Mapping Setup
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              Onboarding
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure room types, discover competitors via Booking.com API, and generate room mappings into <code>competitor_room</code>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleLoadFromDatabase}
            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs"
            title="Load saved hotel and room mappings from database"
          >
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            <span>Load from DB</span>
          </button>

          <button
            onClick={handleSaveToDatabase}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs"
            title="Save current hotel configuration into database"
          >
            <Save className="w-3.5 h-3.5 text-emerald-600" />
            <span>Save to DB</span>
          </button>

          <label className="cursor-pointer px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 shadow-xs">
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Upload .xlsx</span>
            <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleExportInputWorkbook}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Input Workbook (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* 4-Step Process Guide Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-4 text-white shadow-sm border border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-700/80">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Automated 4-Step Architecture
            </span>
          </div>
          <button
            onClick={() => setShowDateSettings(!showDateSettings)}
            className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 underline decoration-slate-500"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>Discovery Dates: {discoveryArrival} → {discoveryDeparture}</span>
            <Sliders className="w-3 h-3 text-slate-400" />
          </button>
        </div>

        {/* Discovery Date Settings dropdown */}
        {showDateSettings && (
          <div className="mt-3 p-3 bg-slate-800/90 rounded-lg border border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Discovery Arrival Date (Step 3 & 4):</label>
              <input
                type="date"
                value={discoveryArrival}
                onChange={(e) => setDiscoveryArrival(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 text-white border border-slate-700 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Discovery Departure Date (Step 3 & 4):</label>
              <input
                type="date"
                value={discoveryDeparture}
                onChange={(e) => setDiscoveryDeparture(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 text-white border border-slate-700 text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* The 4 Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <div className="bg-slate-800/70 p-2.5 rounded-lg border border-slate-700 text-xs">
            <div className="text-amber-400 font-bold mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center text-[10px]">1</span>
              <span>Step 1: hotel_data</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Enter your hotel's room types and rate boundaries (min / max rate).
            </p>
          </div>

          <div className="bg-slate-800/70 p-2.5 rounded-lg border border-slate-700 text-xs">
            <div className="text-blue-400 font-bold mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-400/20 text-blue-300 flex items-center justify-center text-[10px]">2</span>
              <span>Step 2: Search Destination</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Query competitor hotel by name or ID via <code>searchDestination</code>.
            </p>
          </div>

          <div className="bg-slate-800/70 p-2.5 rounded-lg border border-slate-700 text-xs">
            <div className="text-purple-400 font-bold mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-purple-400/20 text-purple-300 flex items-center justify-center text-[10px]">3</span>
              <span>Step 3: Hotel Details</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Auto-fill address, city, rating via <code>getHotelDetails</code> to <code>competitor_hotel</code>.
            </p>
          </div>

          <div className="bg-slate-800/70 p-2.5 rounded-lg border border-slate-700 text-xs">
            <div className="text-emerald-400 font-bold mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center justify-center text-[10px]">4</span>
              <span>Step 4: Room Discovery</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Auto-fetch room IDs & rates via <code>getRoomList</code> to <code>competitor_room</code>.
            </p>
          </div>
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
          <button onClick={() => setNotification(null)} className="text-[11px] underline ml-4 font-semibold">Dismiss</button>
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
                <p className="text-[11px] text-slate-500">Our hotel name & room rate limits</p>
              </div>
              <button
                onClick={() => setShowAddRoom(!showAddRoom)}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Room
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">Our Hotel Name</label>
              <input
                type="text"
                placeholder="e.g. MSP D'Spark Hotel Bayu"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            {showAddRoom && (
              <form onSubmit={handleAddHotelRoom} className="mt-3.5 p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="text-xs font-semibold text-slate-800">Add New Room Type</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-500">Room Code</label>
                    <input
                      type="text"
                      placeholder="e.g. Standard Queen"
                      value={newRoomType}
                      onChange={(e) => setNewRoomType(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Standard Queen (No Window)"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Min Rate (RM)</label>
                    <input
                      type="number"
                      value={newMinRate}
                      onChange={(e) => setNewMinRate(Number(e.target.value))}
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Max Rate (RM)</label>
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
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}

            <div className="mt-4 space-y-2">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Room List ({hotelRooms.length})
              </div>
              {hotelRooms.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
                  No rooms added yet. Click <strong>+ Add Room</strong> above or load the sample template.
                </div>
              ) : (
                hotelRooms.map((room, idx) => (
                  <div
                    key={`hotel_room_${idx}`}
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
                      <span className="text-xs font-mono text-slate-700 tabular-nums font-medium">
                        RM {room.min_rate} - {room.max_rate}
                      </span>
                      <button
                        onClick={() => handleRemoveHotelRoom(idx)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Remove room"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: competitor_hotel */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Sheet: competitor_hotel</h3>
                <p className="text-[11px] text-slate-500">Tracked competitor hotels ({competitorHotels.length})</p>
              </div>

              {/* Automatic Discovery Button for all Tracked Hotels */}
              {competitorHotels.length > 0 && (
                <button
                  onClick={handleAutoGenerateAllRooms}
                  disabled={isBatchFetching}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                  title="Automatically call Step 3 (Get Hotel Details) and Step 4 (Get Room List) for all hotels"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isBatchFetching ? 'animate-spin' : ''}`} />
                  <span>{isBatchFetching ? 'Auto-Generating Rooms...' : `⚡ Auto-Generate All Rooms (${competitorHotels.length} Hotels)`}</span>
                </button>
              )}
            </div>

            {/* Batch Progress Bar */}
            {isBatchFetching && batchProgress && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1.5">
                <div className="flex justify-between font-semibold text-emerald-900 text-[11px]">
                  <span>Fetching Hotel {batchProgress.current} of {batchProgress.total}:</span>
                  <span>{batchProgress.hotelName}</span>
                </div>
                <div className="w-full bg-emerald-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-emerald-700">
                  Executing Step 3 (GET Get Hotel Details) &amp; Step 4 (GET Get Room List)...
                </p>
              </div>
            )}

            {/* Alert if competitor hotels have 0 rooms */}
            {hotelsWithNoRooms.length > 0 && !isBatchFetching && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-900">
                      {hotelsWithNoRooms.length} competitor hotel{hotelsWithNoRooms.length > 1 ? 's' : ''} have 0 rooms generated in Sheet: competitor_room!
                    </div>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Click the button on the right to automatically discover room IDs and prices via Booking.com API.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleAutoGenerateAllRooms}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-bold text-xs shrink-0 transition-colors shadow-xs"
                >
                  ⚡ Auto-Generate Now
                </button>
              </div>
            )}

            {/* Search or Enter Hotel ID */}
            <form onSubmit={handleSearchCompetitors} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by hotel name (e.g. Premiere Klang) or enter Hotel ID directly (e.g. 104258)..."
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
                {searching ? 'Finding...' : 'Find Hotel'}
              </button>
            </form>

            {/* Search Results Display */}
            {searchResults.length > 0 && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 max-h-56 overflow-y-auto">
                <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                  <span>Found {searchResults.length} Hotel{searchResults.length > 1 ? 's' : ''}</span>
                  <button onClick={() => setSearchResults([])} className="text-slate-500 hover:text-slate-900">Close</button>
                </div>
                {searchResults.map((res, sIdx) => {
                  const isTracked = competitorHotels.some(h => h.competitor_hotel_id === res.competitor_hotel_id);
                  const isCurrentFetching = fetchingHotelId === res.competitor_hotel_id;
                  return (
                    <div
                      key={`search_res_${res.competitor_hotel_id}_${sIdx}`}
                      className="p-2.5 bg-white rounded-md border border-slate-200 flex items-center justify-between text-xs gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{res.competitor_hotel_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          ID: {res.competitor_hotel_id} · {res.city || res.address || 'Malaysia'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddCompetitorHotel(res)}
                        disabled={isTracked || isCurrentFetching}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1 shrink-0 ${
                          isTracked
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                        }`}
                      >
                        {isCurrentFetching ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Fetching...</span>
                          </>
                        ) : isTracked ? (
                          'Already Tracked'
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Add &amp; Fetch Rooms</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* List of Tracked Competitor Hotels */}
            <div className="mt-4 space-y-2">
              {competitorHotels.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
                  No competitor hotels added yet. Use the search box above to find hotels or click <strong>Load Sample D'Spark Bayu</strong> below.
                </div>
              ) : (
                competitorHotels.map((comp, cIdx) => {
                  const hotelRoomCount = mappedRooms.filter(m => m.competitor_hotel_id === comp.competitor_hotel_id).length;
                  const isCurrentFetching = fetchingHotelId === comp.competitor_hotel_id;

                  return (
                    <div
                      key={`comp_hotel_${comp.competitor_hotel_id}_${cIdx}`}
                      className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-slate-900">
                            {comp.competitor_hotel_name}
                          </span>
                          {comp.competitor_hotel_search && (
                            <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200" title="competitor_hotel_search from workbook">
                              Search: "{comp.competitor_hotel_search}"
                            </span>
                          )}
                          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            ID: {comp.competitor_hotel_id || 'Pending lookup'}
                          </span>
                          {comp.review_score && (
                            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              ★ {comp.review_score}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-1 flex items-center gap-2">
                          <span>{comp.city || comp.address || 'Malaysia'}</span>
                          <span>•</span>
                          <span className={`font-semibold ${hotelRoomCount > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {hotelRoomCount > 0 ? `✓ ${hotelRoomCount} rooms in Sheet: competitor_room` : '⚠️ 0 rooms fetched'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Per-hotel Refresh Rooms Button */}
                        <button
                          onClick={() => handleRefreshSingleHotel(comp)}
                          disabled={isCurrentFetching || isBatchFetching}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors flex items-center gap-1.5"
                          title="Fetch or refresh room list from Booking.com API"
                        >
                          <RefreshCw className={`w-3 h-3 ${isCurrentFetching ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
                          <span className="hidden sm:inline">{isCurrentFetching ? 'Fetching...' : 'Re-sync Rooms'}</span>
                        </button>

                        <button
                          onClick={() => handleRemoveCompetitorHotel(comp.competitor_hotel_id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                          title="Remove hotel and room mappings"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full Width Table: Sheet: competitor_room */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-200 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-sm">Sheet: competitor_room</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                {totalMappedCount} of {mappedRooms.length} mapped
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Competitor room IDs &amp; names automatically discovered via Booking.com API. Map each room to your hotel room type.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">Filter Hotel:</span>
            <select
              value={filterHotel}
              onChange={(e) => setFilterHotel(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1 bg-white focus:outline-none"
            >
              <option value="ALL">All Hotels ({competitorHotels.length})</option>
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
              <option value="ALL">All Status</option>
              <option value="UNMAPPED">Pending / Unmapped</option>
              {hotelRooms.map((hr, hrIdx) => (
                <option key={`filter_type_${hr.room_type}_${hrIdx}`} value={hr.room_type}>
                  {hr.room_type}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* competitor_room Table */}
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-2.5 px-3">Competitor Hotel</th>
                <th className="py-2.5 px-3 font-mono">Room ID</th>
                <th className="py-2.5 px-3">Competitor Room Name</th>
                <th className="py-2.5 px-3 text-right">Sample Rate</th>
                <th className="py-2.5 px-3">Our Room Type (hotel_data)</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMappedRooms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {competitorHotels.length === 0 ? (
                      <div>No competitor hotels added yet. Find hotels above to start discovery.</div>
                    ) : mappedRooms.length === 0 ? (
                      <div className="space-y-2">
                        <div className="text-slate-600 font-medium">
                          No rooms generated in Sheet: competitor_room yet.
                        </div>
                        <button
                          onClick={handleAutoGenerateAllRooms}
                          disabled={isBatchFetching}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 shadow-xs"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Auto-Generate Rooms for All {competitorHotels.length} Hotels via API</span>
                        </button>
                      </div>
                    ) : (
                      <div>No rooms matching the selected filter.</div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredMappedRooms.map((mapping, mIdx) => {
                  const globalIdx = mappedRooms.findIndex(
                    m => m.competitor_hotel_id === mapping.competitor_hotel_id && m.competitor_room_id === mapping.competitor_room_id
                  );
                  const isMapped = mapping.our_room_type && mapping.our_room_type !== 'UNMAPPED' && mapping.our_room_type !== 'IGNORE';

                  return (
                    <tr
                      key={`mapped_row_${mapping.competitor_hotel_id}_${mapping.competitor_room_id}_${mIdx}`}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-slate-900 max-w-[180px] truncate">
                        {mapping.competitor_hotel_name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {mapping.competitor_room_id}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-medium max-w-[240px] truncate">
                        {mapping.competitor_room_name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 tabular-nums">
                        {typeof mapping.gross_amount === 'number' && mapping.gross_amount > 0 ? (
                          `RM ${mapping.gross_amount.toFixed(2)}`
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={mapping.our_room_type || 'UNMAPPED'}
                          onChange={(e) => handleUpdateMapping(globalIdx, e.target.value)}
                          className={`text-xs border rounded-lg px-2.5 py-1 focus:outline-none font-medium ${
                            isMapped
                              ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900 font-semibold'
                              : mapping.our_room_type === 'IGNORE'
                                ? 'border-slate-200 bg-slate-100 text-slate-500'
                                : 'border-amber-300 bg-amber-50 text-amber-900 font-semibold'
                          }`}
                        >
                          <option value="UNMAPPED">-- Select Room Type (Unmapped) --</option>
                          <optgroup label="Our Room Types (hotel_data)">
                            {hotelRooms.map((hr, hrIdx) => (
                              <option key={`opt_${hr.room_type}_${hrIdx}`} value={hr.room_type}>
                                {hr.room_type} (RM {hr.min_rate}-{hr.max_rate})
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Options">
                            <option value="IGNORE">IGNORE (Do not track)</option>
                          </optgroup>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isMapped ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Mapped
                          </span>
                        ) : mapping.our_room_type === 'IGNORE' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            Ignored
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Pending
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

        <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
          <span>
            Only mapped rooms will be queried and analyzed in Flow 2 price extraction reports.
          </span>
          <button
            onClick={onResetDefaults}
            className="text-xs text-slate-600 hover:text-slate-900 underline flex items-center gap-1 font-medium"
          >
            Load Sample D'Spark Bayu (6 Competitors)
          </button>
        </div>

        {totalMappedCount > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs text-white">
                  Next Step: Rooms Successfully Mapped ({totalMappedCount} active rooms)
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  You can now export the input Excel workbook (.xlsx) as your hotel reference, or proceed directly to <strong>Flow 2: Price Monitoring</strong> to extract live Booking.com market prices.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExportInputWorkbook}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export .xlsx</span>
              </button>

              {onProceedToFlow2 && (
                <button
                  onClick={onProceedToFlow2}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <span>Proceed to Flow 2: Price Monitoring</span>
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
