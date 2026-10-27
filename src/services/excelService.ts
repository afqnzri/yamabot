import * as XLSX from 'xlsx';
import { HotelRoomType, CompetitorHotel, CompetitorRoomMapping, PriceReportRow } from '../types/yama';

export class ExcelService {
  /**
   * Generates the Flow 1 Input Workbook with all 4 sheets:
   * - hotel_data
   * - competitor_hotel
   * - competitor_room
   * - competitor_price
   */
  static exportInputWorkbook(
    hotelName: string,
    hotelRooms: HotelRoomType[],
    competitorHotels: CompetitorHotel[],
    mappedRooms: CompetitorRoomMapping[]
  ): void {
    const wb = XLSX.utils.book_new();

    // 1. hotel_data
    const hotelDataRows = hotelRooms.map(r => ({
      hotel_name: hotelName,
      room_type: r.room_type,
      room_name: r.room_name,
      min_rate: r.min_rate,
      max_rate: r.max_rate
    }));
    const wsHotel = XLSX.utils.json_to_sheet(hotelDataRows);
    XLSX.utils.book_append_sheet(wb, wsHotel, 'hotel_data');

    // 2. competitor_hotel
    const compHotelRows = competitorHotels.map(h => ({
      competitor_hotel_id: h.competitor_hotel_id,
      competitor_hotel_name: h.competitor_hotel_name,
      address: h.address || '',
      city: h.city || '',
      review_score: h.review_score || '',
      url: h.url || ''
    }));
    const wsCompHotel = XLSX.utils.json_to_sheet(compHotelRows);
    XLSX.utils.book_append_sheet(wb, wsCompHotel, 'competitor_hotel');

    // 3. competitor_room
    const compRoomRows = mappedRooms.map(m => ({
      competitor_hotel_id: m.competitor_hotel_id,
      competitor_hotel_name: m.competitor_hotel_name,
      competitor_room_id: m.competitor_room_id,
      competitor_room_name: m.competitor_room_name,
      gross_amount: m.gross_amount ?? '',
      our_room_type: m.our_room_type
    }));
    const wsCompRoom = XLSX.utils.json_to_sheet(compRoomRows);
    XLSX.utils.book_append_sheet(wb, wsCompRoom, 'competitor_room');

    // 4. competitor_price (Template)
    const compPriceRows = hotelRooms.map(r => ({
      our_room_type: r.room_type,
      our_min_rate: r.min_rate,
      our_max_rate: r.max_rate,
      lowest_competitor_price: '',
      average_competitor_price: '',
      status: 'Template'
    }));
    const wsPrice = XLSX.utils.json_to_sheet(compPriceRows);
    XLSX.utils.book_append_sheet(wb, wsPrice, 'competitor_price');

    // Save
    const cleanFilename = `${hotelName}.xlsx`;
    XLSX.writeFile(wb, cleanFilename);
  }

  /**
   * Generates the Flow 2 Dated Output Workbook.
   * Specification rules:
   * - Contains ONLY 2 sheets: competitor_room and competitor_price
   * - Missing/invalid prices marked N/A and excluded from average/lowest calculations; never 0
   * - Filename: YYYY-MM-DD-HotelName.xlsx
   */
  static exportOutputWorkbook(
    hotelName: string,
    arrivalDate: string,
    departureDate: string,
    priceReport: PriceReportRow[],
    updatedRooms: CompetitorRoomMapping[],
    autoDownload: boolean = false
  ): { filename: string; blob: Blob } {
    const wb = XLSX.utils.book_new();

    // 1. competitor_room (Updated with latest gross_amount)
    const roomRows = updatedRooms.map(r => ({
      competitor_hotel_id: r.competitor_hotel_id,
      competitor_hotel_name: r.competitor_hotel_name,
      competitor_room_id: r.competitor_room_id,
      competitor_room_name: r.competitor_room_name,
      gross_amount: r.gross_amount ?? 'N/A',
      our_room_type: r.our_room_type
    }));
    const wsRoom = XLSX.utils.json_to_sheet(roomRows);
    XLSX.utils.book_append_sheet(wb, wsRoom, 'competitor_room');

    // 2. competitor_price (With calculated lowest, average, and comparison)
    const priceRows = priceReport.map(p => {
      const breakdownText = (p.competitor_breakdown || []).map(b => 
        `${b.hotel_name} [${b.room_name}]: ${typeof b.price === 'number' ? `RM ${b.price.toFixed(2)}` : 'N/A'}`
      ).join('; ');

      return {
        our_room_type: p.our_room_type,
        our_min_rate: p.our_min_rate,
        our_max_rate: p.our_max_rate,
        lowest_competitor_price: p.lowest_competitor_price,
        average_competitor_price: p.average_competitor_price,
        valid_competitor_quotes: p.valid_quotes,
        matching_competitor_prices: breakdownText || 'No quotes',
        market_status: p.status.toUpperCase(),
        recommendation: p.recommendation
      };
    });
    const wsPrice = XLSX.utils.json_to_sheet(priceRows);
    XLSX.utils.book_append_sheet(wb, wsPrice, 'competitor_price');

    // Generate dated filename
    const datePrefix = new Date().toISOString().slice(0, 10);
    const filename = `${datePrefix}-${hotelName}.xlsx`;

    // Trigger download in browser ONLY if explicitly requested via download button
    if (autoDownload) {
      XLSX.writeFile(wb, filename);
    }

    // Return buffer / blob for Telegram dispatch without downloading to PC
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    return { filename, blob };
  }

  /**
   * Imports an existing Excel workbook (.xlsx) and parses its sheets
   */
  static async importInputWorkbook(file: File): Promise<{
    hotelName: string;
    hotelRooms: HotelRoomType[];
    competitorHotels: CompetitorHotel[];
    mappedRooms: CompetitorRoomMapping[];
  }> {
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    let hotelName = file.name.replace(/\.xlsx$/i, '');
    let hotelRooms: HotelRoomType[] = [];
    let competitorHotels: CompetitorHotel[] = [];
    let mappedRooms: CompetitorRoomMapping[] = [];

    // Parse hotel_data
    if (wb.SheetNames.includes('hotel_data')) {
      const data = XLSX.utils.sheet_to_json<any>(wb.Sheets['hotel_data']);
      if (data.length > 0 && data[0].hotel_name) {
        hotelName = String(data[0].hotel_name);
      }
      hotelRooms = data.map(d => ({
        room_type: String(d.room_type || ''),
        room_name: String(d.room_name || d.room_type || ''),
        min_rate: Number(d.min_rate) || 0,
        max_rate: Number(d.max_rate) || 0
      }));
    }

    // Parse competitor_hotel
    if (wb.SheetNames.includes('competitor_hotel')) {
      const data = XLSX.utils.sheet_to_json<any>(wb.Sheets['competitor_hotel']);
      competitorHotels = data.map(d => ({
        competitor_hotel_id: String(d.competitor_hotel_id || ''),
        competitor_hotel_name: String(d.competitor_hotel_name || ''),
        address: d.address ? String(d.address) : undefined,
        city: d.city ? String(d.city) : undefined,
        review_score: d.review_score ?? undefined,
        url: d.url ? String(d.url) : undefined
      }));
    }

    // Parse competitor_room
    if (wb.SheetNames.includes('competitor_room')) {
      const data = XLSX.utils.sheet_to_json<any>(wb.Sheets['competitor_room']);
      mappedRooms = data.map(d => ({
        competitor_hotel_id: String(d.competitor_hotel_id || ''),
        competitor_hotel_name: String(d.competitor_hotel_name || ''),
        competitor_room_id: String(d.competitor_room_id || ''),
        competitor_room_name: String(d.competitor_room_name || ''),
        gross_amount: d.gross_amount !== undefined && d.gross_amount !== '' && d.gross_amount !== 'N/A'
          ? Number(d.gross_amount)
          : null,
        our_room_type: String(d.our_room_type || 'UNMAPPED')
      }));
    }

    return {
      hotelName,
      hotelRooms,
      competitorHotels,
      mappedRooms
    };
  }

  /**
   * Parses an input workbook directly from a Buffer or Uint8Array (for Node/Daemon)
   */
  static parseWorkbookFromBuffer(buffer: Buffer | Uint8Array): {
    hotelName: string;
    hotelRooms: HotelRoomType[];
    competitorHotels: CompetitorHotel[];
    mappedRooms: CompetitorRoomMapping[];
  } {
    const wb = XLSX.read(buffer, { type: 'buffer' });

    let hotelName = 'Hotel';
    let hotelRooms: HotelRoomType[] = [];
    let competitorHotels: CompetitorHotel[] = [];
    let mappedRooms: CompetitorRoomMapping[] = [];

    if (wb.SheetNames.includes('hotel_data')) {
      const data = XLSX.utils.sheet_to_json<any>(wb.Sheets['hotel_data']);
      if (data.length > 0 && data[0].hotel_name) {
        hotelName = String(data[0].hotel_name);
      }
      hotelRooms = data.map(d => ({
        room_type: String(d.room_type || ''),
        room_name: String(d.room_name || d.room_type || ''),
        min_rate: Number(d.min_rate) || 0,
        max_rate: Number(d.max_rate) || 0
      }));
    }

    if (wb.SheetNames.includes('competitor_hotel')) {
      const data = XLSX.utils.sheet_to_json<any>(wb.Sheets['competitor_hotel']);
      competitorHotels = data.map(d => ({
        competitor_hotel_id: String(d.competitor_hotel_id || ''),
        competitor_hotel_name: String(d.competitor_hotel_name || ''),
        address: d.address ? String(d.address) : undefined,
        city: d.city ? String(d.city) : undefined,
        review_score: d.review_score ?? undefined,
        url: d.url ? String(d.url) : undefined
      }));
    }

    if (wb.SheetNames.includes('competitor_room')) {
      const data = XLSX.utils.sheet_to_json<any>(wb.Sheets['competitor_room']);
      mappedRooms = data.map(d => ({
        competitor_hotel_id: String(d.competitor_hotel_id || ''),
        competitor_hotel_name: String(d.competitor_hotel_name || ''),
        competitor_room_id: String(d.competitor_room_id || ''),
        competitor_room_name: String(d.competitor_room_name || ''),
        gross_amount: d.gross_amount !== undefined && d.gross_amount !== '' && d.gross_amount !== 'N/A'
          ? Number(d.gross_amount)
          : null,
        our_room_type: String(d.our_room_type || 'UNMAPPED')
      }));
    }

    return {
      hotelName,
      hotelRooms,
      competitorHotels,
      mappedRooms
    };
  }

  /**
   * Generates dated output workbook returning Buffer (for Node/Daemon)
   */
  static generateOutputWorkbookBuffer(
    hotelName: string,
    priceReport: PriceReportRow[],
    updatedRooms: CompetitorRoomMapping[]
  ): Buffer {
    const wb = XLSX.utils.book_new();

    const roomRows = updatedRooms.map(r => ({
      competitor_hotel_id: r.competitor_hotel_id,
      competitor_hotel_name: r.competitor_hotel_name,
      competitor_room_id: r.competitor_room_id,
      competitor_room_name: r.competitor_room_name,
      gross_amount: r.gross_amount ?? 'N/A',
      our_room_type: r.our_room_type
    }));
    const wsRoom = XLSX.utils.json_to_sheet(roomRows);
    XLSX.utils.book_append_sheet(wb, wsRoom, 'competitor_room');

    const priceRows = priceReport.map(p => {
      const breakdownText = (p.competitor_breakdown || []).map(b => 
        `${b.hotel_name} [${b.room_name}]: ${typeof b.price === 'number' ? `RM ${b.price.toFixed(2)}` : 'N/A'}`
      ).join('; ');

      return {
        our_room_type: p.our_room_type,
        our_min_rate: p.our_min_rate,
        our_max_rate: p.our_max_rate,
        lowest_competitor_price: p.lowest_competitor_price,
        average_competitor_price: p.average_competitor_price,
        valid_competitor_quotes: p.valid_quotes,
        matching_competitor_prices: breakdownText || 'No quotes',
        market_status: p.status.toUpperCase(),
        recommendation: p.recommendation
      };
    });
    const wsPrice = XLSX.utils.json_to_sheet(priceRows);
    XLSX.utils.book_append_sheet(wb, wsPrice, 'competitor_price');

    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  }
}
