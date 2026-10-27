"""
Excel Engine for YAMA Bot (Requirements v3)
Handles reading/writing the 4 sheets for input workbooks:
- hotel_data
- competitor_hotel
- competitor_room
- competitor_price

And generating the dated output workbook (containing competitor_room & competitor_price).
Follows all rules:
- Match by competitor_hotel_id and competitor_room_id strictly.
- Exclude missing/invalid/None prices from average/lowest; never treat as zero.
- Preserves original input workbook unchanged.
"""

from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

HEADER_FILL = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")  # Navy
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
SUBHEADER_FILL = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid") # Soft Blue
SUBHEADER_FONT = Font(name="Calibri", size=10, bold=True, color="1E3A8A")
REGULAR_FONT = Font(name="Calibri", size=10)
BOLD_FONT = Font(name="Calibri", size=10, bold=True)
ACCENT_GREEN = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
ACCENT_AMBER = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

THIN_BORDER = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='thin', color='CBD5E1'),
    top=Side(style='thin', color='CBD5E1'),
    bottom=Side(style='thin', color='CBD5E1')
)

class ExcelEngine:
    @staticmethod
    def load_input_workbook(file_path: Path) -> Dict[str, Any]:
        """
        Reads input workbook and extracts:
        - hotel_data
        - competitor_hotel
        - competitor_room
        - competitor_price template
        """
        wb = openpyxl.load_workbook(file_path, data_only=True)
        
        # 1. hotel_data
        hotel_data_rows = []
        hotel_name = ""
        if "hotel_data" in wb.sheetnames:
            ws = wb["hotel_data"]
            headers = [cell.value for cell in ws[1] if cell.value is not None]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not any(row):
                    continue
                row_dict = {str(headers[i]).strip(): row[i] for i in range(min(len(headers), len(row)))}
                hotel_data_rows.append(row_dict)
                if not hotel_name and row_dict.get("hotel_name"):
                    hotel_name = str(row_dict.get("hotel_name"))

        # 2. competitor_hotel
        competitor_hotels = []
        if "competitor_hotel" in wb.sheetnames:
            ws = wb["competitor_hotel"]
            headers = [str(cell.value).strip() for cell in ws[1] if cell.value is not None]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not any(row):
                    continue
                row_dict = {headers[i]: row[i] for i in range(min(len(headers), len(row)))}
                competitor_hotels.append(row_dict)

        # 3. competitor_room (Mappings)
        competitor_rooms = []
        if "competitor_room" in wb.sheetnames:
            ws = wb["competitor_room"]
            headers = [str(cell.value).strip() for cell in ws[1] if cell.value is not None]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not any(row):
                    continue
                row_dict = {headers[i]: row[i] for i in range(min(len(headers), len(row)))}
                # Ensure ids are strings for exact matching
                row_dict["competitor_hotel_id"] = str(row_dict.get("competitor_hotel_id") or "").strip()
                row_dict["competitor_room_id"] = str(row_dict.get("competitor_room_id") or "").strip()
                competitor_rooms.append(row_dict)

        return {
            "hotel_name": hotel_name or file_path.stem.replace(".xlsx", ""),
            "hotel_data": hotel_data_rows,
            "competitor_hotel": competitor_hotels,
            "competitor_room": competitor_rooms,
        }

    @staticmethod
    def create_input_workbook(
        file_path: Path,
        hotel_name: str,
        hotel_rooms: List[Dict[str, Any]],
        competitor_hotels: List[Dict[str, Any]],
        mapped_rooms: List[Dict[str, Any]]
    ):
        """
        Creates a clean 4-sheet input workbook for Flow 1.
        """
        wb = openpyxl.Workbook()
        wb.remove(wb.active)  # Remove default sheet

        # Sheet 1: hotel_data
        ws_hotel = wb.create_sheet(title="hotel_data")
        headers1 = ["hotel_name", "room_type", "room_name", "min_rate", "max_rate"]
        ws_hotel.append(headers1)
        for h in hotel_rooms:
            ws_hotel.append([
                hotel_name,
                h.get("room_type", ""),
                h.get("room_name", ""),
                h.get("min_rate", 0),
                h.get("max_rate", 0),
            ])

        # Sheet 2: competitor_hotel
        ws_comp_hotel = wb.create_sheet(title="competitor_hotel")
        headers2 = ["competitor_hotel_id", "competitor_hotel_name", "address", "city", "review_score", "url"]
        ws_comp_hotel.append(headers2)
        for ch in competitor_hotels:
            ws_comp_hotel.append([
                str(ch.get("competitor_hotel_id", "")),
                ch.get("competitor_hotel_name", ""),
                ch.get("address", ""),
                ch.get("city", ""),
                ch.get("review_score", ""),
                ch.get("url", "")
            ])

        # Sheet 3: competitor_room
        ws_comp_room = wb.create_sheet(title="competitor_room")
        headers3 = ["competitor_hotel_id", "competitor_hotel_name", "competitor_room_id", "competitor_room_name", "gross_amount", "our_room_type"]
        ws_comp_room.append(headers3)
        for cr in mapped_rooms:
            ws_comp_room.append([
                str(cr.get("competitor_hotel_id", "")),
                cr.get("competitor_hotel_name", ""),
                str(cr.get("competitor_room_id", "")),
                cr.get("competitor_room_name", ""),
                cr.get("gross_amount", ""),
                cr.get("our_room_type", "")
            ])

        # Sheet 4: competitor_price template
        ws_price = wb.create_sheet(title="competitor_price")
        headers4 = ["our_room_type", "our_min_rate", "our_max_rate", "lowest_competitor_price", "average_competitor_price", "status"]
        ws_price.append(headers4)
        for h in hotel_rooms:
            ws_price.append([
                h.get("room_type", ""),
                h.get("min_rate", ""),
                h.get("max_rate", ""),
                "", "", "Template"
            ])

        # Style all sheets
        for ws in [ws_hotel, ws_comp_hotel, ws_comp_room, ws_price]:
            ExcelEngine._style_sheet(ws)

        wb.save(file_path)
        return file_path

    @staticmethod
    def generate_output_workbook(
        output_path: Path,
        hotel_name: str,
        hotel_rooms: List[Dict[str, Any]],
        mapped_rooms: List[Dict[str, Any]],
        api_room_records: List[Dict[str, Any]],
        arrival_date: str,
        departure_date: str
    ) -> Path:
        """
        Flow 2: Generates dated output workbook.
        Contains ONLY 2 sheets:
        1. competitor_room: updated latest gross_amount for matched rooms
        2. competitor_price: calculated lowest and average prices per room_type
        """
        wb = openpyxl.Workbook()
        wb.remove(wb.active)

        # Build fast lookup dictionary: (competitor_hotel_id, competitor_room_id) -> gross_amount
        # RULE: Match API room records using competitor hotel ID and competitor room ID, not name similarity.
        api_lookup = {}
        for rec in api_room_records:
            h_id = str(rec.get("competitor_hotel_id", "")).strip()
            r_id = str(rec.get("competitor_room_id", "")).strip()
            if h_id and r_id:
                api_lookup[(h_id, r_id)] = rec.get("gross_amount")

        # Update mapped rooms with latest prices
        # RULE: Only competitor rooms already mapped in the input workbook are included
        updated_mapped_rooms = []
        for mr in mapped_rooms:
            our_type = str(mr.get("our_room_type") or "").strip()
            if not our_type or our_type.lower() in ["ignore", "unmapped", "none", ""]:
                continue

            h_id = str(mr.get("competitor_hotel_id", "")).strip()
            r_id = str(mr.get("competitor_room_id", "")).strip()
            
            # Fetch latest price
            latest_price = api_lookup.get((h_id, r_id))
            
            # RULE: Missing, unavailable, or invalid prices are left blank/marked N/A and excluded from average/lowest; never treat missing as 0
            is_valid = isinstance(latest_price, (int, float)) and latest_price > 0
            
            updated_mapped_rooms.append({
                "competitor_hotel_id": h_id,
                "competitor_hotel_name": mr.get("competitor_hotel_name", ""),
                "competitor_room_id": r_id,
                "competitor_room_name": mr.get("competitor_room_name", ""),
                "gross_amount": float(latest_price) if is_valid else "N/A",
                "valid_numeric_price": float(latest_price) if is_valid else None,
                "our_room_type": our_type
            })

        # Calculate lowest and average per room_type
        prices_by_type: Dict[str, List[float]] = {}
        for r in updated_mapped_rooms:
            rtype = r["our_room_type"]
            if rtype not in prices_by_type:
                prices_by_type[rtype] = []
            if r["valid_numeric_price"] is not None:
                prices_by_type[rtype].append(r["valid_numeric_price"])

        # 1. Output Sheet: competitor_room
        ws_comp_room = wb.create_sheet(title="competitor_room")
        headers_room = ["competitor_hotel_id", "competitor_hotel_name", "competitor_room_id", "competitor_room_name", "gross_amount", "our_room_type"]
        ws_comp_room.append(headers_room)
        for r in updated_mapped_rooms:
            ws_comp_room.append([
                r["competitor_hotel_id"],
                r["competitor_hotel_name"],
                r["competitor_room_id"],
                r["competitor_room_name"],
                r["gross_amount"],
                r["our_room_type"]
            ])

        # 2. Output Sheet: competitor_price
        ws_comp_price = wb.create_sheet(title="competitor_price")
        headers_price = [
            "our_room_type",
            "our_min_rate",
            "our_max_rate",
            "lowest_competitor_price",
            "average_competitor_price",
            "valid_competitor_quotes",
            "pricing_recommendation"
        ]
        ws_comp_price.append(headers_price)

        # Populate rows for each room type from hotel_data
        for hr in hotel_rooms:
            rtype = hr.get("room_type", "")
            min_r = hr.get("min_rate")
            max_r = hr.get("max_rate")
            
            valid_quotes = prices_by_type.get(rtype, [])
            if valid_quotes:
                lowest = min(valid_quotes)
                avg = sum(valid_quotes) / len(valid_quotes)
                lowest_val = round(lowest, 2)
                avg_val = round(avg, 2)
                quote_count = len(valid_quotes)

                # Formulate suggestion
                try:
                    min_num = float(min_r) if min_r else 0
                    max_num = float(max_r) if max_r else 9999
                    if avg_val < min_num:
                        rec = "Market lower than our min rate"
                    elif avg_val > max_num:
                        rec = "Market higher than our max rate"
                    else:
                        rec = f"Competitive (Target: RM {avg_val:.2f})"
                except Exception:
                    rec = "Valid quotes available"
            else:
                lowest_val = "N/A"
                avg_val = "N/A"
                quote_count = 0
                rec = "No valid competitor quotes"

            ws_comp_price.append([
                rtype,
                min_r,
                max_r,
                lowest_val,
                avg_val,
                quote_count,
                rec
            ])

        ExcelEngine._style_sheet(ws_comp_room)
        ExcelEngine._style_sheet(ws_comp_price)

        # Highlight lowest and average columns in competitor_price
        for row in ws_comp_price.iter_rows(min_row=2, min_col=4, max_col=5):
            for cell in row:
                if cell.value != "N/A" and isinstance(cell.value, (int, float)):
                    cell.fill = ACCENT_GREEN

        wb.save(output_path)
        return output_path

    @staticmethod
    def _style_sheet(ws):
        # Header styling
        for cell in ws[1]:
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = THIN_BORDER
        
        # Row styling & column auto-width
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.font = REGULAR_FONT
                cell.border = THIN_BORDER
                if isinstance(cell.value, (int, float)):
                    cell.alignment = Alignment(horizontal="right")
                else:
                    cell.alignment = Alignment(horizontal="left")

        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or "")
                if len(val_str) > max_len:
                    max_len = len(val_str)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)
