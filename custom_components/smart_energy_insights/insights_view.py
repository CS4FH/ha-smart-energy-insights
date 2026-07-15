"""HTTP API endpoint for CSV load profile uploads."""

import json
import logging
import re
from datetime import date, datetime, time, timedelta

from aiohttp.web import Request, Response
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.recorder.statistics import StatisticMetaData
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    MAX_UPLOAD_FILE_SIZE_MB,
    SENSOR_API_ENDPOINT,
    UPLOAD_API_ENDPOINT,
)
from .repositories.cache_repository import async_load_cache, async_update_cache
from .repositories.csv_repository import parse_and_validate_csv
from .repositories.statistics_repository import async_add_external_stats
from .repositories.statistics_repository import async_get_statistics_during_period
from .services.pricing_service import (
    build_price_heatmap,
    get_inputs_are_net,
    get_pricing_config,
)
from .services.spot_price_service import async_import_spot_prices_for_range
from .services.tariff_analysis_service import analyze_tariffs
from .utils.translation import async_translate

_LOGGER = logging.getLogger(__name__)

HEATMAP_SEASONS = {
    "whole_year": None,
    "spring": {3, 4, 5},
    "summer": {6, 7, 8},
    "autumn": {9, 10, 11},
    "winter": {12, 1, 2},
}


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
        if not hass.config_entries.async_entries(DOMAIN):
            return Response(status=404, text="{}", content_type="application/json")
        cached = await async_load_cache(hass)
        if cached:
            range_start = request.query.get("start")
            range_end = request.query.get("end")
            active_source = cached.get("active_source")
            csv_available = bool(cached.get("csv_data"))
            sensor_available = bool(cached.get("sensor_data"))

            if active_source == "csv" and cached.get("csv_data"):
                csv_data = cached.get("csv_data") or {}
                stat_id = csv_data.get("statistic_id")
                if not stat_id:
                    return await _error_response(hass, "api.error.no_data_in_range")

                default_start = dt_util.parse_datetime(csv_data.get("start"))
                default_end = dt_util.parse_datetime(csv_data.get("end"))
                if default_start:
                    default_start = dt_util.as_utc(default_start)
                if default_end:
                    default_end = dt_util.as_utc(default_end) + timedelta(hours=1)

                start_time, end_time = _resolve_date_range(
                    range_start,
                    range_end,
                    default_start,
                    default_end,
                )

                if not start_time or not end_time or start_time >= end_time:
                    return await _error_response(hass, "api.error.invalid_date_range")

                fetch_start = start_time - timedelta(hours=1)
                stats = await async_get_statistics_during_period(
                    hass,
                    fetch_start,
                    end_time,
                    {stat_id},
                    period="hour",
                    types={"sum", "state"},
                    units=None,
                )
                rows = stats.get(stat_id, [])
                statistics = _statistics_from_rows(rows, min_start=start_time, prefer_state=True)
                if not statistics:
                    return await _error_response(hass, "api.error.no_data_in_range")

                inputs_are_net = get_inputs_are_net(hass)
                available_start = csv_data.get("available_start") or csv_data.get("start")
                available_end = csv_data.get("available_end") or csv_data.get("end")
                response_data = await _build_analysis_response(
                    hass,
                    statistics,
                    "csv",
                    stat_id,
                    csv_data.get("filename") or "",
                    csv_available,
                    sensor_available,
                    inputs_are_net,
                    csv_data.get("upload_date") or dt_util.now().isoformat(),
                    available_start=available_start,
                    available_end=available_end,
                )
                return Response(
                    status=200,
                    text=json.dumps(response_data),
                    content_type="application/json",
                )

            if range_start or range_end:
                return await _error_response(hass, "api.error.no_data_in_range")

            if active_source == "sensor" and cached.get("sensor_data"):
                payload = dict(cached["sensor_data"])
                payload["csv_available"] = csv_available
                payload["sensor_available"] = sensor_available
                return Response(
                    status=200,
                    text=json.dumps(payload),
                    content_type="application/json",
                )
            if cached.get("csv_data"):
                payload = dict(cached["csv_data"])
                payload["csv_available"] = csv_available
                payload["sensor_available"] = sensor_available
                return Response(
                    status=200,
                    text=json.dumps(payload),
                    content_type="application/json",
                )

            # Backward compatibility for older cache layouts
            if cached.get("success"):
                payload = dict(cached)
                payload["csv_available"] = csv_available
                payload["sensor_available"] = sensor_available
                return Response(
                    status=200,
                    text=json.dumps(payload),
                    content_type="application/json",
                )
        return Response(status=200, text="{}", content_type="application/json")

    async def post(self, request: Request) -> Response:
        hass = request.app["hass"]
        if not hass.config_entries.async_entries(DOMAIN):
            return Response(status=404, text="{}", content_type="application/json")

        # --- ROUTE 1: Persist the selected dashboard source ---
        if request.content_type and request.content_type.startswith("application/json"):
            try:
                data = await request.json()
                if "active_source" in data:
                    await async_update_cache(hass, {"active_source": data["active_source"]})
                return Response(status=200, text='{"success": true}', content_type="application/json")
            except Exception as err:
                _LOGGER.error("Error saving settings: %s", err, exc_info=True)
                return await _error_response(hass, "api.error.internal_server", status=500)

        # --- ROUTE 2: CSV DATEI UPLOAD ---
        try:
            reader = await request.multipart()
            csv_content = None
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
            object_id = "load_profile"
            stat_id = f"{safe_domain}:{object_id}"

            metadata = StatisticMetaData(
                has_mean=False,
                has_sum=True,
                name="Load Profile",
                source=safe_domain,
                statistic_id=stat_id,
                unit_class="energy",
                unit_of_measurement="kWh",
            )
            await async_add_external_stats(hass, metadata, statistics)

            inputs_are_net = get_inputs_are_net(hass)

            # NEU: Zeitstempel des Uploads sichern
            upload_date_iso = dt_util.now().isoformat()

            cached = await async_load_cache(hass)
            response_data = await _build_analysis_response(
                hass,
                statistics,
                "csv",
                stat_id,
                filename,
                True,
                bool(cached.get("sensor_data")),
                inputs_are_net,
                upload_date_iso,
                available_start=statistics[0]["start"].isoformat(),
                available_end=statistics[-1]["start"].isoformat(),
            )

            await async_update_cache(
                hass,
                {
                    "csv_data": response_data,
                    "active_source": "csv",
                },
            )
            return Response(status=200, text=json.dumps(response_data), content_type="application/json")

        except Exception as err:
            _LOGGER.error("Error processing upload: %s", err, exc_info=True)
            return await _error_response(hass, "api.error.internal_server", status=500)


def _build_consumption_heatmap(statistics: list) -> list:
    sums = {d: {h: 0.0 for h in range(24)} for d in range(7)}
    counts = {d: {h: 0 for h in range(24)} for d in range(7)}

    for stat in statistics:
        start = stat.get("start")
        if not start:
            continue
        # Hourly statistics represent the interval ending at +1h in HA history.
        bucket_dt = dt_util.as_local(start) + timedelta(hours=1)
        d = bucket_dt.weekday()
        h = bucket_dt.hour
        sums[d][h] += stat.get("state", 0.0)
        counts[d][h] += 1

    heatmap = []
    for d in range(7):
        row = []
        for h in range(24):
            avg = sums[d][h] / counts[d][h] if counts[d][h] > 0 else 0
            row.append(round(avg, 3))
        heatmap.append(row)
    return heatmap


def _build_seasonal_heatmaps(statistics: list, price_series: list) -> dict:
    """Build whole-year and Northern Hemisphere seasonal heatmap matrices."""
    seasonal_heatmaps = {}

    for season, months in HEATMAP_SEASONS.items():
        if months is None:
            seasonal_statistics = statistics
            seasonal_prices = price_series
        else:
            seasonal_statistics = [
                stat
                for stat in statistics
                if (dt_util.as_local(stat["start"]) + timedelta(hours=1)).month in months
            ]
            seasonal_prices = [
                point
                for point in price_series
                if dt_util.as_local(point["start"]).month in months
            ]

        seasonal_heatmaps[season] = {
            "consumption_heatmap": _build_consumption_heatmap(seasonal_statistics),
            "price_heatmap": build_price_heatmap(seasonal_prices),
        }

    return seasonal_heatmaps


def _calculate_summary(statistics: list) -> dict:
    if not statistics:
        return {
            "total_consumption_kwh": 0.0,
            "avg_consumption_kwh_per_hour": 0.0,
            "avg_consumption_kwh_per_day": 0.0,
            "peak_hour": None,
            "weekday_avg_kwh_per_hour": 0.0,
            "weekend_avg_kwh_per_hour": 0.0,
        }

    total_consumption = sum(item.get("state", 0.0) for item in statistics)
    hours = len(statistics)
    avg_per_hour = total_consumption / hours if hours else 0.0

    days = set()
    hour_sums = {h: 0.0 for h in range(24)}
    hour_counts = {h: 0 for h in range(24)}
    weekday_sum = 0.0
    weekday_hours = 0
    weekend_sum = 0.0
    weekend_hours = 0

    for stat in statistics:
        start = stat.get("start")
        if not start:
            continue
        dt_local = dt_util.as_local(start)
        days.add(dt_local.date())
        hour = dt_local.hour
        value = float(stat.get("state", 0.0))
        hour_sums[hour] += value
        hour_counts[hour] += 1
        if dt_local.weekday() < 5:
            weekday_sum += value
            weekday_hours += 1
        else:
            weekend_sum += value
            weekend_hours += 1

    day_count = len(days) or 1
    avg_per_day = total_consumption / day_count

    peak_hour = None
    peak_avg = None
    for hour, total in hour_sums.items():
        count = hour_counts[hour]
        if count == 0:
            continue
        avg = total / count
        if peak_avg is None or avg > peak_avg:
            peak_avg = avg
            peak_hour = hour

    weekday_avg = weekday_sum / weekday_hours if weekday_hours else 0.0
    weekend_avg = weekend_sum / weekend_hours if weekend_hours else 0.0

    return {
        "total_consumption_kwh": total_consumption,
        "avg_consumption_kwh_per_hour": avg_per_hour,
        "avg_consumption_kwh_per_day": avg_per_day,
        "peak_hour": peak_hour,
        "weekday_avg_kwh_per_hour": weekday_avg,
        "weekend_avg_kwh_per_hour": weekend_avg,
    }


def _stat_start_to_datetime(start_value):
    if isinstance(start_value, (int, float)):
        return dt_util.utc_from_timestamp(start_value)

    if isinstance(start_value, str):
        parsed = dt_util.parse_datetime(start_value)
        if parsed is None:
            raise ValueError(f"Invalid datetime value: {start_value}")
        start_value = parsed

    if start_value.tzinfo is None:
        # Recorder can return naive UTC datetimes. Interpreting them as local
        # shifts all buckets by one hour.
        start_value = start_value.replace(tzinfo=dt_util.UTC)

    return dt_util.as_utc(start_value)


def _parse_date_param(value: str | None, is_end: bool) -> datetime | None:
    if not value:
        return None

    tz = dt_util.get_default_time_zone()
    try:
        if len(value) == 10:
            parsed_date = date.fromisoformat(value)
            parsed_dt = datetime.combine(parsed_date, time.min, tzinfo=tz)
            if is_end:
                parsed_dt += timedelta(days=1)
            return dt_util.as_utc(parsed_dt)

        parsed_dt = dt_util.parse_datetime(value)
        if parsed_dt is None:
            return None
        if parsed_dt.tzinfo is None:
            parsed_dt = parsed_dt.replace(tzinfo=tz)
        return dt_util.as_utc(parsed_dt)
    except Exception:
        return None


def _resolve_date_range(start_value: str | None, end_value: str | None, default_start, default_end):
    start_time = _parse_date_param(start_value, False) if start_value else default_start
    end_time = _parse_date_param(end_value, True) if end_value else default_end
    return start_time, end_time


def _statistics_from_rows(
    rows: list,
    unit_factor: float = 1.0,
    min_start: datetime | None = None,
    prefer_state: bool = False,
) -> list:
    rows_sorted = sorted(rows, key=lambda row: row.get("start") or 0)
    statistics = []
    running_sum = 0.0
    previous_sum = None

    for row in rows_sorted:
        raw_start = row.get("start")
        if raw_start is None:
            continue

        start_dt = _stat_start_to_datetime(raw_start)
        raw_state = row.get("state")
        raw_sum = row.get("sum")

        if prefer_state and raw_state is not None:
            state_kwh = float(raw_state) * unit_factor
            if state_kwh < 0:
                continue

            if min_start and start_dt < min_start:
                continue

            running_sum += state_kwh
            statistics.append({"start": start_dt, "state": state_kwh, "sum": running_sum})
            continue

        if raw_sum is not None:
            sum_kwh = float(raw_sum) * unit_factor
            if previous_sum is None:
                previous_sum = sum_kwh
                continue

            delta = sum_kwh - previous_sum
            previous_sum = sum_kwh
            if delta < 0:
                continue

            if min_start and start_dt < min_start:
                continue

            running_sum += delta
            statistics.append({"start": start_dt, "state": delta, "sum": running_sum})
            continue

        if raw_state is None:
            continue

        state_kwh = float(raw_state) * unit_factor
        if state_kwh < 0:
            continue

        if min_start and start_dt < min_start:
            continue

        running_sum += state_kwh
        statistics.append({"start": start_dt, "state": state_kwh, "sum": running_sum})
        continue

    return statistics


async def _build_analysis_response(
    hass,
    statistics: list,
    source: str,
    statistic_id: str,
    filename: str,
    csv_available: bool,
    sensor_available: bool,
    inputs_are_net: bool,
    upload_date_iso: str,
    available_start: str | None = None,
    available_end: str | None = None,
    sensor_entity_id: str | None = None,
) -> dict:
    start_iso = statistics[0]["start"].isoformat()
    end_iso = statistics[-1]["start"].isoformat()
    avg_consumption = sum(item["state"] for item in statistics) / len(statistics)

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
    price_heatmap = build_price_heatmap(price_series)
    consumption_heatmap = _build_consumption_heatmap(statistics)
    seasonal_heatmaps = _build_seasonal_heatmaps(statistics, price_series)
    summary = _calculate_summary(statistics)

    tariff_analysis = analyze_tariffs(
        statistics,
        price_series,
        pricing_config,
        inputs_are_net,
    )
    break_even_fixed = tariff_analysis.get("break_even_fixed_ct_kwh")
    spot_cheaper_share = tariff_analysis.get("spot_cheaper_share")
    monthly_tariff_comparison = tariff_analysis.get("monthly_tariff_comparison")

    range_start = available_start or start_iso
    range_end = available_end or end_iso

    response_data = {
        "source": source,
        "csv_available": csv_available,
        "sensor_available": sensor_available,
        "success": True,
        "count": len(statistics),
        "statistic_id": statistic_id,
        "start": start_iso,
        "end": end_iso,
        "available_start": range_start,
        "available_end": range_end,
        "avg_consumption_kwh": avg_consumption,
        "total_consumption_kwh": summary["total_consumption_kwh"],
        "avg_consumption_kwh_per_hour": summary["avg_consumption_kwh_per_hour"],
        "avg_consumption_kwh_per_day": summary["avg_consumption_kwh_per_day"],
        "peak_hour": summary["peak_hour"],
        "weekday_avg_kwh_per_hour": summary["weekday_avg_kwh_per_hour"],
        "weekend_avg_kwh_per_hour": summary["weekend_avg_kwh_per_hour"],
        "avg_price_ct_kwh": price_result.get("average_price"),
        "break_even_fixed_ct_kwh": break_even_fixed,
        "spot_cheaper_share": spot_cheaper_share,
        "price_imported_count": price_result.get("imported_count"),
        "price_series_count": price_result.get("series_count"),
        "consumption_heatmap": consumption_heatmap,
        "price_heatmap": price_heatmap,
        "seasonal_heatmaps": seasonal_heatmaps,
        "matched_hours": tariff_analysis["matched_hours"],
        "duration_months": tariff_analysis["duration_months"],
        "matched_consumption": tariff_analysis["matched_consumption"],
        "base_spot_cost_eur": tariff_analysis["base_spot_cost_cents"] / 100.0,
        "monthly_tariff_comparison": monthly_tariff_comparison,
        "tariff_totals": {
            "fixed_cost_eur": tariff_analysis["fixed_total_eur"],
            "spot_cost_eur": tariff_analysis["spot_total_eur"],
            "delta_eur": tariff_analysis["delta_total_eur"],
            "savings_eur": tariff_analysis["total_savings_eur"],
            "extra_cost_eur": tariff_analysis["total_extra_cost_eur"],
        },
        "tariff_monthly": tariff_analysis["monthly"],
        "tariff_debug_version": "v1",
        "fixed_price_ct": pricing_config.fixed_price,
        "fixed_base_fee_eur": pricing_config.fixed_base_fee,
        "spot_markup_ct": pricing_config.spot_markup,
        "spot_base_fee_eur": pricing_config.spot_base_fee,
        "tax_rate": pricing_config.tax_rate,
        "inputs_are_net": inputs_are_net,
        "filename": filename,
        "upload_date": upload_date_iso,
    }

    if sensor_entity_id:
        response_data["sensor_entity_id"] = sensor_entity_id

    return response_data


class SmartEnergyInsightsSensorView(HomeAssistantView):
    url = SENSOR_API_ENDPOINT
    name = "api:smart_energy_insights:sensor"
    requires_auth = True

    async def post(self, request: Request) -> Response:
        hass = request.app["hass"]
        if not hass.config_entries.async_entries(DOMAIN):
            return Response(status=404, text="{}", content_type="application/json")

        try:
            payload = await request.json()
        except Exception:
            return await _error_response(hass, "api.error.internal_server", status=500)

        entity_id = payload.get("entity_id")
        if not entity_id:
            return await _error_response(hass, "api.error.sensor_required")

        state = hass.states.get(entity_id)
        if not state:
            return await _error_response(hass, "api.error.invalid_sensor")

        attrs = state.attributes or {}
        if attrs.get("device_class") != "energy" or attrs.get("state_class") != "total_increasing":
            return await _error_response(hass, "api.error.invalid_sensor")

        unit = attrs.get("unit_of_measurement") or "kWh"
        if unit not in {"kWh", "Wh"}:
            return await _error_response(hass, "api.error.invalid_sensor")

        unit_factor = 1.0 if unit == "kWh" else 1.0 / 1000.0

        range_start = payload.get("start")
        range_end = payload.get("end")

        end_time = dt_util.now()
        start_time = end_time - timedelta(days=365)

        if range_start or range_end:
            range_start_time, range_end_time = _resolve_date_range(
                range_start,
                range_end,
                None,
                None,
            )
            if not range_start_time or not range_end_time or range_start_time >= range_end_time:
                return await _error_response(hass, "api.error.invalid_date_range")
            start_time = range_start_time
            end_time = range_end_time

        fetch_start = start_time - timedelta(hours=1)
        stats = await async_get_statistics_during_period(
            hass,
            fetch_start,
            end_time,
            {entity_id},
            period="hour",
            types={"sum", "state"},
            units=None,
        )

        rows = stats.get(entity_id, [])
        if not rows:
            return await _error_response(hass, "api.error.no_sensor_data")

        statistics = _statistics_from_rows(rows, unit_factor=unit_factor, min_start=start_time)

        if not statistics:
            return await _error_response(hass, "api.error.no_sensor_data")

        inputs_are_net = get_inputs_are_net(hass)
        upload_date_iso = dt_util.now().isoformat()
        sensor_name = attrs.get("friendly_name") or entity_id

        cached = await async_load_cache(hass)
        cached_sensor = cached.get("sensor_data") if cached else None
        available_start = None
        available_end = None
        if cached_sensor:
            available_start = cached_sensor.get("available_start") or cached_sensor.get("start")
            available_end = cached_sensor.get("available_end") or cached_sensor.get("end")
        if not available_start or not available_end:
            available_start = statistics[0]["start"].isoformat()
            available_end = statistics[-1]["start"].isoformat()
        response_data = await _build_analysis_response(
            hass,
            statistics,
            "sensor",
            entity_id,
            sensor_name,
            bool(cached.get("csv_data")),
            True,
            inputs_are_net,
            upload_date_iso,
            available_start=available_start,
            available_end=available_end,
            sensor_entity_id=entity_id,
        )

        if not (range_start or range_end):
            await async_update_cache(
                hass,
                {
                    "sensor_data": response_data,
                    "active_source": "sensor",
                    "sensor_entity_id": entity_id,
                },
            )

        return Response(status=200, text=json.dumps(response_data), content_type="application/json")