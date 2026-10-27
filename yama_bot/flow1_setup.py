"""
YAMA Bot: Flow 1 - Initial Hotel and Room Mapping Setup
Run once for each hotel during onboarding.
Run again only when hotel/competitor details or room mappings need changes.

Step 1 – Enter the hotel's room types and rate limits manually in hotel_data.
Step 2 – Find each competitor using RapidAPI GET Search Hotel Destination. Save the competitor hotel ID.
Step 3 – Use GET Get Hotel Details to fill competitor_hotel information.
Step 4 – Use GET Get Room List to obtain competitor room IDs, room names and gross_amount.
Step 5 – Review the competitor rooms and manually map each suitable competitor room to our room_type in competitor_room. Save input workbook.
"""

import sys
import argparse
from pathlib import Path
from datetime import datetime, timedelta

from .config import INPUT_DIR, RAPIDAPI_KEY, RAPIDAPI_HOST
from .rapidapi_client import RapidApiBookingClient
from .excel_engine import ExcelEngine

def run_flow1_setup(
    hotel_name: str,
    hotel_rooms: list,
    competitor_queries: list,
    arrival_date: str = None,
    departure_date: str = None,
    output_filename: str = None
):
    print("=" * 60)
    print(f"🏨 YAMA Bot: Flow 1 Setup for '{hotel_name}'")
    print("=" * 60)

    client = RapidApiBookingClient()
    
    # Default dates for room discovery (e.g. 14 days ahead)
    if not arrival_date:
        arrival = datetime.now() + timedelta(days=14)
        arrival_date = arrival.strftime("%Y-%m-%d")
    if not departure_date:
        dep = datetime.strptime(arrival_date, "%Y-%m-%d") + timedelta(days=1)
        departure_date = dep.strftime("%Y-%m-%d")

    print(f"📅 Probe dates for room discovery: {arrival_date} -> {departure_date}")

    # Step 2 & 3: Find each competitor and get details
    competitor_hotels = []
    discovered_rooms = []

    for query in competitor_queries:
        print(f"\n🔍 Step 2: Searching for competitor '{query}'...")
        try:
            results = client.search_hotel_destination(query)
            if not results:
                print(f"⚠️ No destination results found for '{query}'. Skipping.")
                continue

            top_hotel = results[0]
            hotel_id = top_hotel["dest_id"]
            print(f"   Found Hotel ID: {hotel_id} ({top_hotel['name']})")

            # Step 3: Get Hotel Details
            print(f"🏨 Step 3: Fetching hotel details for ID {hotel_id}...")
            details = client.get_hotel_details(hotel_id, arrival_date, departure_date)
            competitor_hotels.append({
                "competitor_hotel_id": hotel_id,
                "competitor_hotel_name": details.get("hotel_name") or top_hotel["name"],
                "address": details.get("address", ""),
                "city": details.get("city", top_hotel.get("city_name", "")),
                "review_score": details.get("review_score", ""),
                "url": details.get("url", "")
            })

            # Step 4: Get Room List
            print(f"🛏️ Step 4: Fetching room list for hotel ID {hotel_id}...")
            rooms = client.get_room_list(hotel_id, arrival_date, departure_date)
            print(f"   Found {len(rooms)} rooms.")
            for r in rooms:
                r["competitor_hotel_name"] = details.get("hotel_name") or top_hotel["name"]
                discovered_rooms.append(r)

        except Exception as e:
            print(f"❌ Error querying competitor '{query}': {e}")

    # Step 5: Room mapping
    print("\n" + "=" * 60)
    print("📋 Step 5: Preparing competitor_room mapping sheet...")
    mapped_rooms = []
    
    # Pre-assign or provide interactive mapping template
    for r in discovered_rooms:
        # Default suggested mapping based on room type name keywords
        r_name_lower = r["room_name"].lower()
        suggested_type = ""
        for hr in hotel_rooms:
            htype_name = hr["room_type"].lower()
            if any(word in r_name_lower for word in htype_name.split() if len(word) > 2):
                suggested_type = hr["room_type"]
                break

        mapped_rooms.append({
            "competitor_hotel_id": r["competitor_hotel_id"],
            "competitor_hotel_name": r.get("competitor_hotel_name", ""),
            "competitor_room_id": r["competitor_room_id"],
            "competitor_room_name": r["room_name"],
            "gross_amount": r.get("gross_amount", ""),
            "our_room_type": suggested_type or "UNMAPPED"
        })

    # Save input workbook
    filename = output_filename or f"{hotel_name}.xlsx"
    target_path = INPUT_DIR / filename
    
    ExcelEngine.create_input_workbook(
        file_path=target_path,
        hotel_name=hotel_name,
        hotel_rooms=hotel_rooms,
        competitor_hotels=competitor_hotels,
        mapped_rooms=mapped_rooms
    )

    print(f"\n✅ Input workbook successfully created at: {target_path}")
    print("👉 Next step: Open this workbook and review 'competitor_room' sheet to verify 'our_room_type' mappings.")
    return target_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="YAMA Bot - Flow 1 Onboarding & Setup")
    parser.add_argument("--hotel", default="MSP D'Spark Hotel Bayu", help="Our hotel name")
    parser.add_argument("--competitors", nargs="+", default=["Premiere Hotel Klang", "Crystal Crown Hotel Klang"], help="Competitor hotel search queries")
    args = parser.parse_args()

    sample_rooms = [
        {"room_type": "Standard Queen", "room_name": "Standard Queen Room", "min_rate": 85, "max_rate": 140},
        {"room_type": "Superior Twin", "room_name": "Superior Twin Room", "min_rate": 95, "max_rate": 160},
        {"room_type": "Deluxe King", "room_name": "Deluxe King Room", "min_rate": 120, "max_rate": 200},
        {"room_type": "Family Suite", "room_name": "Family Suite Room", "min_rate": 180, "max_rate": 300},
    ]

    run_flow1_setup(
        hotel_name=args.hotel,
        hotel_rooms=sample_rooms,
        competitor_queries=args.competitors
    )
