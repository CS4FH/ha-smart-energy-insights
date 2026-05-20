"""HTTP API endpoint for CSV load profile uploads."""

import json
import logging
import re
from datetime import timedelta

from aiohttp.web import Request, Response
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.recorder.statistics import StatisticMetaData
from homeassistant.util import dt as dt_util

from .const import DEFAULT_OBIS_CODE, DOMAIN, MAX_UPLOAD_FILE_SIZE_MB, UPLOAD_API_ENDPOINT
from .repositories.cache_repository import (
    async_load_cache,
    async_save_cache,
    async_update_cache,
)
from .repositories.csv_repository import parse_and_validate_csv
from .repositories.statistics_repository import async_add_external_stats
from .services.pricing_service import (
    compute_spot_price_matches,
    get_pricing_config,
    update_pricing_config,
)
from .services.spot_price_service import async_import_spot_prices_for_range
from .utils.translation import async_translate

_LOGGER = logging.getLogger(__name__)


async def _error_response(hass, key, placeholders=None, status=400) -> Response:
    message = await async_translate(
        hass,
        key,
        placeholders=placeholders,
        default="Internal server error",
    )
    return Response(
        status=status,
        text=json.dumps({"error": message}),
        content_type="application/json",
    )


class SmartEnergyInsightsUploadView(HomeAssistantView):
    url = UPLOAD_API_ENDPOINT
    name = "api:smart_energy_insights:upload"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        hass = request.app["hass"]
        last_data = await async_load_cache(hass)
        if last_data:
            return Response(
                status=200,
                text=json.dumps(last_data),
                content_type="application/json",
            )
        return Response(status=200, text="{}", content_type="application/json")

    async def post(self, request: Request) -> Response:
        hass = request.app["hass"]

        # --- ROUTE 1: LEISE EINSTELLUNGS-UPDATES VOM FRONTEND ---
        if request.content_type and request.content_type.startswith("application/json"):
            try:
                data = await request.json()
                update_pricing_config(hass, data)
                await async_update_cache(hass, data)
                return Response(status=200, text='{"success": true}', content_type="application/json")
            except Exception as err:
                _LOGGER.error("Error saving settings: %s", err, exc_info=True)
                return await _error_response(hass, "api.error.internal_server", status=500)

        # --- ROUTE 2: CSV DATEI UPLOAD ---
        try:
            reader = await request.multipart()
            csv_content = None
            obis_code = DEFAULT_OBIS_CODE
            filename = await async_translate(
                hass,
                "api.default_filename",
                default="Unknown.csv",
            )

            async for field in reader:
                if field.name == "file":
                    filename = field.filename or "Unbekannt.csv" # NEU
                    content = await field.read()
                    if len(content) > MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024:
                        return await _error_response(
                            hass,
                            "api.error.file_too_large",
                            status=413,
                        )
                    
                    csv_content = None
                    for encoding in ["utf-8", "utf-8-sig", "latin-1", "iso-8859-1", "cp1252"]:
                        try:
                            csv_content = content.decode(encoding)
                            break
                        except UnicodeDecodeError:
                            continue
                    
                    if csv_content is None:
                        return await _error_response(
                            hass,
                            "api.error.encoding_not_supported",
                        )
                elif field.name == "obis_code":
                    obis_code = await field.text()

            if not csv_content:
                return await _error_response(hass, "api.error.no_file_provided")

            result = parse_and_validate_csv(csv_content)
            if result.get("error_key"):
                return await _error_response(
                    hass,
                    result["error_key"],
                    placeholders=result.get("error_placeholders"),
                )

            statistics = result.get("statistics", [])
            if not statistics:
                return await _error_response(hass, "api.error.no_valid_rows")

            safe_domain = re.sub(r"[^a-z0-9_]", "_", str(DOMAIN).lower()).strip("_") or "smart_energy_insights"
            safe_obis = re.sub(r"[^a-z0-9_]", "_", str(obis_code).lower()).strip("_")
            object_id = re.sub(r"_+", "_", f"load_profile_{safe_obis}" if safe_obis else "load_profile").strip("_")
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
            await async_add_external_stats(hass, metadata, statistics)

            start_iso = statistics[0]["start"].isoformat()
            end_iso = statistics[-1]["start"].isoformat()
            avg_consumption = sum(item["state"] for item in statistics) / len(statistics) if statistics else None

            price_result = {"imported_count": 0, "average_price": None, "series_count": 0}
            try:
                price_end = statistics[-1]["start"] + timedelta(hours=1)
                price_result = await async_import_spot_prices_for_range(
                    hass, statistics[0]["start"], price_end, missing_only=True
                )
            except Exception as err:
                _LOGGER.warning("Spot price import failed: %s", err, exc_info=True)

            price_series = price_result.get("series", [])
            pricing_config = get_pricing_config(hass)
            spot_stats = compute_spot_price_matches(statistics, price_series)
            inputs_are_net = (await async_load_cache(hass)).get("inputs_are_net", True)

            # NEU: Zeitstempel des Uploads sichern
            upload_date_iso = dt_util.now().isoformat()

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
                "price_heatmap": spot_stats["price_heatmap"],
                
                "matched_hours": spot_stats["matched_hours"],
                "duration_months": spot_stats["duration_months"],
                "matched_consumption": spot_stats["matched_consumption"],
                "base_spot_cost_eur": spot_stats["base_spot_cost_cents"] / 100.0,
                "fixed_price_ct": pricing_config.fixed_price,
                "fixed_base_fee_eur": pricing_config.fixed_base_fee,
                "spot_markup_ct": pricing_config.spot_markup,
                "spot_base_fee_eur": pricing_config.spot_base_fee,
                "tax_rate": pricing_config.tax_rate,
                "inputs_are_net": inputs_are_net,
                
                "filename": filename, # NEU
                "upload_date": upload_date_iso # NEU
            }

            await async_save_cache(hass, response_data)
            return Response(status=200, text=json.dumps(response_data), content_type="application/json")

        except Exception as err:
            _LOGGER.error("Error processing upload: %s", err, exc_info=True)
            return await _error_response(hass, "api.error.internal_server", status=500)