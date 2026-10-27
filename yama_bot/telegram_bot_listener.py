"""
YAMA Bot - Interactive Telegram Bot Listener
Enables automated workflow:
1. User uploads a Flow 1 mapping workbook (.xlsx) directly to Telegram.
2. Bot downloads the workbook.
3. Bot automatically executes Flow 2 price extraction via Booking.com RapidAPI.
4. Bot calculates lowest & average rates per room type.
5. Bot replies with the generated dated output workbook (.xlsx) and executive summary.

Usage:
    python -m yama_bot.telegram_bot_listener
    or
    python yama_bot/telegram_bot_listener.py
"""

import os
import sys
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta
import requests

from .config import (
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    RAPIDAPI_KEY,
    RAPIDAPI_HOST,
    INPUT_DIR,
    OUTPUT_DIR
)
from .flow2_extract import run_flow2_extraction

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("yamabot.listener")

# In-memory session store for custom target dates per chat_id
chat_dates = {}

def get_telegram_updates(offset=None, timeout=25):
    """Long-polling for new incoming messages from Telegram."""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates"
    params = {"timeout": timeout}
    if offset:
        params["offset"] = offset
    try:
        res = requests.get(url, params=params, timeout=timeout + 10)
        if res.status_code == 200:
            return res.json().get("result", [])
    except requests.exceptions.RequestException as e:
        logger.warning(f"Connection error checking Telegram updates: {e}")
    return []

def send_telegram_message(chat_id, text, reply_to_message_id=None):
    """Sends a text message with Markdown formatting to a Telegram chat."""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    if reply_to_message_id:
        payload["reply_to_message_id"] = reply_to_message_id
    try:
        requests.post(url, json=payload, timeout=15)
    except Exception as e:
        logger.error(f"Failed to send message: {e}")

def send_telegram_document(chat_id, file_path: Path, caption=""):
    """Sends an Excel document to a Telegram chat."""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendDocument"
    try:
        with open(file_path, "rb") as f:
            files = {
                "document": (
                    file_path.name,
                    f,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
            }
            data = {
                "chat_id": chat_id,
                "caption": caption,
                "parse_mode": "Markdown"
            }
            requests.post(url, data=data, files=files, timeout=60)
    except Exception as e:
        logger.error(f"Failed to send document: {e}")

def download_telegram_file(file_id: str, dest_path: Path) -> bool:
    """Downloads a file uploaded by a user on Telegram."""
    get_file_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getFile?file_id={file_id}"
    try:
        res = requests.get(get_file_url, timeout=20)
        data = res.json()
        if not data.get("ok"):
            logger.error(f"Telegram getFile error: {data}")
            return False
        
        file_path = data["result"]["file_path"]
        download_url = f"https://api.telegram.org/file/bot{TELEGRAM_BOT_TOKEN}/{file_path}"
        
        file_res = requests.get(download_url, stream=True, timeout=60)
        file_res.raise_for_status()
        
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            for chunk in file_res.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        logger.error(f"Failed to download file from Telegram: {e}")
        return False

def handle_document_upload(chat_id: int, message: dict):
    """Handles an uploaded .xlsx or .xls file and runs Flow 2 automatically."""
    doc = message.get("document", {})
    file_name = doc.get("file_name", "uploaded_hotel_workbook.xlsx")
    file_id = doc.get("file_id")

    if not (file_name.lower().endswith(".xlsx") or file_name.lower().endswith(".xls")):
        send_telegram_message(
            chat_id,
            "⚠️ Sila muat naik fail Excel (`.xlsx` atau `.xls`) yang dijana dari YAMA Bot Flow 1.",
            reply_to_message_id=message.get("message_id")
        )
        return

    # Check arrival and departure dates
    custom_dates = chat_dates.get(chat_id)
    if custom_dates:
        arrival_date = custom_dates["arrival"]
        departure_date = custom_dates["departure"]
    else:
        # Defaults to tomorrow + 1 day
        tomorrow = datetime.now() + timedelta(days=1)
        day_after = tomorrow + timedelta(days=1)
        arrival_date = tomorrow.strftime("%Y-%m-%d")
        departure_date = day_after.strftime("%Y-%m-%d")

    # Acknowledge receipt
    send_telegram_message(
        chat_id,
        f"📥 *Workbook Diterima:*\n`{file_name}`\n\n"
        f"📅 *Tarikh Pemeriksaan:* `{arrival_date}` → `{departure_date}`\n"
        f"⏳ *Memulakan ekstraksi harga YAMA Bot...*\n"
        f"Sila tunggu sebentar sementara bot menghubungi Booking.com API...",
        reply_to_message_id=message.get("message_id")
    )

    # Save to input folder
    saved_input_path = INPUT_DIR / file_name
    success = download_telegram_file(file_id, saved_input_path)
    if not success:
        send_telegram_message(
            chat_id,
            "❌ Gagal memuat turun fail dari Telegram. Sila cuba hantar semula fail anda.",
            reply_to_message_id=message.get("message_id")
        )
        return

    # Run Flow 2 extraction
    try:
        output_file = run_flow2_extraction(
            input_workbook_path=saved_input_path,
            arrival_date=arrival_date,
            departure_date=departure_date,
            output_dir=OUTPUT_DIR,
            send_telegram=False # We handle direct reply to this specific chat_id
        )

        # Extract summary from generated output workbook
        import openpyxl
        summary_lines = []
        wb = openpyxl.load_workbook(output_file, data_only=True)
        if "competitor_price" in wb.sheetnames:
            ws = wb["competitor_price"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if row and row[0]:
                    rtype = row[0]
                    lowest = row[3]
                    avg = row[4]
                    quotes = row[5] if len(row) > 5 else 0
                    lowest_str = f"RM {lowest:.2f}" if isinstance(lowest, (int, float)) else "N/A"
                    avg_str = f"RM {avg:.2f}" if isinstance(avg, (int, float)) else "N/A"
                    summary_lines.append(f"• *{rtype}*: Terendah {lowest_str} | Purata {avg_str} ({quotes} sebut harga)")

        report_caption = (
            f"✅ *Laporan Selesai Diekstrak!*\n\n"
            f"📅 *Tarikh:* {arrival_date} → {departure_date}\n\n"
            f"📊 *Ringkasan Pasaran:*\n" +
            ("\n".join(summary_lines) if summary_lines else "• Tiada data harga kompetitor ditemui.") +
            f"\n\n📁 Fail Excel disertakan di atas."
        )

        # Send the generated workbook directly to the user
        send_telegram_document(chat_id, output_file, caption=report_caption)

    except Exception as e:
        logger.error(f"Error during automated extraction: {e}", exc_info=True)
        send_telegram_message(
            chat_id,
            f"❌ *Ralat semasa ekstraksi:*\n`{str(e)}`\n\n"
            f"Pastikan fail Excel mengandungi sheet `hotel_data`, `competitor_hotel`, dan `competitor_room` yang sah.",
            reply_to_message_id=message.get("message_id")
        )

def main():
    print("=" * 65)
    print("🤖 YAMA Bot - Interactive Telegram Auto-Runner Daemon")
    print("=" * 65)

    if not TELEGRAM_BOT_TOKEN:
        print("❌ TELEGRAM_BOT_TOKEN is not set in environment or .env!")
        print("   Set TELEGRAM_BOT_TOKEN=your_bot_token in .env before running.")
        sys.exit(1)

    # Verify bot identity
    try:
        me_res = requests.get(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getMe", timeout=15).json()
        if not me_res.get("ok"):
            print(f"❌ Invalid Telegram Bot Token: {me_res.get('description')}")
            sys.exit(1)
        bot_user = me_res["result"]
        print(f"✅ Connected to Telegram as @{bot_user.get('username')} ({bot_user.get('first_name')})")
    except Exception as e:
        print(f"❌ Failed to reach Telegram API: {e}")
        sys.exit(1)

    print("\n👂 Waiting for user uploads in Telegram chat...")
    print("   Tip: Drag and drop your .xlsx workbook directly into your Telegram chat with the bot!")
    print("   Press Ctrl+C to stop.\n")

    last_update_id = None

    while True:
        try:
            updates = get_telegram_updates(offset=last_update_id, timeout=20)
            for update in updates:
                last_update_id = update["update_id"] + 1
                msg = update.get("message")
                if not msg:
                    continue

                chat_id = msg.get("chat", {}).get("id")
                text = msg.get("text", "").strip()

                # Handle commands
                if text.startswith("/start") or text.startswith("/help"):
                    welcome = (
                        f"👋 *Selamat datang ke YAMA Bot!*\n"
                        f"Sistem Pemantauan Harga & Pemadanan Bilik Hotel Pesaing.\n\n"
                        f"🚀 *Cara Penggunaan Automatik:*\n"
                        f"1. *Hantar terus fail Excel* (`.xlsx`) anda ke dalam chat ini.\n"
                        f"2. YAMA Bot akan memuat turun fail, membaca mapping bilik, dan memanggil API Booking.com secara automatik.\n"
                        f"3. Laporan harga pasaran terkini serta fail Excel (`YYYY-MM-DD-Hotel.xlsx`) akan dihantar semula ke sini!\n\n"
                        f"🛠 *Perintah Tambahan:*\n"
                        f"• `/dates YYYY-MM-DD YYYY-MM-DD` - Tukar tarikh check-in & check-out (contoh: `/dates 2026-11-10 2026-11-11`)\n"
                        f"• `/status` - Semak status sambungan & API key\n"
                    )
                    send_telegram_message(chat_id, welcome, reply_to_message_id=msg.get("message_id"))

                elif text.startswith("/dates"):
                    parts = text.split()
                    if len(parts) >= 3:
                        arr, dep = parts[1], parts[2]
                        chat_dates[chat_id] = {"arrival": arr, "departure": dep}
                        send_telegram_message(
                            chat_id,
                            f"✅ *Tarikh ditetapkan!*\nTarikh Masuk: `{arr}`\nTarikh Keluar: `{dep}`\n\nSila muat naik fail `.xlsx` anda sekarang.",
                            reply_to_message_id=msg.get("message_id")
                        )
                    else:
                        send_telegram_message(
                            chat_id,
                            "Format tarikh: `/dates YYYY-MM-DD YYYY-MM-DD`\nContoh: `/dates 2026-11-15 2026-11-16`",
                            reply_to_message_id=msg.get("message_id")
                        )

                elif text.startswith("/status"):
                    has_rapidapi = bool(RAPIDAPI_KEY)
                    stat_msg = (
                        f"⚙️ *Status YAMA Bot:*\n"
                        f"• Telegram Bot: *Online* (@{bot_user.get('username')})\n"
                        f"• RapidAPI Key: {'*Dikonfigurasi*' if has_rapidapi else '*Mod Simulasi Pasaran*'}\n"
                        f"• RapidAPI Host: `{RAPIDAPI_HOST}`\n"
                    )
                    send_telegram_message(chat_id, stat_msg, reply_to_message_id=msg.get("message_id"))

                # Handle document upload (.xlsx)
                elif "document" in msg:
                    handle_document_upload(chat_id, msg)

        except KeyboardInterrupt:
            print("\n🛑 Stopping Telegram listener...")
            break
        except Exception as e:
            logger.error(f"Unexpected error in polling loop: {e}", exc_info=True)
            time.sleep(3)

if __name__ == "__main__":
    main()
