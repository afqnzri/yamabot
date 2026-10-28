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
      competitor_hotel_search: h.competitor_hotel_search || h.competitor_hotel_name,
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
  /**
   * Helper to find a worksheet case-insensitively and ignoring whitespace/special characters
   */
  private static findSheet(wb: XLSX.WorkBook, ...candidatePatterns: string[]): { name: string; sheet: XLSX.WorkSheet } | null {
    const normalize = (s: string) => String(s || '').toLowerCase().replace(/[\s_\-\.]/g, '');
    for (const pat of candidatePatterns) {
      const normPat = normalize(pat);
      for (const name of wb.SheetNames) {
        const normName = normalize(name);
        if (normName === normPat || normName.includes(normPat)) {
          return { name, sheet: wb.Sheets[name] };
        }
      }
    }
    return null;
  }

  /**
   * Helper to retrieve a field value from an Excel row object case-insensitively and ignoring spaces
   */
  private static getField(row: any, ...candidates: string[]): any {
    if (!row || typeof row !== 'object') return undefined;
    for (const c of candidates) {
      if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
        return row[c];
      }
    }
    const normalize = (s: string) => String(s || '').toLowerCase().replace(/[\s_\-\.]/g, '');
    const normCandidates = candidates.map(normalize);
    for (const [k, v] of Object.entries(row)) {
      if (v === undefined || v === null || String(v).trim() === '') continue;
      if (normCandidates.includes(normalize(k))) {
        return v;
      }
    }
    return undefined;
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
    return this.parseWorkbookCore(wb, file.name.replace(/\.xlsx$/i, ''));
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
    return this.parseWorkbookCore(wb, 'Hotel');
  }

  /**
   * Unified, highly resilient workbook parser that handles all casing variations,
   * flexible column headers, and auto-detects competitor_hotel_search
   */
  private static parseWorkbookCore(wb: XLSX.WorkBook, fallbackHotelName: string): {
    hotelName: string;
    hotelRooms: HotelRoomType[];
    competitorHotels: CompetitorHotel[];
    mappedRooms: CompetitorRoomMapping[];
  } {
    let hotelName = fallbackHotelName;
    let hotelRooms: HotelRoomType[] = [];
    let competitorHotels: CompetitorHotel[] = [];
    let mappedRooms: CompetitorRoomMapping[] = [];

    // 1. Parse hotel_data
    const hotelDataSheetInfo = this.findSheet(wb, 'hotel_data', 'hoteldata', 'hotel');
    if (hotelDataSheetInfo) {
      const data = XLSX.utils.sheet_to_json<any>(hotelDataSheetInfo.sheet);
      if (data.length > 0) {
        const foundName = this.getField(data[0], 'hotel_name', 'hotel', 'name');
        if (foundName) hotelName = String(foundName).trim();
      }
      hotelRooms = data.map(d => ({
        room_type: String(this.getField(d, 'room_type', 'roomtype', 'type') || '').trim(),
        room_name: String(this.getField(d, 'room_name', 'roomname', 'room_type', 'name') || '').trim(),
        min_rate: Number(this.getField(d, 'min_rate', 'minrate', 'min_price', 'minimum')) || 0,
        max_rate: Number(this.getField(d, 'max_rate', 'maxrate', 'max_price', 'maximum')) || 0
      })).filter(r => r.room_type);
    }

    // 2. Parse competitor_hotel
    let competitorHotelSheetInfo = this.findSheet(
      wb,
      'competitor_hotel',
      'competitorhotel',
      'competitor_hotels',
      'competitor',
      'competitors'
    );

    // Fallback: If not found by name, scan all sheets for competitor_hotel_search column
    if (!competitorHotelSheetInfo) {
      for (const sheetName of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName]);
        if (rows.length > 0) {
          const hasSearchCol = rows.some(r => !!this.getField(r, 'competitor_hotel_search', 'competitor_hotel', 'hotel_search', 'search_query'));
          if (hasSearchCol) {
            competitorHotelSheetInfo = { name: sheetName, sheet: wb.Sheets[sheetName] };
            break;
          }
        }
      }
    }

    if (competitorHotelSheetInfo) {
      const data = XLSX.utils.sheet_to_json<any>(competitorHotelSheetInfo.sheet);
      competitorHotels = data.map(d => {
        const searchStr = String(
          this.getField(
            d,
            'competitor_hotel_search',
            'competitor_hotel',
            'competitor_hotel_name',
            'hotel_search',
            'search_query',
            'search_hotel',
            'hotel_name',
            'hotel',
            'query'
          ) || ''
        ).trim();

        const hotelId = String(
          this.getField(d, 'competitor_hotel_id', 'hotel_id', 'dest_id') ||
          (searchStr && /^\d+$/.test(searchStr) ? searchStr : '') ||
          ''
        ).trim();

        const hotelNameParsed = String(
          this.getField(d, 'competitor_hotel_name', 'hotel_name', 'name') ||
          (searchStr && !/^\d+$/.test(searchStr) ? searchStr : '') ||
          (hotelId ? `Hotel ${hotelId}` : '')
        ).trim();

        return {
          competitor_hotel_search: searchStr || hotelNameParsed,
          competitor_hotel_id: hotelId,
          competitor_hotel_name: hotelNameParsed || searchStr || (hotelId ? `Hotel ${hotelId}` : 'Unknown Hotel'),
          address: this.getField(d, 'address', 'hotel_address') ? String(this.getField(d, 'address', 'hotel_address')) : undefined,
          city: this.getField(d, 'city', 'location') ? String(this.getField(d, 'city', 'location')) : undefined,
          review_score: this.getField(d, 'review_score', 'rating', 'score') !== undefined 
            ? Number(this.getField(d, 'review_score', 'rating', 'score')) 
            : undefined,
          url: this.getField(d, 'url', 'link') ? String(this.getField(d, 'url', 'link')) : undefined
        };
      }).filter(h => h.competitor_hotel_search || h.competitor_hotel_id || h.competitor_hotel_name);
    }

    // 3. Parse competitor_room
    const competitorRoomSheetInfo = this.findSheet(
      wb,
      'competitor_room',
      'competitorroom',
      'competitor_rooms',
      'room_mapping',
      'rooms'
    );

    if (competitorRoomSheetInfo) {
      const data = XLSX.utils.sheet_to_json<any>(competitorRoomSheetInfo.sheet);
      mappedRooms = data.map(d => {
        const rawGross = this.getField(d, 'gross_amount', 'grossamount', 'price', 'rate');
        return {
          competitor_hotel_id: String(this.getField(d, 'competitor_hotel_id', 'hotel_id') || '').trim(),
          competitor_hotel_name: String(this.getField(d, 'competitor_hotel_name', 'hotel_name') || '').trim(),
          competitor_room_id: String(this.getField(d, 'competitor_room_id', 'room_id') || '').trim(),
          competitor_room_name: String(this.getField(d, 'competitor_room_name', 'room_name', 'room') || '').trim(),
          gross_amount: rawGross !== undefined && rawGross !== '' && rawGross !== 'N/A'
            ? Number(rawGross)
            : null,
          our_room_type: String(this.getField(d, 'our_room_type', 'ourroomtype', 'room_type') || 'UNMAPPED').trim()
        };
      }).filter(r => r.competitor_room_name || r.competitor_room_id);
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
