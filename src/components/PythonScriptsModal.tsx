import React, { useState } from 'react';
import { X, Code2, Copy, Check, Download, FileText, Terminal, Layers } from 'lucide-react';

interface PythonScriptsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PythonScriptsModal: React.FC<PythonScriptsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'flow2' | 'flow1' | 'excel' | 'api' | 'telegram' | 'cron'>('flow2');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const scripts = {
    flow2: {
      name: 'flow2_extract.py',
      description: 'Recurring price extraction script with ID matching, N/A filtering, and Telegram forwarder.',
      code: `"""
YAMA Bot: Flow 2 - Recurring Competitor Price Extraction
Run whenever updated competitor prices are required.
Uses existing mapping from Flow 1; does not repeat hotel discovery or change mappings.
"""

import sys
import argparse
from pathlib import Path
from datetime import datetime, timedelta

from .config import INPUT_DIR, OUTPUT_DIR, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
from .rapidapi_client import RapidApiBookingClient
from .excel_engine import ExcelEngine
from .telegram_notifier import TelegramNotifier

def run_flow2_extraction(
    input_workbook_path: Path,
    arrival_date: str,
    departure_date: str,
    output_dir: Path = None,
    send_telegram: bool = True
) -> Path:
    print("=" * 60)
    print("🚀 YAMA Bot: Flow 2 Recurring Price Extraction")
    print("=" * 60)

    # 1. Read input workbook
    wb_data = ExcelEngine.load_input_workbook(input_workbook_path)
    hotel_name = wb_data["hotel_name"]
    hotel_rooms = wb_data["hotel_data"]
    mapped_rooms = wb_data["competitor_room"]

    # Filter active mapped rooms
    active_mappings = [
        r for r in mapped_rooms 
        if r.get("our_room_type") and str(r.get("our_room_type")).strip().upper() not in ["UNMAPPED", "IGNORE", "NONE", ""]
    ]
    
    unique_hotel_ids = sorted(list(set(str(r["competitor_hotel_id"]).strip() for r in active_mappings)))

    # 2. Formulate dated output workbook
    date_prefix = datetime.now().strftime("%Y-%m-%d")
    output_filename = f"{date_prefix}-{hotel_name}.xlsx"
    output_path = (output_dir or OUTPUT_DIR) / output_filename

    # 3. Call RapidAPI GET Get Room List for each competitor hotel
    client = RapidApiBookingClient()
    api_room_records = []
    for h_id in unique_hotel_ids:
        rooms = client.get_room_list(hotel_id=h_id, arrival_date=arrival_date, departure_date=departure_date)
        api_room_records.extend(rooms)

    # 4, 5, 6: Match records, compute stats & generate output workbook
    output_file = ExcelEngine.generate_output_workbook(
        output_path=output_path,
        hotel_name=hotel_name,
        hotel_rooms=hotel_rooms,
        mapped_rooms=active_mappings,
        api_room_records=api_room_records,
        arrival_date=arrival_date,
        departure_date=departure_date
    )

    # Forward to Telegram if configured
    notifier = TelegramNotifier(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
    if send_telegram and notifier.is_configured:
        notifier.send_workbook(output_file, caption=f"📊 YAMA Bot Alert: {output_file.name}")

    return output_file`
    },
    flow1: {
      name: 'flow1_setup.py',
      description: 'Onboarding setup script for searching competitors, extracting room IDs, and creating 4-sheet input workbook.',
      code: `"""
YAMA Bot: Flow 1 - Initial Hotel and Room Mapping Setup
Run once for each hotel during onboarding.
"""

import argparse
from pathlib import Path
from datetime import datetime, timedelta

from .config import INPUT_DIR
from .rapidapi_client import RapidApiBookingClient
from .excel_engine import ExcelEngine

def run_flow1_setup(hotel_name: str, hotel_rooms: list, competitor_queries: list):
    client = RapidApiBookingClient()
    arrival = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
    departure = (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d")

    competitor_hotels = []
    discovered_rooms = []

    for query in competitor_queries:
        results = client.search_hotel_destination(query)
        if not results: continue
        top = results[0]
        h_id = top["dest_id"]
        details = client.get_hotel_details(h_id, arrival, departure)
        competitor_hotels.append({
            "competitor_hotel_id": h_id,
            "competitor_hotel_name": details.get("hotel_name") or top["name"],
            "address": details.get("address", ""),
            "city": details.get("city", top.get("city_name", "")),
            "review_score": details.get("review_score", "")
        })

        rooms = client.get_room_list(h_id, arrival, departure)
        for r in rooms:
            r["competitor_hotel_name"] = details.get("hotel_name") or top["name"]
            discovered_rooms.append(r)

    mapped_rooms = [
        {
            "competitor_hotel_id": r["competitor_hotel_id"],
            "competitor_hotel_name": r.get("competitor_hotel_name", ""),
            "competitor_room_id": r["competitor_room_id"],
            "competitor_room_name": r["room_name"],
            "gross_amount": r.get("gross_amount", ""),
            "our_room_type": "UNMAPPED"
        }
        for r in discovered_rooms
    ]

    target = INPUT_DIR / f"{hotel_name}.xlsx"
    ExcelEngine.create_input_workbook(target, hotel_name, hotel_rooms, competitor_hotels, mapped_rooms)
    print(f"✅ Input workbook created at: {target}")`
    },
    excel: {
      name: 'excel_engine.py',
      description: 'Strict openpyxl engine enforcing matching by ID, N/A price exclusions, and 2-sheet output.',
      code: `"""
Excel Engine for YAMA Bot (Requirements v3)
Enforces:
- Match by competitor_hotel_id and competitor_room_id strictly.
- Exclude missing/invalid/None prices from average/lowest; never treat as zero.
- Preserves original input workbook unchanged.
"""

import openpyxl
from pathlib import Path
from typing import Dict, Any, List

class ExcelEngine:
    @staticmethod
    def generate_output_workbook(output_path, hotel_name, hotel_rooms, mapped_rooms, api_room_records, arrival_date, departure_date):
        wb = openpyxl.Workbook()
        wb.remove(wb.active)

        # Lookup: (competitor_hotel_id, competitor_room_id) -> gross_amount
        api_lookup = {
            (str(r["competitor_hotel_id"]).strip(), str(r["competitor_room_id"]).strip()): r.get("gross_amount")
            for r in api_room_records
        }

        # 1. Output Sheet: competitor_room
        ws_room = wb.create_sheet(title="competitor_room")
        ws_room.append(["competitor_hotel_id", "competitor_hotel_name", "competitor_room_id", "competitor_room_name", "gross_amount", "our_room_type"])
        
        prices_by_type = {}
        for mr in mapped_rooms:
            h_id = str(mr["competitor_hotel_id"]).strip()
            r_id = str(mr["competitor_room_id"]).strip()
            price = api_lookup.get((h_id, r_id))
            
            is_valid = isinstance(price, (int, float)) and price > 0
            val_str = float(price) if is_valid else "N/A"
            ws_room.append([h_id, mr.get("competitor_hotel_name", ""), r_id, mr.get("competitor_room_name", ""), val_str, mr["our_room_type"]])
            
            if is_valid:
                prices_by_type.setdefault(mr["our_room_type"], []).append(float(price))

        # 2. Output Sheet: competitor_price
        ws_price = wb.create_sheet(title="competitor_price")
        ws_price.append(["our_room_type", "our_min_rate", "our_max_rate", "lowest_competitor_price", "average_competitor_price", "valid_quotes"])
        for hr in hotel_rooms:
            rtype = hr.get("room_type", "")
            quotes = prices_by_type.get(rtype, [])
            lowest = min(quotes) if quotes else "N/A"
            avg = round(sum(quotes)/len(quotes), 2) if quotes else "N/A"
            ws_price.append([rtype, hr.get("min_rate"), hr.get("max_rate"), lowest, avg, len(quotes)])

        wb.save(output_path)
        return output_path`
    },
    api: {
      name: 'rapidapi_client.py',
      description: 'RapidAPI Booking.com client for Destination Search, Hotel Details, and Room Lists.',
      code: `"""
RapidAPI Booking.com Client for YAMA Bot
"""

import requests

class RapidApiBookingClient:
    def __init__(self, api_key=None, api_host="booking-com15.p.rapidapi.com"):
        self.api_key = api_key
        self.api_host = api_host
        self.headers = {
            "x-rapidapi-key": self.api_key,
            "x-rapidapi-host": self.api_host
        }

    def search_hotel_destination(self, query):
        url = f"https://{self.api_host}/api/v1/hotels/searchDestination"
        res = requests.get(url, headers=self.headers, params={"query": query})
        return res.json().get("data", [])

    def get_room_list(self, hotel_id, arrival_date, departure_date):
        url = f"https://{self.api_host}/api/v1/hotels/getRoomList"
        res = requests.get(url, headers=self.headers, params={
            "hotel_id": str(hotel_id),
            "arrival_date": arrival_date,
            "departure_date": departure_date,
            "currency": "MYR"
        })
        return res.json().get("data", {}).get("rooms", [])`
    },
    telegram: {
      name: 'telegram_notifier.py',
      description: 'Dispatches pricing alerts and uploads generated .xlsx workbooks directly to Telegram.',
      code: `"""
Telegram Notifier for YAMA Bot
"""

import requests
from pathlib import Path

class TelegramNotifier:
    def __init__(self, bot_token, chat_id):
        self.bot_token = bot_token
        self.chat_id = chat_id

    def send_workbook(self, file_path: Path, caption=""):
        url = f"https://api.telegram.org/bot{self.bot_token}/sendDocument"
        with open(file_path, "rb") as f:
            files = {"document": (file_path.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            data = {"chat_id": self.chat_id, "caption": caption, "parse_mode": "Markdown"}
            return requests.post(url, data=data, files=files).json()`
    },
    cron: {
      name: 'daily_price_monitor.yml',
      description: 'GitHub Actions workflow for 100% free daily automated cron extraction and Telegram dispatch.',
      code: `name: YAMA Bot - Daily Competitor Price Extraction

on:
  schedule:
    # Runs daily at 07:00 UTC (15:00 Malaysia/Singapore time)
    - cron: '0 7 * * *'
  workflow_dispatch:

jobs:
  extract-and-alert:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'

      - name: Install dependencies
        run: pip install -r yama_bot/requirements.txt

      - name: Run Flow 2 Price Extraction
        env:
          RAPIDAPI_KEY: \${{ secrets.RAPIDAPI_KEY }}
          TELEGRAM_BOT_TOKEN: \${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: \${{ secrets.TELEGRAM_CHAT_ID }}
        run: python -m yama_bot.flow2_extract --input "MSP D'Spark Hotel Bayu.xlsx" --telegram`
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(scripts[activeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const script = scripts[activeTab];
    const blob = new Blob([script.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = script.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold">Standalone Python Suite (YAMA Bot)</h2>
              <p className="text-xs text-slate-400">Download and run headless or automate on schedule</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 shrink-0 overflow-x-auto">
          {[
            { id: 'flow2', label: 'flow2_extract.py' },
            { id: 'flow1', label: 'flow1_setup.py' },
            { id: 'excel', label: 'excel_engine.py' },
            { id: 'api', label: 'rapidapi_client.py' },
            { id: 'telegram', label: 'telegram_notifier.py' },
            { id: 'cron', label: 'daily_monitor.yml (Cron)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-blue-600 bg-white text-blue-700 shadow-sm'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Description & Action bar */}
        <div className="px-6 py-3 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-600 font-medium">
            {scripts[activeTab].description}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors shadow-xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Code'}
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Download File
            </button>
          </div>
        </div>

        {/* Code Viewer */}
        <div className="p-6 overflow-y-auto bg-slate-950 font-mono text-xs text-slate-200 flex-1 leading-relaxed">
          <pre>{scripts[activeTab].code}</pre>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-slate-600" />
            Runs on Python 3.10+ with <code>pip install openpyxl requests python-dotenv</code>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
