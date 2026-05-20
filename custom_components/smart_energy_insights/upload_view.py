"""HTTP API endpoint for CSV load profile uploads."""

import csv
import io
import json
import logging
import re
from datetime import datetime, timedelta

from aiohttp.web import Request, Response
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.recorder.statistics import (
    StatisticMetaData,
    async_add_external_statistics,
)
from homeassistant.helpers.storage import Store  # <-- NEU: HA Storage-Klasse importieren
from homeassistant.util import dt as dt_util

from .const import (
    ALLOWED_UNITS,
    DEFAULT_OBIS_CODE,
    CSV_COLUMNS_REQUIRED,
    MAX_UPLOAD_FILE_SIZE_MB,
    DOMAIN,
    UPLOAD_API_ENDPOINT,
)
from .sensor import async_import_spot_prices_for_range

_LOGGER = logging.getLogger(__name__)

# --- NEU: Konstanten für den persistenten JSON-Speicher definieren ---
STORAGE_KEY = f"{DOMAIN}_cache"
STORAGE_VERSION = 1


class SmartEnergyInsightsUploadView(HomeAssistantView):
    """HTTP API endpoint for CSV uploads."""

    url = UPLOAD_API_ENDPOINT
    name = "api:smart_energy_insights:upload"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        """Return the last successful upload data from permanent HA storage."""
        hass = request.app["hass"]
        
        # --- ANGEPASST: Daten aus dem persistenten .storage-Ordner laden ---
        store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        last_data = await store.async_load()
        
        if last_data:
            return Response(
                status=200,
                text=json.dumps(last_data),
                content_type="application/json"
            )
        
        return Response(status=200, text="{}", content_type="application/json")

    async def post(self, request: Request) -> Response:
        """Handle POST request with CSV file upload."""
        try:
            reader = await request.multipart()
            csv_content = None
            obis_code = DEFAULT_OBIS_CODE

            async for field in reader:
                if field.name == "file":
                    content = await field.read()
                    if len(content) > MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024:
                        return Response(
                            status=413,
                            text='{"error": "File too large"}',
                            content_type="application/json",
                        )
                    
                    csv_content = None
                    for encoding in ["utf-8", "utf-8-sig", "latin-1", "iso-8859-1", "cp1252"]:
                        try:
                            csv_content = content.decode(encoding)
                            break
                        except UnicodeDecodeError:
                            continue
                    
                    if csv_content is None:
                        return Response(
                            status=400,
                            text='{"error": "File encoding not supported. Try UTF-8 or Windows-1252"}',
                            content_type="application/json",
                        )
                elif field.name == "obis_code":
                    obis_code = await field.text()

            if not csv_content:
                return Response(
                    status=400,
                    text='{"error": "No file provided"}',
                    content_type="application/json",
                )

            result = await self._parse_and_validate_csv(csv_content)
            if "error" in result:
                return Response(
                    status=400,
                    text=f'{{"error": "{result["error"]}"}}',
                    content_type="application/json",
                )

            statistics = result.get("statistics", [])
            if not statistics:
                return Response(
                    status=400,
                    text='{"error": "No valid data rows found"}',
                    content_type="application/json",
                )

            safe_domain = re.sub(r"[^a-z0-9_]", "_", str(DOMAIN).lower())
            safe_domain = re.sub(r"_+", "_", safe_domain).strip("_")
            if not safe_domain:
                safe_domain = "smart_energy_insights"

            safe_obis = re.sub(r"[^a-z0-9_]", "_", str(obis_code).lower())
            safe_obis = re.sub(r"_+", "_", safe_obis).strip("_")

            object_id = f"load_profile_{safe_obis}" if safe_obis else "load_profile"
            object_id = re.sub(r"_+", "_", object_id).strip("_")

            stat_id = f"{safe_domain}:{object_id}"

            metadata = StatisticMetaData(
                has_mean=False,
                has_sum=True,
                name=f"Load Profile ({obis_code})",
                source=safe_domain,
                statistic_id=stat_id,
                unit_class="energy",
                unit_of_measurement="kWh",
            )

            hass = request.app["hass"]
            
            async_add_external_statistics(hass, metadata, statistics)

            start_iso = statistics[0]["start"].isoformat()
            end_iso = statistics[-1]["start"].isoformat()

            avg_consumption = None
            if statistics:
                avg_consumption = sum(item["state"] for item in statistics) / len(statistics)

            price_result = {
                "imported_count": 0,
                "average_price": None,
                "series_count": 0,
            }
            try:
                price_end = statistics[-1]["start"] + timedelta(hours=1)
                price_result = await async_import_spot_prices_for_range(
                    hass,
                    statistics[0]["start"],
                    price_end,
                    missing_only=True,
                )
            except Exception as err:
                _LOGGER.warning("Spot price import failed: %s", err, exc_info=True)

            price_heatmap = []
            price_series = price_result.get("series", [])
            if price_series:
                p_sums = {d: {h: 0.0 for h in range(24)} for d in range(7)}
                p_counts = {d: {h: 0 for h in range(24)} for d in range(7)}
                
                for point in price_series:
                    dt_local = dt_util.as_local(point["start"])
                    d = dt_local.weekday()
                    h = dt_local.hour
                    p_sums[d][h] += point["value"]
                    p_counts[d][h] += 1
                    
                for d in range(7):
                    row = []
                    for h in range(24):
                        avg = p_sums[d][h] / p_counts[d][h] if p_counts[d][h] > 0 else 0
                        row.append(round(avg, 3))
                    price_heatmap.append(row)

            response_data = {
                "success": True,
                "count": len(statistics),
                "statistic_id": stat_id,
                "start": start_iso,
                "end": end_iso,
                "avg_consumption_kwh": avg_consumption,
                "avg_price_ct_kwh": price_result.get("average_price"),
                "price_imported_count": price_result.get("imported_count"),
                "price_series_count": price_result.get("series_count"),
                "consumption_heatmap": result.get("consumption_heatmap", []),
                "price_heatmap": price_heatmap
            }

            # --- ANGEPASST: Wir schreiben die Daten permanent in den HA-.storage-Ordner ---
            store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
            await store.async_save(response_data)

            return Response(
                status=200,
                text=json.dumps(response_data),
                content_type="application/json",
            )

        except Exception as err:
            _LOGGER.error("Error processing upload: %s", err, exc_info=True)
            return Response(
                status=500,
                text='{"error": "Internal server error"}',
                content_type="application/json",
            )

    async def _parse_and_validate_csv(self, csv_content: str) -> dict:
        """Parse and validate CSV content."""
        try:
            csv_reader = csv.DictReader(
                io.StringIO(csv_content),
                delimiter=";",
            )

            if not csv_reader.fieldnames:
                return {"error": "Empty CSV file"}

            missing_cols = set(CSV_COLUMNS_REQUIRED) - set(csv_reader.fieldnames or [])
            if missing_cols:
                return {
                    "error": f"Missing required columns: {', '.join(sorted(missing_cols))}"
                }

            hourly_data = {}
            row_count = 0

            for row in csv_reader:
                row_count += 1

                unit = row.get("Einheit", "").strip().lower()
                if unit not in [u.lower() for u in ALLOWED_UNITS] and unit != "kwh":
                    return {"error": f"Row {row_count}: Invalid unit '{unit}'"}

                begin_str = row.get("Statistikzeitraum Beginn", "").strip()
                end_str = row.get("Statistikzeitraum Ende", "").strip()

                if not begin_str or not end_str:
                    return {"error": f"Row {row_count}: Missing timestamps"}

                try:
                    fmt = "%d.%m.%Y %H:%M"
                    begin_local = datetime.strptime(begin_str, fmt)
                    end_local = datetime.strptime(end_str, fmt)
                except ValueError:
                    return {"error": f"Row {row_count}: Invalid date format. Expected DD.MM.YYYY HH:MM"}

                value_str = row.get("Wert", "").strip().replace(",", ".")
                try:
                    value = float(value_str)
                except ValueError:
                    return {"error": f"Row {row_count}: Invalid value '{row.get('Wert', '')}'"}

                hour_start_local = begin_local.replace(minute=0, second=0, microsecond=0)
                if hour_start_local not in hourly_data:
                    hourly_data[hour_start_local] = 0.0
                hourly_data[hour_start_local] += value

            if not hourly_data:
                return {"error": "No valid data rows found"}

            statistics = []
            running_sum = 0.0
            for hour_local in sorted(hourly_data.keys()):
                hourly_value = hourly_data[hour_local]
                running_sum += hourly_value

                hour_utc = dt_util.as_utc(
                    hour_local.replace(tzinfo=dt_util.get_default_time_zone())
                )

                statistics.append({
                    "start": hour_utc,
                    "state": hourly_value,
                    "sum": running_sum
                })

            heatmap_sums = {d: {h: 0.0 for h in range(24)} for d in range(7)}
            heatmap_counts = {d: {h: 0 for h in range(24)} for d in range(7)}

            for hour_local, val in hourly_data.items():
                d = hour_local.weekday()
                h = hour_local.hour
                heatmap_sums[d][h] += val
                heatmap_counts[d][h] += 1

            consumption_heatmap = []
            for d in range(7):
                row = []
                for h in range(24):
                    avg = heatmap_sums[d][h] / heatmap_counts[d][h] if heatmap_counts[d][h] > 0 else 0
                    row.append(round(avg, 3))
                consumption_heatmap.append(row)

            return {
                "statistics": statistics,
                "consumption_heatmap": consumption_heatmap
            }

        except Exception as e:
            _LOGGER.error("CSV error: %s", e)
            return {"error": f"Error parsing CSV: {str(e)}"}