export interface BotDaemonStatus {
  status: 'online' | 'busy' | 'offline';
  botUsername: string;
  timestamp: number;
  isProcessing: boolean;
  currentTask: string | null;
  lastCompletedFile: string | null;
  lastCompletedAt: string | null;
  processedCount: number;
}

export class BotStatusService {
  static async checkStatus(): Promise<{
    isOnline: boolean;
    isBusy: boolean;
    currentTask: string | null;
    lastCompletedFile: string | null;
    lastCompletedAt: string | null;
    processedCount: number;
    botUsername: string;
  }> {
    try {
      const res = await fetch(`/bot_status.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Not reachable');
      const data: BotDaemonStatus = await res.json();
      
      const now = Date.now();
      const isAlive = (now - data.timestamp) < 15000 && data.timestamp > 0;

      return {
        isOnline: isAlive,
        isBusy: isAlive && data.isProcessing,
        currentTask: data.currentTask,
        lastCompletedFile: data.lastCompletedFile,
        lastCompletedAt: data.lastCompletedAt,
        processedCount: data.processedCount || 0,
        botUsername: data.botUsername || 'YamaHotelBot'
      };
    } catch {
      return {
        isOnline: false,
        isBusy: false,
        currentTask: null,
        lastCompletedFile: null,
        lastCompletedAt: null,
        processedCount: 0,
        botUsername: 'YamaHotelBot'
      };
    }
  }
}
