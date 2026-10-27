"""
YAMA Bot: Flow 2 - Recurring Competitor Price Extraction
Run whenever updated competitor prices are required.
Uses existing mapping from Flow 1; does not repeat hotel discovery or change mappings.

Step 1 – Open hotel input workbook and read saved competitor_hotel IDs and mapped competitor_room IDs / room_type values.
Step 2 – Create dated workbook in output folder (copied structure, keeping input unchanged).
Step 3 – Call RapidAPI GET Get Room List (hotel_id, arrival_date, departure_date) for each competitor hotel.
Step 4 – Use ONLY API records whose competitor_room_id matches an existing mapped room.
Step 5 – Write retrieved gross_amount into output competitor_room and competitor_price.
Step 6 – Calculate average and lowest valid competitor gross_amount for each room type.
Output: YYYY-MM-DD-HotelName.xlsx
Optional: Forward report to Telegram account / Google Drive.
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

    if not input_workbook_path.exists():
        raise FileNotFoundError(f"Input workbook not found at: {input_workbook_path}")

    target_output_dir = output_dir or OUTPUT_DIR
    target_output_dir.mkdir(parents=True, exist_ok=True)

    # Step 1: Open input workbook and read saved mappings
    print(f"\n📖 Step 1: Reading saved mappings from {input_workbook_path.name}...")
    wb_data = ExcelEngine.load_input_workbook(input_workbook_path)
    hotel_name = wb_data["hotel_name"]
    hotel_rooms = wb_data["hotel_data"]
    competitor_hotels = wb_data["competitor_hotel"]
    mapped_rooms = wb_data["competitor_room"]

    # Filter to only rooms that are actually mapped to an active room_type
    active_mappings = [
        r for r in mapped_rooms 
        if r.get("our_room_type") and str(r.get("our_room_type")).strip().upper() not in ["UNMAPPED", "IGNORE", "NONE", ""]
    ]
    
    unique_hotel_ids = sorted(list(set(
        str(r["competitor_hotel_id"]).strip() 
        for r in active_mappings 
        if r.get("competitor_hotel_id")
    )))

    print(f"   Hotel Name: {hotel_name}")
    print(f"   Active Mapped Rooms: {len(active_mappings)}")
    print(f"   Competitor Hotel IDs to query: {unique_hotel_ids}")
    print(f"   Dates: {arrival_date} to {departure_date}")

    # Step 2: Formulate dated output workbook filename
    date_prefix = datetime.now().strftime("%Y-%m-%d")
    output_filename = f"{date_prefix}-{hotel_name}.xlsx"
    output_path = target_output_dir / output_filename
    print(f"\n📝 Step 2: Target output file: {output_path}")

    # Step 3: Call RapidAPI GET Get Room List for each competitor hotel
    client = RapidApiBookingClient()
    api_room_records = []

    print("\n🌐 Step 3: Fetching latest room rates from RapidAPI...")
    for h_id in unique_hotel_ids:
        print(f"   Querying competitor hotel_id: {h_id}...")
        try:
            rooms = client.get_room_list(
                hotel_id=h_id,
                arrival_date=arrival_date,
                departure_date=departure_date
            )
            print(f"   -> Retrieved {len(rooms)} room records.")
            api_room_records.extend(rooms)
        except Exception as e:
            print(f"   ❌ Failed to fetch room list for hotel {h_id}: {e}")

    # Step 4, 5, 6: Match records, calculate lowest/average, and write dated workbook
    print("\n⚙️ Step 4, 5 & 6: Matching room IDs, computing lowest & average rates...")
    output_file = ExcelEngine.generate_output_workbook(
        output_path=output_path,
        hotel_name=hotel_name,
        hotel_rooms=hotel_rooms,
        mapped_rooms=active_mappings,
        api_room_records=api_room_records,
        arrival_date=arrival_date,
        departure_date=departure_date
    )

    print(f"\n✅ Dated output workbook generated at: {output_file}")
    print("   Original input workbook was kept untouched.")

    # Calculate brief summary for console & Telegram
    summary_data = []
    # Read back generated stats
    wb_out = ExcelEngine.load_input_workbook(output_file) # or read competitor_price
    # Simple summary compilation
    notifier = TelegramNotifier(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
    if send_telegram and notifier.is_configured:
        print("\n📱 Forwarding dated workbook to Telegram...")
        # Prepare summaries
        # Quick extract from generated prices
        import openpyxl
        out_wb = openpyxl.load_workbook(output_file, data_only=True)
        if "competitor_price" in out_wb.sheetnames:
            ws = out_wb["competitor_price"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if row and row[0]:
                    summary_data.append({
                        "room_type": row[0],
                        "lowest_price": row[3],
                        "avg_price": row[4],
                        "quotes": row[5] if len(row) > 5 else 0
                    })
        
        sent = notifier.send_report_summary(
            hotel_name=hotel_name,
            arrival_date=arrival_date,
            departure_date=departure_date,
            room_summaries=summary_data,
            file_path=output_file
        )
        if sent:
            print("✅ Telegram notification & workbook sent successfully!")
        else:
            print("⚠️ Telegram dispatch failed or was skipped.")

    return output_file

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="YAMA Bot - Flow 2 Price Extraction")
    parser.add_argument("--input", default="MSP D'Spark Hotel Bayu.xlsx", help="Input workbook filename or path")
    parser.add_argument("--arrival", default=None, help="Arrival date (YYYY-MM-DD)")
    parser.add_argument("--departure", default=None, help="Departure date (YYYY-MM-DD)")
    parser.add_argument("--telegram", action="store_true", default=True, help="Send result to Telegram")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.is_absolute() and not input_path.exists():
        input_path = INPUT_DIR / args.input

    # Default to tomorrow + 1 day
    arrival = args.arrival or (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    departure = args.departure or (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")

    run_flow2_extraction(
        input_workbook_path=input_path,
        arrival_date=arrival,
        departure_date=departure,
        send_telegram=args.telegram
    )
