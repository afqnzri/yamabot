export class TelegramService {
  /**
   * Test Telegram Bot token validity
   */
  static async testBotToken(token: string): Promise<{ ok: boolean; botName?: string; error?: string }> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await res.json();
      if (data.ok) {
        return { ok: true, botName: data.result.first_name || data.result.username };
      }
      return { ok: false, error: data.description || 'Invalid Bot Token' };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Network error contacting Telegram API' };
    }
  }

  /**
   * Send text message with Markdown formatting
   */
  static async sendMessage(token: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });
      const data = await res.json();
      if (data.ok) return { ok: true };
      return { ok: false, error: data.description };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Send document (.xlsx file) directly to Telegram
   */
  static async sendDocument(
    token: string,
    chatId: string,
    fileBlob: Blob,
    filename: string,
    caption: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('document', fileBlob, filename);
      formData.append('caption', caption);
      formData.append('parse_mode', 'Markdown');

      const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok) return { ok: true };
      return { ok: false, error: data.description };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Auto-fetch latest Chat ID from recent bot interactions (/getUpdates)
   */
  static async getLatestChatId(token: string): Promise<{ ok: boolean; chatId?: string; senderName?: string; error?: string }> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
      const data = await res.json();
      if (!data.ok) return { ok: false, error: data.description || 'Failed to call getUpdates' };
      const updates = data.result || [];
      if (updates.length === 0) {
        return { 
          ok: false, 
          error: 'No messages found yet. Please open t.me/YamaHotelBot on Telegram and press START or send any message first, then click this button again.' 
        };
      }
      const lastMsg = updates[updates.length - 1]?.message || updates[updates.length - 1]?.channel_post;
      if (!lastMsg || !lastMsg.chat) {
        return { ok: false, error: 'Message found but missing chat info.' };
      }
      const chatId = String(lastMsg.chat.id);
      const senderName = lastMsg.from?.first_name || lastMsg.chat.title || 'User';
      return { ok: true, chatId, senderName };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Network error contacting Telegram API' };
    }
  }

  /**
   * Fetch recent activity log from bot updates
   */
  static async getRecentActivity(token: string): Promise<{
    ok: boolean;
    botInfo?: { name: string; username: string };
    recentUpdates?: Array<{
      updateId: number;
      sender: string;
      chatId: string;
      text?: string;
      documentName?: string;
      date: string;
    }>;
    error?: string;
  }> {
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const meData = await meRes.json();
      if (!meData.ok) {
        return { ok: false, error: meData.description || 'Invalid Bot Token' };
      }
      const botInfo = {
        name: meData.result.first_name || 'Bot',
        username: meData.result.username || 'yamabot'
      };

      const updRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
      const updData = await updRes.json();
      const rawUpdates = updData.result || [];

      const recentUpdates = rawUpdates.slice(-5).reverse().map((u: any) => {
        const msg = u.message || u.channel_post || {};
        return {
          updateId: u.update_id,
          sender: msg.from?.first_name || msg.chat?.title || 'User',
          chatId: String(msg.chat?.id || ''),
          text: msg.text,
          documentName: msg.document?.file_name,
          date: msg.date ? new Date(msg.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
        };
      });

      return {
        ok: true,
        botInfo,
        recentUpdates
      };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
