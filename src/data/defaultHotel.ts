import { HotelRoomType, CompetitorHotel, CompetitorRoomMapping } from '../types/yama';

export const DEFAULT_HOTEL_NAME = "MSP D'Spark Hotel Bayu";

export const DEFAULT_HOTEL_ROOMS: HotelRoomType[] = [
  { room_type: "Standard Queen", room_name: "Standard Queen Room (No Window)", min_rate: 85, max_rate: 135 },
  { room_type: "Superior Twin", room_name: "Superior Twin Room (Window)", min_rate: 98, max_rate: 155 },
  { room_type: "Deluxe King", room_name: "Deluxe King Room", min_rate: 125, max_rate: 195 },
  { room_type: "Family Suite", room_name: "Family Suite (2 Queen Beds)", min_rate: 175, max_rate: 280 }
];

export const DEFAULT_COMPETITOR_HOTELS: CompetitorHotel[] = [
  {
    competitor_hotel_id: "104258",
    competitor_hotel_name: "Premiere Hotel Klang",
    address: "Bandar Bukit Tinggi 1/KS6, Jalan Langat",
    city: "Klang, Selangor",
    review_score: 8.2,
    url: "https://www.booking.com/hotel/my/premiere.html"
  },
  {
    competitor_hotel_id: "219803",
    competitor_hotel_name: "Crystal Crown Hotel Harbour View",
    address: "217 Persiaran Raja Muda Musa",
    city: "Port Klang, Selangor",
    review_score: 7.6,
    url: "https://www.booking.com/hotel/my/crystal-crown-harbour-view.html"
  },
  {
    competitor_hotel_id: "418290",
    competitor_hotel_name: "Merrida Hotel Klang",
    address: "18R Lebuh Enggang, Off Jalan Meru",
    city: "Klang, Selangor",
    review_score: 7.9,
    url: "https://www.booking.com/hotel/my/merrida.html"
  }
];

export const DEFAULT_MAPPED_ROOMS: CompetitorRoomMapping[] = [
  // Premiere Hotel Klang mappings
  {
    competitor_hotel_id: "104258",
    competitor_hotel_name: "Premiere Hotel Klang",
    competitor_room_id: "10425801",
    competitor_room_name: "Deluxe Queen Room",
    gross_amount: 142.00,
    our_room_type: "Standard Queen"
  },
  {
    competitor_hotel_id: "104258",
    competitor_hotel_name: "Premiere Hotel Klang",
    competitor_room_id: "10425802",
    competitor_room_name: "Superior Twin Room",
    gross_amount: 158.00,
    our_room_type: "Superior Twin"
  },
  {
    competitor_hotel_id: "104258",
    competitor_hotel_name: "Premiere Hotel Klang",
    competitor_room_id: "10425803",
    competitor_room_name: "Executive King Room",
    gross_amount: 195.00,
    our_room_type: "Deluxe King"
  },
  {
    competitor_hotel_id: "104258",
    competitor_hotel_name: "Premiere Hotel Klang",
    competitor_room_id: "10425804",
    competitor_room_name: "Premier Family Suite",
    gross_amount: 285.00,
    our_room_type: "Family Suite"
  },

  // Crystal Crown mappings
  {
    competitor_hotel_id: "219803",
    competitor_hotel_name: "Crystal Crown Hotel Harbour View",
    competitor_room_id: "21980301",
    competitor_room_name: "Standard Double Room",
    gross_amount: 115.00,
    our_room_type: "Standard Queen"
  },
  {
    competitor_hotel_id: "219803",
    competitor_hotel_name: "Crystal Crown Hotel Harbour View",
    competitor_room_id: "21980302",
    competitor_room_name: "Superior Twin Room",
    gross_amount: 128.00,
    our_room_type: "Superior Twin"
  },
  {
    competitor_hotel_id: "219803",
    competitor_hotel_name: "Crystal Crown Hotel Harbour View",
    competitor_room_id: "21980303",
    competitor_room_name: "Deluxe Room with Harbor View",
    gross_amount: 168.00,
    our_room_type: "Deluxe King"
  },

  // Merrida Hotel Klang mappings
  {
    competitor_hotel_id: "418290",
    competitor_hotel_name: "Merrida Hotel Klang",
    competitor_room_id: "41829001",
    competitor_room_name: "Cozy Queen Room",
    gross_amount: 98.00,
    our_room_type: "Standard Queen"
  },
  {
    competitor_hotel_id: "418290",
    competitor_hotel_name: "Merrida Hotel Klang",
    competitor_room_id: "41829002",
    competitor_room_name: "Standard Twin Beds",
    gross_amount: 110.00,
    our_room_type: "Superior Twin"
  },
  {
    competitor_hotel_id: "418290",
    competitor_hotel_name: "Merrida Hotel Klang",
    competitor_room_id: "41829003",
    competitor_room_name: "Junior Suite",
    gross_amount: 185.00,
    our_room_type: "Family Suite"
  }
];
