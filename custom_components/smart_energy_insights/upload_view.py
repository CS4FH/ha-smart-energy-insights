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


class SmartEnergyInsightsUploadView(HomeAssistantView):
    """HTTP API endpoint for CSV uploads."""

    url = UPLOAD_API_ENDPOINT
    name = "api:smart_energy_insights:upload"
    requires_auth = True

    async def post(self, request: Request) -> Response:
        """Handle POST request with CSV file upload."""
        try:
            # Multipart-Formdaten lesen
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
                    
                    # Encoding-Check
                    csv_content = None
                    for encoding in ["utf-8", "utf-8-sig", "latin-1", "iso-8859-1", "cp1252"]:
                        try:
                            csv_content = content.decode(encoding)
                            _LOGGER.debug("CSV decoded with encoding: %s", encoding)
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

            # CSV parsen und validieren
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

            # --- STATISTIC ID GENERIERUNG ---
            safe_domain = re.sub(r"[^a-z0-9_]", "_", str(DOMAIN).lower())
            safe_domain = re.sub(r"_+", "_", safe_domain).strip("_")
            if not safe_domain:
                safe_domain = "smart_energy_insights"

            safe_obis = re.sub(r"[^a-z0-9_]", "_", str(obis_code).lower())
            safe_obis = re.sub(r"_+", "_", safe_obis).strip("_")

            object_id = f"load_profile_{safe_obis}" if safe_obis else "load_profile"
            object_id = re.sub(r"_+", "_", object_id).strip("_")

            stat_id = f"{safe_domain}:{object_id}"

            # --- METADATEN (Ohne mean_type wegen SQL-Fehler) ---
            metadata = StatisticMetaData(
                has_mean=False,
                has_sum=True,
                name=f"Load Profile ({obis_code})",
                source=safe_domain,
                statistic_id=stat_id,
                unit_class="energy",
                unit_of_measurement="kWh",
            )

            _LOGGER.info(
                "Importing %d hourly statistics for %s",
                len(statistics),
                stat_id,
            )

            hass = request.app["hass"]
            
            # Import in die Langzeitstatistik
            async_add_external_statistics(
                hass,
                metadata,
                statistics,
            )

            # Erfolgsmeldung vorbereiten (Dictionary-Zugriff!)
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

            return Response(
                status=200,
                text=json.dumps({
                    "success": True,
                    "count": len(statistics),
                    "statistic_id": stat_id,
                    "start": start_iso,
                    "end": end_iso,
                    "avg_consumption_kwh": avg_consumption,
                    "avg_price_ct_kwh": price_result.get("average_price"),
                    "price_imported_count": price_result.get("imported_count"),
                    "price_series_count": price_result.get("series_count"),
                }),
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
            # HARDCODIERT: Semikolon als Trenner
            csv_reader = csv.DictReader(
                io.StringIO(csv_content),
                delimiter=";",
            )

            if not csv_reader.fieldnames:
                return {"error": "Empty CSV file"}

            # Spalten prüfen
            missing_cols = set(CSV_COLUMNS_REQUIRED) - set(csv_reader.fieldnames or [])
            if missing_cols:
                return {
                    "error": f"Missing required columns: {', '.join(sorted(missing_cols))}"
                }

            hourly_data = {}
            last_end_time = None
            row_count = 0

            for row in csv_reader:
                row_count += 1

                # Einheit-Check (tolerant)
                unit = row.get("Einheit", "").strip().lower()
                if unit not in [u.lower() for u in ALLOWED_UNITS] and unit != "kwh":
                    return {"error": f"Row {row_count}: Invalid unit '{unit}'"}

                begin_str = row.get("Statistikzeitraum Beginn", "").strip()
                end_str = row.get("Statistikzeitraum Ende", "").strip()

                if not begin_str or not end_str:
                    return {"error": f"Row {row_count}: Missing timestamps"}

                try:
                    # HARDCODIERT: Datumsformat Ihrer Datei
                    fmt = "%d.%m.%Y %H:%M"
                    begin_local = datetime.strptime(begin_str, fmt)
                    end_local = datetime.strptime(end_str, fmt)
                except ValueError as e:
                    return {"error": f"Row {row_count}: Invalid date format. Expected DD.MM.YYYY HH:MM"}

                # Wert parsen (Komma zu Punkt)
                value_str = row.get("Wert", "").strip().replace(",", ".")
                try:
                    value = float(value_str)
                except ValueError:
                    return {"error": f"Row {row_count}: Invalid value '{row.get('Wert', '')}'"}

                # Aggregation auf volle Stunde
                hour_start_local = begin_local.replace(minute=0, second=0, microsecond=0)
                if hour_start_local not in hourly_data:
                    hourly_data[hour_start_local] = 0.0
                hourly_data[hour_start_local] += value

            if not hourly_data:
                return {"error": "No valid data rows found"}

            # Statistik-Objekte mit laufender Summe bauen
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

            return {"statistics": statistics}

        except Exception as e:
            _LOGGER.error("CSV error: %s", e)
            return {"error": f"Error parsing CSV: {str(e)}"}