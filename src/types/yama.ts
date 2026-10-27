export interface HotelRoomType {
  room_type: string;
  room_name: string;
  min_rate: number;
  max_rate: number;
}

export interface CompetitorHotel {
  competitor_hotel_id: string;
  competitor_hotel_name: string;
  address?: string;
  city?: string;
  review_score?: string | number;
  url?: string;
}

export interface CompetitorRoomMapping {
  competitor_hotel_id: string;
  competitor_hotel_name: string;
  competitor_room_id: string;
  competitor_room_name: string;
  gross_amount?: number | string | null;
  our_room_type: string; // mapped room_type from hotel_data or 'UNMAPPED'
}

export interface PriceReportRow {
  our_room_type: string;
  our_min_rate: number;
  our_max_rate: number;
  lowest_competitor_price: number | 'N/A';
  average_competitor_price: number | 'N/A';
  valid_quotes: number;
  status: 'competitive' | 'underpriced' | 'premium' | 'no_quotes';
  recommendation: string;
  competitor_breakdown: Array<{
    hotel_name: string;
    room_name: string;
    price: number | 'N/A';
  }>;
}

export interface ExtractionResult {
  runDate: string;
  arrivalDate: string;
  departureDate: string;
  hotelName: string;
  outputWorkbookName: string;
  priceReport: PriceReportRow[];
  updatedRooms: CompetitorRoomMapping[];
}
