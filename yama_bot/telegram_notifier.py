"""
Telegram Notifier for YAMA Bot
Dispatches price extraction summaries and sends the generated .xlsx workbook.
"""

import logging
import requests
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class TelegramNotifier:
    def __init__(self, bot_token: Optional[str] = None, chat_id: Optional[str] = None):
        self.bot_token = bot_token
        self.chat_id = chat_id

    @property
    def is_configured(self) -> bool:
        return bool(self.bot_token and self.chat_id)

    def send_message(self, text: str) -> bool:
        if not self.is_configured:
            logger.warning("Telegram not configured. Skipping message dispatch.")
            return False

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "Markdown"
        }
        try:
            res = requests.post(url, json=payload, timeout=15)
            res.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {e}")
            return False

    def send_workbook(self, file_path: Path, caption: str = "") -> bool:
        if not self.is_configured:
            logger.warning("Telegram not configured. Skipping workbook upload.")
            return False

        if not file_path.exists():
            logger.error(f"File not found: {file_path}")
            return False

        url = f"https://api.telegram.org/bot{self.bot_token}/sendDocument"
        try:
            with open(file_path, "rb") as f:
                files = {"document": (file_path.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
                data = {
                    "chat_id": self.chat_id,
                    "caption": caption or f"📊 YAMA Bot Competitor Price Report: {file_path.name}",
                    "parse_mode": "Markdown"
                }
                res = requests.post(url, data=data, files=files, timeout=30)
                res.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Failed to send Telegram document: {e}")
            return False

    def send_report_summary(
        self,
        hotel_name: str,
        arrival_date: str,
        departure_date: str,
        room_summaries: list,
        file_path: Optional[Path] = None
    ) -> bool:
        lines = [
            f"🏨 *YAMA Bot - Competitor Price Alert*",
            f"📍 *Hotel:* {hotel_name}",
            f"📅 *Dates:* {arrival_date} → {departure_date}",
            "",
            "📊 *Room Rate Summary:*",
        ]
        
        for s in room_summaries:
            rtype = s.get("room_type", "Room")
            lowest = s.get("lowest_price", "N/A")
            avg = s.get("avg_price", "N/A")
            quotes = s.get("quotes", 0)
            
            lowest_str = f"RM {lowest:.2f}" if isinstance(lowest, (int, float)) else "N/A"
            avg_str = f"RM {avg:.2f}" if isinstance(avg, (int, float)) else "N/A"
            
            lines.append(f"• *{rtype}*: Lowest {lowest_str} | Avg {avg_str} ({quotes} quotes)")

        lines.append("")
        lines.append("📁 _Generated output workbook attached below._")
        
        msg_text = "\n".join(lines)
        
        if file_path and file_path.exists():
            return self.send_workbook(file_path, caption=msg_text)
        else:
            return self.send_message(msg_text)
