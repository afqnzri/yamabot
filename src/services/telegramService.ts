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
      if (!data.ok) return { ok: false, error: data.description || 'Gagal memanggil getUpdates' };
      const updates = data.result || [];
      if (updates.length === 0) {
        return { 
          ok: false, 
          error: 'Tiada mesej ditemui lagi. Sila buka t.me/YamaHotelBot di Telegram dan tekan butang START / hantar sebarang mesej dahulu, kemudian klik butang ini semula.' 
        };
      }
      const lastMsg = updates[updates.length - 1]?.message || updates[updates.length - 1]?.channel_post;
      if (!lastMsg || !lastMsg.chat) {
        return { ok: false, error: 'Mesej ditemui tetapi tiada info chat.' };
      }
      const chatId = String(lastMsg.chat.id);
      const senderName = lastMsg.from?.first_name || lastMsg.chat.title || 'User';
      return { ok: true, chatId, senderName };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Ralat rangkaian menghubungi Telegram API' };
    }
  }
}
