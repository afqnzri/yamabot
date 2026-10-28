import { CompetitorHotel, CompetitorRoomMapping, PriceReportRow, HotelRoomType } from '../types/yama';

export class RapidApiService {
  /**
   * Search competitor hotels by name
   */
  static async searchHotels(
    query: string,
    apiKey?: string,
    apiHost: string = 'booking-com15.p.rapidapi.com'
  ): Promise<CompetitorHotel[]> {
    if (!apiKey) {
      // Return realistic simulation results based on Malaysian hospitality market
      await new Promise(r => setTimeout(r, 400)); // natural simulation delay
      const mockHotels: CompetitorHotel[] = [
        {
          competitor_hotel_id: "104258",
          competitor_hotel_name: "Premiere Hotel Klang",
          address: "Bandar Bukit Tinggi 1/KS6, Jalan Langat",
          city: "Klang, Selangor",
          review_score: 8.2,
          url: "https://www.booking.com/hotel/my/premiere.html"
        },
        {
          competitor_hotel_id: "219803",
          competitor_hotel_name: "Crystal Crown Hotel Harbour View",
          address: "217 Persiaran Raja Muda Musa",
          city: "Port Klang, Selangor",
          review_score: 7.6,
          url: "https://www.booking.com/hotel/my/crystal-crown.html"
        },
        {
          competitor_hotel_id: "418290",
          competitor_hotel_name: "Merrida Hotel Klang",
          address: "18R Lebuh Enggang, Off Jalan Meru",
          city: "Klang, Selangor",
          review_score: 7.9,
          url: "https://www.booking.com/hotel/my/merrida.html"
        },
        {
          competitor_hotel_id: "591024",
          competitor_hotel_name: "Wyndham Acmar Klang",
          address: "1 Persiaran Bukit Raja 1/KU1",
          city: "Klang, Selangor",
          review_score: 8.7,
          url: "https://www.booking.com/hotel/my/wyndham-acmar.html"
        },
        {
          competitor_hotel_id: "254821",
          competitor_hotel_name: "Klang Histana Hotel",
          address: "Jalan Batu Tiga Lama",
          city: "Klang, Selangor",
          review_score: 7.4,
          url: "https://www.booking.com/hotel/my/klang-histana.html"
        },
        {
          competitor_hotel_id: "329402",
          competitor_hotel_name: "GM City Hotel Klang",
          address: "Jalan Kasuarina 1, Bandar Botanic",
          city: "Klang, Selangor",
          review_score: 7.8,
          url: "https://www.booking.com/hotel/my/gm-city.html"
        }
      ];

      if (query.trim()) {
        const q = query.toLowerCase().trim();
        const matched = mockHotels.filter(h => 
          h.competitor_hotel_name.toLowerCase().includes(q) || 
          h.competitor_hotel_id.includes(q) || 
          h.city?.toLowerCase().includes(q)
        );
        return matched.length > 0 ? matched : [
          {
            competitor_hotel_id: String(Math.floor(Math.random() * 800000) + 100000),
            competitor_hotel_name: `${query} (Booking.com Competitor)`,
            address: "Klang / Shah Alam",
            city: "Selangor, Malaysia",
            review_score: 8.0,
            url: `https://www.booking.com/hotel/my/competitor.html`
          }
        ];
      }
      return mockHotels;
    }

    try {
      const url = `https://${apiHost}/api/v1/hotels/searchDestination?query=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': apiHost
        }
      });
      if (!res.ok) throw new Error(`RapidAPI Search error: ${res.statusText}`);
      const data = await res.json();
      const items = data.data || data || [];
      return items.map((item: any) => ({
        competitor_hotel_id: String(item.dest_id || item.id || item.hotel_id),
        competitor_hotel_name: item.name || item.label || 'Unknown Hotel',
        address: item.address || item.label || '',
        city: item.city_name || item.city || '',
        review_score: item.review_score || 8.0,
        url: item.url || ''
      }));
    } catch (e) {
      console.error('RapidAPI error, falling back to local simulation:', e);
      throw e;
    }
  }

  /**
   * Endpoint: GET Get Hotel Details
   * URL: https://booking-com15.p.rapidapi.com/api/v1/hotels/getHotelDetails
   * Parameters: hotel_id, arrival_date, departure_date
   */
  static async getHotelDetails(
    hotelId: string,
    arrivalDate: string,
    departureDate: string,
    apiKey?: string,
    apiHost: string = 'booking-com15.p.rapidapi.com'
  ): Promise<CompetitorHotel> {
    if (!apiKey) {
      await new Promise(r => setTimeout(r, 200));
      const knownHotels: Record<string, Partial<CompetitorHotel>> = {
        "104258": { competitor_hotel_name: "Premiere Hotel Klang", address: "Bandar Bukit Tinggi 1/KS6", city: "Klang, Selangor", review_score: 8.2 },
        "219803": { competitor_hotel_name: "Crystal Crown Hotel Harbour View", address: "217 Persiaran Raja Muda Musa", city: "Port Klang, Selangor", review_score: 7.6 },
        "418290": { competitor_hotel_name: "Merrida Hotel Klang", address: "18R Lebuh Enggang, Off Jalan Meru", city: "Klang, Selangor", review_score: 7.9 },
        "591024": { competitor_hotel_name: "Wyndham Acmar Klang", address: "1 Persiaran Bukit Raja 1/KU1", city: "Klang, Selangor", review_score: 8.7 },
        "254821": { competitor_hotel_name: "Klang Histana Hotel", address: "Jalan Batu Tiga Lama", city: "Klang, Selangor", review_score: 7.4 },
        "329402": { competitor_hotel_name: "GM City Hotel Klang", address: "Jalan Kasuarina 1, Bandar Botanic", city: "Klang, Selangor", review_score: 7.8 }
      };

      const matched = knownHotels[hotelId] || {};
      return {
        competitor_hotel_id: hotelId,
        competitor_hotel_name: matched.competitor_hotel_name || `Competitor Hotel ${hotelId}`,
        address: matched.address || 'Klang / Shah Alam, Selangor',
        city: matched.city || 'Klang, Selangor',
        review_score: matched.review_score || 8.0,
        url: `https://www.booking.com/hotel/my/${hotelId}.html`
      };
    }

    const url = `https://${apiHost}/api/v1/hotels/getHotelDetails?hotel_id=${hotelId}&arrival_date=${arrivalDate}&departure_date=${departureDate}&currency=MYR`;
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': apiHost
      }
    });
    if (!res.ok) throw new Error(`RapidAPI getHotelDetails error: ${res.statusText}`);
    const data = await res.json();
    const h = data.data || data || {};
    return {
      competitor_hotel_id: String(hotelId),
      competitor_hotel_name: h.hotel_name || h.name || h.title || h.property?.name || `Hotel ${hotelId}`,
      address: h.address || h.hotel_address || h.location?.address || '',
      city: h.city || h.city_name || h.city_trans || h.district || '',
      review_score: h.review_score || h.score || h.average_score || 8.0,
      url: h.url || h.booking_url || `https://www.booking.com/hotel/my/${hotelId}.html`
    };
  }

  /**
   * Fetch rooms for a given competitor hotel
   */
  static async getRoomList(
    hotelId: string,
    arrivalDate: string,
    departureDate: string,
    apiKey?: string,
    apiHost: string = 'booking-com15.p.rapidapi.com'
  ): Promise<Array<{ competitor_room_id: string; room_name: string; gross_amount: number | null }>> {
    if (!apiKey) {
      await new Promise(r => setTimeout(r, 400));
      // Generate realistic price fluctuation based on dates and hotelId
      const seed = (parseInt(hotelId.slice(-3)) || 100) + arrivalDate.charCodeAt(arrivalDate.length - 1);
      const isWeekend = new Date(arrivalDate).getDay() === 5 || new Date(arrivalDate).getDay() === 6;
      const surge = isWeekend ? 1.18 : 1.0;

      return [
        {
          competitor_room_id: `${hotelId}01`,
          room_name: "Deluxe Queen Room (No Window)",
          gross_amount: Math.round(((seed % 40) + 90) * surge)
        },
        {
          competitor_room_id: `${hotelId}02`,
          room_name: "Superior Twin Beds Room",
          gross_amount: Math.round(((seed % 50) + 110) * surge)
        },
        {
          competitor_room_id: `${hotelId}03`,
          room_name: "Executive King Room (City View)",
          gross_amount: Math.round(((seed % 60) + 145) * surge)
        },
        {
          competitor_room_id: `${hotelId}04`,
          room_name: "Premier Family Suite (2 Queen Beds)",
          gross_amount: Math.round(((seed % 80) + 210) * surge)
        }
      ];
    }

    const url = `https://${apiHost}/api/v1/hotels/getRoomList?hotel_id=${hotelId}&arrival_date=${arrivalDate}&departure_date=${departureDate}&currency=MYR`;
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': apiHost
      }
    });
    if (!res.ok) throw new Error(`RapidAPI getRoomList error: ${res.statusText}`);
    const data = await res.json();
    const payload = data.data || data || {};
    
    // booking-com15 returns array under payload.block or payload.rooms
    let rawList: any[] = [];
    if (Array.isArray(payload.block)) {
      rawList = payload.block;
    } else if (Array.isArray(payload.rooms)) {
      rawList = payload.rooms;
    } else if (Array.isArray(payload)) {
      rawList = payload;
    } else if (payload.rooms && typeof payload.rooms === 'object') {
      rawList = Object.entries(payload.rooms).map(([id, info]: [string, any]) => ({
        room_id: id,
        ...info
      }));
    }

    return rawList.map((room: any) => {
      let gross: number | null = null;
      const price = room.product_price_breakdown?.all_inclusive_amount?.value 
                 ?? room.product_price_breakdown?.gross_amount?.value
                 ?? room.gross_amount 
                 ?? room.price 
                 ?? room.composite_price_breakdown?.gross_amount?.value;
      if (typeof price === 'number') gross = Math.round(price * 100) / 100;
      else if (typeof price === 'string') gross = Math.round(parseFloat(price) * 100) / 100 || null;

      return {
        competitor_room_id: String(room.room_id || room.block_id || room.id),
        room_name: room.name_without_policy || room.name || room.room_name || 'Standard Room',
        gross_amount: gross
      };
    });
  }

  /**
   * Flow 2 Execution Core:
   * Query all competitor hotels represented in active mappings,
   * match strictly by competitor_hotel_id AND competitor_room_id,
   * calculate lowest and average rates per room_type (ignoring N/A).
   */
  static async runPriceExtraction(
    hotelRooms: HotelRoomType[],
    mappedRooms: CompetitorRoomMapping[],
    arrivalDate: string,
    departureDate: string,
    apiKey?: string,
    apiHost?: string,
    onProgress?: (progress: number, statusText: string) => void
  ): Promise<{
    priceReport: PriceReportRow[];
    updatedRooms: CompetitorRoomMapping[];
  }> {
    // 1. Filter to only rooms that are actively mapped
    const activeMappings = mappedRooms.filter(
      r => r.our_room_type && !['UNMAPPED', 'IGNORE', 'NONE', ''].includes(r.our_room_type.toUpperCase())
    );

    const uniqueHotelIds = Array.from(new Set(activeMappings.map(r => r.competitor_hotel_id)));
    onProgress?.(10, `Found ${uniqueHotelIds.length} competitor hotels to query for ${arrivalDate}...`);

    // 2. Fetch room rates for each competitor hotel
    const apiRecords: Array<{ competitor_hotel_id: string; competitor_room_id: string; gross_amount: number | null }> = [];
    
    for (let i = 0; i < uniqueHotelIds.length; i++) {
      const hotelId = uniqueHotelIds[i];
      const hotelName = activeMappings.find(m => m.competitor_hotel_id === hotelId)?.competitor_hotel_name || `Hotel ${hotelId}`;
      onProgress?.(20 + Math.round((i / uniqueHotelIds.length) * 50), `Querying prices for ${hotelName}...`);
      
      try {
        const rooms = await this.getRoomList(hotelId, arrivalDate, departureDate, apiKey, apiHost);
        rooms.forEach(r => {
          apiRecords.push({
            competitor_hotel_id: hotelId,
            competitor_room_id: r.competitor_room_id,
            gross_amount: r.gross_amount
          });
        });
      } catch (err) {
        console.warn(`Failed to fetch rooms for competitor ${hotelId}:`, err);
      }
    }

    onProgress?.(75, 'Matching competitor records by Hotel ID and Room ID...');

    // 3. Match records strictly using (competitor_hotel_id, competitor_room_id)
    const lookup = new Map<string, number | null>();
    apiRecords.forEach(rec => {
      lookup.set(`${rec.competitor_hotel_id}_${rec.competitor_room_id}`, rec.gross_amount);
    });

    const updatedRooms: CompetitorRoomMapping[] = activeMappings.map(mr => {
      const key = `${mr.competitor_hotel_id}_${mr.competitor_room_id}`;
      const newGross = lookup.get(key);
      const isAvailable = typeof newGross === 'number' && newGross > 0;
      return {
        ...mr,
        gross_amount: isAvailable ? Number(newGross) : 'N/A'
      };
    });

    onProgress?.(90, 'Computing lowest and average competitor rates per room type...');

    // 4. Calculate stats for each of our room types
    const priceReport: PriceReportRow[] = hotelRooms.map(ourRoom => {
      const matchingRooms = updatedRooms.filter(r => r.our_room_type === ourRoom.room_type);
      
      const validPrices: number[] = [];
      const competitorBreakdown: Array<{ hotel_name: string; room_name: string; price: number | 'N/A' }> = matchingRooms.map(m => {
        const p: number | 'N/A' = typeof m.gross_amount === 'number' ? m.gross_amount : 'N/A';
        if (typeof p === 'number') validPrices.push(p);
        return {
          hotel_name: m.competitor_hotel_name,
          room_name: m.competitor_room_name,
          price: p
        };
      });

      let lowest: number | 'N/A' = 'N/A';
      let average: number | 'N/A' = 'N/A';
      let status: PriceReportRow['status'] = 'no_quotes';
      let recommendation = 'No competitor data available for this room type.';

      if (validPrices.length > 0) {
        lowest = Math.round(Math.min(...validPrices) * 100) / 100;
        const sum = validPrices.reduce((a, b) => a + b, 0);
        average = Math.round((sum / validPrices.length) * 100) / 100;

        if (average < ourRoom.min_rate) {
          status = 'underpriced';
          recommendation = `Market avg (RM ${average}) is below your min rate (RM ${ourRoom.min_rate}). Consider keeping rate at floor.`;
        } else if (average > ourRoom.max_rate) {
          status = 'premium';
          recommendation = `High market demand! Competitors avg RM ${average}. You can price near your ceiling (RM ${ourRoom.max_rate}).`;
        } else {
          status = 'competitive';
          recommendation = `Optimal range: Match competitor avg RM ${average} (Your window: RM ${ourRoom.min_rate} - ${ourRoom.max_rate}).`;
        }
      }

      return {
        our_room_type: ourRoom.room_type,
        our_min_rate: ourRoom.min_rate,
        our_max_rate: ourRoom.max_rate,
        lowest_competitor_price: lowest,
        average_competitor_price: average,
        valid_quotes: validPrices.length,
        status,
        recommendation,
        competitor_breakdown: competitorBreakdown
      };
    });

    onProgress?.(100, 'Extraction complete!');
    return { priceReport, updatedRooms };
  }

  /**
   * Auto-resolves competitor hotels from competitor_hotel_search (or existing IDs),
   * queries getHotelDetails (Step 3), queries getRoomList (Step 4),
   * and auto-maps them to our hotel room types to populate competitor_room.
   */
  static async resolveCompetitorsAndRooms(
    competitorHotels: CompetitorHotel[],
    hotelRooms: HotelRoomType[],
    arrivalDate: string,
    departureDate: string,
    apiKey?: string,
    apiHost?: string,
    onProgress?: (current: number, total: number, hotelName: string) => void
  ): Promise<{
    updatedHotels: CompetitorHotel[];
    generatedRooms: CompetitorRoomMapping[];
  }> {
    const updatedHotels: CompetitorHotel[] = [];
    const generatedRooms: CompetitorRoomMapping[] = [];

    for (let i = 0; i < competitorHotels.length; i++) {
      const h = competitorHotels[i];
      const searchQuery = (h.competitor_hotel_search || h.competitor_hotel_name || '').trim();
      let hotelId = (h.competitor_hotel_id || '').trim();
      let hotelName = (h.competitor_hotel_name || searchQuery || `Competitor ${i + 1}`).trim();

      onProgress?.(i + 1, competitorHotels.length, searchQuery || hotelName);

      // Step 2: If hotel_id is missing, search via searchDestination
      if (!hotelId && searchQuery) {
        try {
          if (/^\d+$/.test(searchQuery)) {
            hotelId = searchQuery;
          } else {
            const searchResults = await this.searchHotels(searchQuery, apiKey, apiHost);
            if (searchResults.length > 0) {
              hotelId = searchResults[0].competitor_hotel_id;
              hotelName = searchResults[0].competitor_hotel_name || hotelName;
            }
          }
        } catch (e) {
          console.warn(`Search failed for ${searchQuery}:`, e);
        }
      }

      if (!hotelId) {
        hotelId = `comp_${i + 1}`;
      }

      // Step 3: GET Get Hotel Details
      let details: CompetitorHotel;
      try {
        details = await this.getHotelDetails(hotelId, arrivalDate, departureDate, apiKey, apiHost);
      } catch {
        details = {
          competitor_hotel_id: hotelId,
          competitor_hotel_name: hotelName,
          address: h.address || 'Klang, Selangor',
          city: h.city || 'Selangor',
          review_score: h.review_score || 8.0,
          url: h.url
        };
      }

      const mergedHotel: CompetitorHotel = {
        competitor_hotel_search: searchQuery || details.competitor_hotel_name || hotelName,
        competitor_hotel_id: hotelId,
        competitor_hotel_name: details.competitor_hotel_name || hotelName,
        address: details.address || h.address,
        city: details.city || h.city,
        review_score: details.review_score ?? h.review_score,
        url: details.url || h.url
      };
      updatedHotels.push(mergedHotel);

      // Step 4: GET Get Room List
      try {
        const rooms = await this.getRoomList(hotelId, arrivalDate, departureDate, apiKey, apiHost);
        rooms.forEach(r => {
          // Auto-match room type against hotelRooms
          const rName = r.room_name.toLowerCase();
          let matchedType = 'UNMAPPED';
          for (const hr of hotelRooms) {
            const tokens = hr.room_type.toLowerCase().split(/\s+/).filter(t => t.length > 2);
            for (const t of tokens) {
              if (rName.includes(t)) {
                matchedType = hr.room_type;
                break;
              }
            }
            if (matchedType !== 'UNMAPPED') break;
          }

          generatedRooms.push({
            competitor_hotel_id: hotelId,
            competitor_hotel_name: mergedHotel.competitor_hotel_name,
            competitor_room_id: r.competitor_room_id,
            competitor_room_name: r.room_name,
            gross_amount: r.gross_amount,
            our_room_type: matchedType
          });
        });
      } catch (e) {
        console.warn(`Failed to fetch rooms for ${hotelId}:`, e);
      }
    }

    return { updatedHotels, generatedRooms };
  }
}
