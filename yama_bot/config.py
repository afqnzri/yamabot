"""
Configuration settings for YAMA Bot
Supports environment variables or fallback values.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present
load_dotenv()

# RapidAPI Booking.com API settings
# Providers typically: 'booking-com15.p.rapidapi.com' or 'booking-com.p.rapidapi.com'
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "f659e796f5mshede0a10caa98d60p1f7437jsn2a0469f81edb")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "booking-com15.p.rapidapi.com")

# Telegram Bot settings
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8806821205:AAF6Z956tPfW2BsnMKzPkDmEzuAj1_5VYFM")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# File paths
BASE_DIR = Path(__file__).resolve().parent
INPUT_DIR = BASE_DIR / "workbooks" / "input"
OUTPUT_DIR = BASE_DIR / "workbooks" / "output"

INPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
