import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { HotelRoomType, CompetitorHotel, CompetitorRoomMapping, PriceReportRow, ExtractionResult } from '../types/yama';
import type { SchedulerConfig, SchedulerLogEntry } from '../types/scheduler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path in root directory
const DB_PATH = path.resolve(__dirname, '..', '..', 'yama.db');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

class DatabaseService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema() {
    try {
      if (fs.existsSync(SCHEMA_PATH)) {
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
        this.db.exec(schema);
      }
    } catch (err) {
      console.error('[DB] Error initializing schema:', err);
    }
  }

  // ==========================================
  // Flow 1: Hotel, Rooms & Competitor Mappings
  // ==========================================

  public getHotelSetup(hotelId?: string): {
    hotelId: string;
    hotelName: string;
    hotelRooms: HotelRoomType[];
    competitorHotels: CompetitorHotel[];
    mappedRooms: CompetitorRoomMapping[];
  } | null {
    try {
      let hotelRow: any;
      if (hotelId) {
        hotelRow = this.db.prepare('SELECT * FROM hotels WHERE id = ?').get(hotelId);
      } else {
        hotelRow = this.db.prepare('SELECT * FROM hotels ORDER BY updated_at DESC LIMIT 1').get();
      }

      if (!hotelRow) {
        return null;
      }

      const activeHotelId = hotelRow.id;
      const hotelRooms = this.db.prepare('SELECT room_type, room_name, min_rate, max_rate FROM hotel_rooms WHERE hotel_id = ?').all(activeHotelId) as HotelRoomType[];
      const competitorHotels = this.db.prepare('SELECT competitor_hotel_search, competitor_hotel_id, competitor_hotel_name, address, city, review_score, url FROM competitor_hotels WHERE hotel_id = ?').all(activeHotelId) as CompetitorHotel[];
      const mappedRooms = this.db.prepare('SELECT competitor_hotel_id, competitor_hotel_name, competitor_room_id, competitor_room_name, gross_amount, our_room_type FROM competitor_room_mappings WHERE hotel_id = ?').all(activeHotelId) as CompetitorRoomMapping[];

      return {
        hotelId: activeHotelId,
        hotelName: hotelRow.name,
        hotelRooms,
        competitorHotels,
        mappedRooms
      };
    } catch (err) {
      console.error('[DB] getHotelSetup error:', err);
      return null;
    }
  }

  public saveHotelSetup(data: {
    hotelName: string;
    hotelRooms: HotelRoomType[];
    competitorHotels: CompetitorHotel[];
    mappedRooms: CompetitorRoomMapping[];
    hotelId?: string;
  }): { success: boolean; hotelId: string } {
    const hotelId = data.hotelId || 'hotel_' + Date.now();
    const hotelName = data.hotelName || 'My Hotel';

    const saveTransaction = this.db.transaction(() => {
      // 1. Insert or replace hotel
      this.db.prepare(`
        INSERT INTO hotels (id, name, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP
      `).run(hotelId, hotelName);

      // 2. Clear old children for this hotel
      this.db.prepare('DELETE FROM hotel_rooms WHERE hotel_id = ?').run(hotelId);
      this.db.prepare('DELETE FROM competitor_hotels WHERE hotel_id = ?').run(hotelId);
      this.db.prepare('DELETE FROM competitor_room_mappings WHERE hotel_id = ?').run(hotelId);

      // 3. Insert hotel rooms
      const insertRoom = this.db.prepare(`
        INSERT INTO hotel_rooms (id, hotel_id, room_type, room_name, min_rate, max_rate)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const r of data.hotelRooms) {
        insertRoom.run('hr_' + Math.random().toString(36).slice(2, 9), hotelId, r.room_type, r.room_name, r.min_rate, r.max_rate);
      }

      // 4. Insert competitor hotels
      const insertComp = this.db.prepare(`
        INSERT INTO competitor_hotels (id, hotel_id, competitor_hotel_search, competitor_hotel_id, competitor_hotel_name, address, city, review_score, url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of data.competitorHotels) {
        insertComp.run(
          'comp_' + Math.random().toString(36).slice(2, 9),
          hotelId,
          c.competitor_hotel_search || '',
          c.competitor_hotel_id,
          c.competitor_hotel_name,
          c.address || '',
          c.city || '',
          String(c.review_score || ''),
          c.url || ''
        );
      }

      // 5. Insert mapped rooms
      const insertMapping = this.db.prepare(`
        INSERT INTO competitor_room_mappings (id, hotel_id, competitor_hotel_id, competitor_hotel_name, competitor_room_id, competitor_room_name, gross_amount, our_room_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of data.mappedRooms) {
        const grossNum = typeof m.gross_amount === 'number' ? m.gross_amount : parseFloat(String(m.gross_amount || 0)) || null;
        insertMapping.run(
          'crm_' + Math.random().toString(36).slice(2, 9),
          hotelId,
          m.competitor_hotel_id,
          m.competitor_hotel_name,
          m.competitor_room_id,
          m.competitor_room_name,
          grossNum,
          m.our_room_type || 'UNMAPPED'
        );
      }
    });

    try {
      saveTransaction();
      return { success: true, hotelId };
    } catch (err) {
      console.error('[DB] saveHotelSetup error:', err);
      return { success: false, hotelId };
    }
  }

  public clearAllData(): boolean {
    try {
      this.db.transaction(() => {
        this.db.prepare('DELETE FROM price_reports').run();
        this.db.prepare('DELETE FROM extraction_runs').run();
        this.db.prepare('DELETE FROM competitor_room_mappings').run();
        this.db.prepare('DELETE FROM competitor_hotels').run();
        this.db.prepare('DELETE FROM hotel_rooms').run();
        this.db.prepare('DELETE FROM hotels').run();
      })();
      return true;
    } catch (err) {
      console.error('[DB] clearAllData error:', err);
      return false;
    }
  }

  // ==========================================
  // Flow 2: Extraction Runs & Price Reports
  // ==========================================

  public saveExtractionRun(data: ExtractionResult, hotelId?: string): { success: boolean; runId: string } {
    const runId = 'run_' + Date.now();
    const effectiveHotelId = hotelId || 'hotel_default';

    const saveRunTransaction = this.db.transaction(() => {
      // Ensure hotel row exists
      this.db.prepare(`
        INSERT INTO hotels (id, name) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name
      `).run(effectiveHotelId, data.hotelName || 'My Hotel');

      // Count statuses
      const totalQuotes = data.priceReport.reduce((acc, row) => acc + (row.valid_quotes || 0), 0);
      const competitiveCount = data.priceReport.filter(r => r.status === 'competitive').length;
      const underpricedCount = data.priceReport.filter(r => r.status === 'underpriced').length;
      const premiumCount = data.priceReport.filter(r => r.status === 'premium').length;

      // Insert run
      this.db.prepare(`
        INSERT INTO extraction_runs (
          id, hotel_id, hotel_name, run_date, arrival_date, departure_date, output_filename,
          total_quotes, competitive_count, underpriced_count, premium_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        runId,
        effectiveHotelId,
        data.hotelName,
        data.runDate,
        data.arrivalDate,
        data.departureDate,
        data.outputWorkbookName,
        totalQuotes,
        competitiveCount,
        underpricedCount,
        premiumCount
      );

      // Insert report rows
      const insertReport = this.db.prepare(`
        INSERT INTO price_reports (
          id, run_id, our_room_type, our_min_rate, our_max_rate,
          lowest_competitor_price, average_competitor_price, valid_quotes,
          status, recommendation, competitor_breakdown_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of data.priceReport) {
        insertReport.run(
          'pr_' + Math.random().toString(36).slice(2, 9),
          runId,
          row.our_room_type,
          row.our_min_rate,
          row.our_max_rate,
          row.lowest_competitor_price === 'N/A' ? null : row.lowest_competitor_price,
          row.average_competitor_price === 'N/A' ? null : row.average_competitor_price,
          row.valid_quotes,
          row.status,
          row.recommendation,
          JSON.stringify(row.competitor_breakdown || [])
        );
      }
    });

    try {
      saveRunTransaction();
      return { success: true, runId };
    } catch (err) {
      console.error('[DB] saveExtractionRun error:', err);
      return { success: false, runId };
    }
  }

  public getExtractionRuns(limit = 30): any[] {
    try {
      return this.db.prepare(`
        SELECT * FROM extraction_runs 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(limit);
    } catch (err) {
      console.error('[DB] getExtractionRuns error:', err);
      return [];
    }
  }

  public getExtractionRunDetails(runId: string): { run: any; reports: PriceReportRow[] } | null {
    try {
      const run = this.db.prepare('SELECT * FROM extraction_runs WHERE id = ?').get(runId);
      if (!run) return null;

      const rawReports = this.db.prepare('SELECT * FROM price_reports WHERE run_id = ?').all(runId) as any[];
      const reports: PriceReportRow[] = rawReports.map(r => ({
        our_room_type: r.our_room_type,
        our_min_rate: r.our_min_rate,
        our_max_rate: r.our_max_rate,
        lowest_competitor_price: r.lowest_competitor_price !== null ? r.lowest_competitor_price : 'N/A',
        average_competitor_price: r.average_competitor_price !== null ? r.average_competitor_price : 'N/A',
        valid_quotes: r.valid_quotes,
        status: r.status as any,
        recommendation: r.recommendation,
        competitor_breakdown: r.competitor_breakdown_json ? JSON.parse(r.competitor_breakdown_json) : []
      }));

      return { run, reports };
    } catch (err) {
      console.error('[DB] getExtractionRunDetails error:', err);
      return null;
    }
  }

  // ==========================================
  // Task Scheduler DB persistence
  // ==========================================

  public getSchedulerConfig(): SchedulerConfig | null {
    try {
      const row = this.db.prepare('SELECT * FROM scheduler_config WHERE id = ?').get('default') as any;
      if (!row) return null;
      return {
        enabled: Boolean(row.enabled),
        time: row.run_time,
        frequency: row.frequency as any,
        targetDaysAhead: row.target_days_ahead,
        targetStayNights: row.target_stay_nights,
        telegramChatId: row.telegram_chat_id || '',
        hasMasterWorkbook: false,
        masterHotelName: '',
        masterMappedRoomsCount: 0,
        lastRunTime: null,
        lastRunStatus: null,
        nextRunTime: null
      };
    } catch (err) {
      console.error('[DB] getSchedulerConfig error:', err);
      return null;
    }
  }

  public saveSchedulerConfig(config: SchedulerConfig): boolean {
    try {
      this.db.prepare(`
        INSERT INTO scheduler_config (id, enabled, run_time, frequency, target_days_ahead, target_stay_nights, telegram_chat_id, updated_at)
        VALUES ('default', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          enabled = excluded.enabled,
          run_time = excluded.run_time,
          frequency = excluded.frequency,
          target_days_ahead = excluded.target_days_ahead,
          target_stay_nights = excluded.target_stay_nights,
          telegram_chat_id = excluded.telegram_chat_id,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        config.enabled ? 1 : 0,
        config.time,
        config.frequency,
        config.targetDaysAhead,
        config.targetStayNights,
        config.telegramChatId
      );
      return true;
    } catch (err) {
      console.error('[DB] saveSchedulerConfig error:', err);
      return false;
    }
  }

  public addSchedulerLog(entry: Omit<SchedulerLogEntry, 'id'>): void {
    try {
      this.db.prepare(`
        INSERT INTO scheduler_logs (id, timestamp, status, hotel_name, message, filename, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'log_' + Date.now(),
        entry.timestamp,
        entry.status,
        entry.hotelName,
        entry.message,
        entry.outputFileName || null,
        entry.durationMs || 0
      );
    } catch (err) {
      console.error('[DB] addSchedulerLog error:', err);
    }
  }

  public getSchedulerLogs(limit = 50): SchedulerLogEntry[] {
    try {
      const rows = this.db.prepare('SELECT * FROM scheduler_logs ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
      return rows.map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        status: r.status as any,
        hotelName: r.hotel_name,
        message: r.message,
        outputFileName: r.filename,
        durationMs: r.duration_ms
      }));
    } catch (err) {
      console.error('[DB] getSchedulerLogs error:', err);
      return [];
    }
  }

  // ==========================================
  // Database Stats & Backup Export
  // ==========================================

  public getDatabaseStats(): {
    databaseType: string;
    hotelCount: number;
    roomTypesCount: number;
    competitorHotelsCount: number;
    mappedRoomsCount: number;
    extractionRunsCount: number;
    schedulerLogsCount: number;
    activeHotel: string | null;
  } {
    try {
      const hotelCount = (this.db.prepare('SELECT count(*) as c FROM hotels').get() as any).c;
      const roomTypesCount = (this.db.prepare('SELECT count(*) as c FROM hotel_rooms').get() as any).c;
      const competitorHotelsCount = (this.db.prepare('SELECT count(*) as c FROM competitor_hotels').get() as any).c;
      const mappedRoomsCount = (this.db.prepare('SELECT count(*) as c FROM competitor_room_mappings').get() as any).c;
      const extractionRunsCount = (this.db.prepare('SELECT count(*) as c FROM extraction_runs').get() as any).c;
      const schedulerLogsCount = (this.db.prepare('SELECT count(*) as c FROM scheduler_logs').get() as any).c;

      const activeHotelRow = this.db.prepare('SELECT name FROM hotels ORDER BY updated_at DESC LIMIT 1').get() as any;

      return {
        databaseType: 'Cloudflare D1 / SQLite Engine',
        hotelCount,
        roomTypesCount,
        competitorHotelsCount,
        mappedRoomsCount,
        extractionRunsCount,
        schedulerLogsCount,
        activeHotel: activeHotelRow ? activeHotelRow.name : null
      };
    } catch (err) {
      console.error('[DB] getDatabaseStats error:', err);
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
  }

  public exportSQLDump(): string {
    const lines: string[] = [
      '-- ============================================================',
      '-- YAMA Bot Cloudflare D1 SQL Data Export',
      `-- Exported at: ${new Date().toISOString()}`,
      '-- ============================================================',
      ''
    ];

    const tables = ['hotels', 'hotel_rooms', 'competitor_hotels', 'competitor_room_mappings', 'extraction_runs', 'price_reports', 'scheduler_config', 'scheduler_logs'];
    
    for (const table of tables) {
      lines.push(`-- Table: ${table}`);
      const rows = this.db.prepare(`SELECT * FROM ${table}`).all() as any[];
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map(c => {
          const v = row[c];
          if (v === null || v === undefined) return 'NULL';
          if (typeof v === 'number') return v;
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        lines.push(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

export const dbService = new DatabaseService();
