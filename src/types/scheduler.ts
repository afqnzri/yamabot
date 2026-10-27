export interface SchedulerConfig {
  enabled: boolean;
  time: string; // e.g. "07:00" (24h format)
  frequency: 'daily' | 'twice_daily' | 'every_6h';
  targetDaysAhead: number; // e.g. 1 for tomorrow, 7 for next week
  targetStayNights: number; // default 1
  telegramChatId: string;
  hasMasterWorkbook: boolean;
  masterHotelName: string;
  masterMappedRoomsCount: number;
  lastRunTime: string | null;
  lastRunStatus: 'success' | 'failed' | 'running' | null;
  nextRunTime: string | null;
}

export interface SchedulerLogEntry {
  id: string;
  timestamp: string;
  status: 'success' | 'failed' | 'running';
  hotelName: string;
  arrivalDate: string;
  departureDate: string;
  roomsQueried: number;
  message: string;
  outputFileName?: string;
}
