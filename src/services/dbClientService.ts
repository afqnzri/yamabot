import type { HotelRoomType, CompetitorHotel, CompetitorRoomMapping, ExtractionResult, PriceReportRow } from '../types/yama';

export interface DatabaseStats {
  databaseType: string;
  hotelCount: number;
  roomTypesCount: number;
  competitorHotelsCount: number;
  mappedRoomsCount: number;
  extractionRunsCount: number;
  schedulerLogsCount: number;
  activeHotel: string | null;
}

export interface ExtractionRunRecord {
  id: string;
  hotel_id: string;
  hotel_name: string;
  run_date: string;
  arrival_date: string;
  departure_date: string;
  output_filename: string;
  total_quotes: number;
  competitive_count: number;
  underpriced_count: number;
  premium_count: number;
  created_at: string;
}

export class DbClientService {
  public static async getStats(): Promise<DatabaseStats> {
    try {
      const res = await fetch('/api/db/stats');
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // ignore
    }
    return {
      databaseType: 'Cloudflare D1 / SQLite Engine',
      hotelCount: 0,
      roomTypesCount: 0,
      competitorHotelsCount: 0,
      mappedRoomsCount: 0,
      extractionRunsCount: 0,
      schedulerLogsCount: 0,
      activeHotel: null
    };
  }

  public static async getSavedSetup(): Promise<{
    hotelId: string;
    hotelName: string;
    hotelRooms: HotelRoomType[];
    competitorHotels: CompetitorHotel[];
    mappedRooms: CompetitorRoomMapping[];
  } | null> {
    try {
      const res = await fetch('/api/db/setup');
      if (res.ok) {
        const data = await res.json();
        return data.setup || null;
      }
    } catch (err) {
      console.error('Failed to load setup from database:', err);
    }
    return null;
  }

  public static async saveSetup(payload: {
    hotelName: string;
    hotelRooms: HotelRoomType[];
    competitorHotels: CompetitorHotel[];
    mappedRooms: CompetitorRoomMapping[];
  }): Promise<{ success: boolean; hotelId?: string; message?: string }> {
    try {
      const res = await fetch('/api/db/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err: any) {
      return { success: false, message: err.message };
    }
    return { success: false, message: 'Server returned error' };
  }

  public static async clearSetup(): Promise<boolean> {
    try {
      const res = await fetch('/api/db/setup', { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  public static async getExtractionRuns(): Promise<ExtractionRunRecord[]> {
    try {
      const res = await fetch('/api/db/runs');
      if (res.ok) {
        const data = await res.json();
        return data.runs || [];
      }
    } catch (err) {
      console.error('Failed to load runs from database:', err);
    }
    return [];
  }

  public static async getRunDetails(runId: string): Promise<{ run: ExtractionRunRecord; reports: PriceReportRow[] } | null> {
    try {
      const res = await fetch(`/api/db/runs/${runId}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error('Failed to load run details:', err);
    }
    return null;
  }

  public static async recordRun(result: ExtractionResult): Promise<{ success: boolean; runId?: string }> {
    try {
      const res = await fetch('/api/db/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error('Failed to record extraction run to DB:', err);
    }
    return { success: false };
  }

  public static async exportSqlDump(): Promise<string> {
    try {
      const res = await fetch('/api/db/export');
      if (res.ok) {
        return await res.text();
      }
    } catch (err) {
      console.error('Failed to export SQL dump:', err);
    }
    return '-- Failed to fetch SQL dump';
  }
}
