-- ============================================================
-- YAMA Bot - Database Schema
-- Compatible with Cloudflare D1 (Serverless SQLite) and better-sqlite3
-- ============================================================

-- 1. Hotels Table
CREATE TABLE IF NOT EXISTS hotels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MYR',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Our Hotel Rooms & Rate Limits (hotel_data)
CREATE TABLE IF NOT EXISTS hotel_rooms (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL,
  room_type TEXT NOT NULL,
  room_name TEXT NOT NULL,
  min_rate REAL NOT NULL,
  max_rate REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
);

-- 3. Competitor Hotels Monitored (competitor_hotel)
CREATE TABLE IF NOT EXISTS competitor_hotels (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL,
  competitor_hotel_search TEXT,
  competitor_hotel_id TEXT NOT NULL,
  competitor_hotel_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  review_score TEXT,
  url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
);

-- 4. Competitor Room Mappings (competitor_room)
CREATE TABLE IF NOT EXISTS competitor_room_mappings (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL,
  competitor_hotel_id TEXT NOT NULL,
  competitor_hotel_name TEXT NOT NULL,
  competitor_room_id TEXT NOT NULL,
  competitor_room_name TEXT NOT NULL,
  gross_amount REAL,
  our_room_type TEXT NOT NULL DEFAULT 'UNMAPPED',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
);

-- 5. Price Extraction Runs History (Flow 2 / Automated Cron)
CREATE TABLE IF NOT EXISTS extraction_runs (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL,
  hotel_name TEXT NOT NULL,
  run_date TEXT NOT NULL,
  arrival_date TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  output_filename TEXT NOT NULL,
  total_quotes INTEGER DEFAULT 0,
  competitive_count INTEGER DEFAULT 0,
  underpriced_count INTEGER DEFAULT 0,
  premium_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
);

-- 6. Price Report Rows per Run (Summary per room type)
CREATE TABLE IF NOT EXISTS price_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  our_room_type TEXT NOT NULL,
  our_min_rate REAL NOT NULL,
  our_max_rate REAL NOT NULL,
  lowest_competitor_price REAL,
  average_competitor_price REAL,
  valid_quotes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  recommendation TEXT,
  competitor_breakdown_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES extraction_runs (id) ON DELETE CASCADE
);

-- 7. Task Scheduler Configuration
CREATE TABLE IF NOT EXISTS scheduler_config (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  run_time TEXT NOT NULL DEFAULT '07:00',
  frequency TEXT NOT NULL DEFAULT 'daily',
  target_days_ahead INTEGER NOT NULL DEFAULT 1,
  target_stay_nights INTEGER NOT NULL DEFAULT 1,
  telegram_chat_id TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Task Scheduler Execution Logs
CREATE TABLE IF NOT EXISTS scheduler_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL,
  hotel_name TEXT NOT NULL,
  message TEXT NOT NULL,
  filename TEXT,
  duration_ms INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_hotel_id ON hotel_rooms(hotel_id);
CREATE INDEX IF NOT EXISTS idx_competitor_hotels_hotel_id ON competitor_hotels(hotel_id);
CREATE INDEX IF NOT EXISTS idx_competitor_room_mappings_hotel_id ON competitor_room_mappings(hotel_id);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_hotel_id ON extraction_runs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_price_reports_run_id ON price_reports(run_id);
