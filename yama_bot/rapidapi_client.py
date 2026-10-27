"""
RapidAPI Booking.com Client for YAMA Bot
Implements the 3 required endpoints according to YAMA Bot Requirements v3:
1. Search Hotel Destination (hotel name in booking.com)
2. Get Hotel Details (hotel_id, arrival_date, departure_date)
3. Get Room List (hotel_id, arrival_date, departure_date) -> room IDs, names, gross_amount
"""

import logging
import requests
from typing import Dict, Any, List, Optional
from .config import RAPIDAPI_KEY, RAPIDAPI_HOST

logger = logging.getLogger(__name__)

class RapidApiBookingClient:
    def __init__(self, api_key: Optional[str] = None, api_host: Optional[str] = None):
        self.api_key = api_key or RAPIDAPI_KEY
        self.api_host = api_host or RAPIDAPI_HOST
        self.base_url = f"https://{self.api_host}"

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "x-rapidapi-key": self.api_key,
            "x-rapidapi-host": self.api_host,
            "Content-Type": "application/json"
        }

    def search_hotel_destination(self, query: str) -> List[Dict[str, Any]]:
        """
        Flow 1 - Step 2: Search competitor hotel using query string.
        Returns candidate hotels with hotel_id, name, and location.
        """
        if not self.api_key:
            raise ValueError("RAPIDAPI_KEY is required to query Booking.com API.")

        url = f"{self.base_url}/api/v1/hotels/searchDestination"
        params = {"query": query}
        
        try:
            response = requests.get(url, headers=self.headers, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            results = []
            # Normalize different RapidAPI response formats
            items = data.get("data", []) if isinstance(data, dict) else data
            for item in items:
                results.append({
                    "dest_id": str(item.get("dest_id") or item.get("id") or item.get("hotel_id", "")),
                    "search_type": item.get("search_type", "hotel"),
                    "name": item.get("name") or item.get("label", ""),
                    "city_name": item.get("city_name") or item.get("city", ""),
                    "country": item.get("country", "")
                })
            return results
        except Exception as e:
            logger.error(f"Error in search_hotel_destination for '{query}': {e}")
            raise

    def get_hotel_details(self, hotel_id: str, arrival_date: str, departure_date: str) -> Dict[str, Any]:
        """
        Flow 1 - Step 3: Fill competitor_hotel information.
        """
        if not self.api_key:
            raise ValueError("RAPIDAPI_KEY is required to query Booking.com API.")

        url = f"{self.base_url}/api/v1/hotels/getHotelDetails"
        params = {
            "hotel_id": str(hotel_id),
            "arrival_date": arrival_date,
            "departure_date": departure_date,
            "currency": "MYR"
        }

        try:
            response = requests.get(url, headers=self.headers, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            hotel_data = data.get("data", {}) if isinstance(data, dict) else data
            
            return {
                "hotel_id": str(hotel_id),
                "hotel_name": hotel_data.get("hotel_name") or hotel_data.get("name", ""),
                "address": hotel_data.get("address", ""),
                "city": hotel_data.get("city", ""),
                "review_score": hotel_data.get("review_score") or hotel_data.get("score"),
                "currency": hotel_data.get("currency", "MYR"),
                "url": hotel_data.get("url", "")
            }
        except Exception as e:
            logger.error(f"Error fetching hotel details for ID {hotel_id}: {e}")
            raise

    def get_room_list(self, hotel_id: str, arrival_date: str, departure_date: str) -> List[Dict[str, Any]]:
        """
        Flow 1 - Step 4 & Flow 2 - Step 3:
        Retrieve competitor room IDs, room names, and gross_amount.
        Returns a list of room dictionaries:
        [{
            "competitor_hotel_id": "...",
            "competitor_room_id": "...",
            "room_name": "...",
            "gross_amount": 145.50 or None,
            "currency": "MYR"
        }]
        """
        if not self.api_key:
            raise ValueError("RAPIDAPI_KEY is required.")

        url = f"{self.base_url}/api/v1/hotels/getRoomList"
        params = {
            "hotel_id": str(hotel_id),
            "arrival_date": arrival_date,
            "departure_date": departure_date,
            "currency": "MYR"
        }

        try:
            response = requests.get(url, headers=self.headers, params=params, timeout=20)
            response.raise_for_status()
            data = response.json()
            
            raw_rooms = []
            if isinstance(data, dict):
                raw_rooms = data.get("data", {}).get("rooms", []) or data.get("data", []) or data.get("rooms", [])
            elif isinstance(data, list):
                raw_rooms = data

            parsed_rooms = []
            for room in raw_rooms:
                room_id = str(room.get("room_id") or room.get("id") or "")
                room_name = room.get("room_name") or room.get("name") or "Standard Room"
                
                # Extract gross amount
                gross_amount = None
                price_info = room.get("gross_amount") or room.get("price") or room.get("composite_price_breakdown", {})
                
                if isinstance(price_info, (int, float)):
                    gross_amount = float(price_info)
                elif isinstance(price_info, dict):
                    gross_val = (price_info.get("gross_amount", {}).get("value") 
                                 or price_info.get("all_inclusive_amount", {}).get("value")
                                 or price_info.get("value"))
                    if gross_val is not None:
                        try:
                            gross_amount = float(gross_val)
                        except (ValueError, TypeError):
                            gross_amount = None

                parsed_rooms.append({
                    "competitor_hotel_id": str(hotel_id),
                    "competitor_room_id": room_id,
                    "room_name": room_name,
                    "gross_amount": gross_amount,
                    "currency": room.get("currency", "MYR")
                })

            return parsed_rooms
        except Exception as e:
            logger.error(f"Error fetching room list for hotel_id {hotel_id}: {e}")
            raise
