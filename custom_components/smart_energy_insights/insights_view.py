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
    CONSUMPTION_SOURCE_ANALYSIS_API_ENDPOINT,
    CONSUMPTION_SOURCES_API_ENDPOINT,
    DEVICE_ANALYSIS_API_ENDPOINT,
    DEVICES_API_ENDPOINT,
    DOMAIN,
    MAX_UPLOAD_FILE_SIZE_MB,
    SENSOR_API_ENDPOINT,
    UPLOAD_API_ENDPOINT,
)
from .repositories.cache_repository import async_load_cache, async_update_cache
from .repositories.consumption_sources_repository import (
    async_load_sources,
    async_save_sources,
)
from .repositories.csv_repository import parse_and_validate_csv
from .repositories.device_repository import async_load_devices, async_save_devices
from .repositories.statistics_repository import async_add_external_stats
from .repositories.statistics_repository import async_get_statistics_during_period
from .services.pricing_service import (
    build_price_heatmap,
    build_retail_price_heatmap,
    get_pricing_config,
)
from .services.spot_price_service import async_import_spot_prices_for_range
from .services.consumption_metrics_service import analyze_variable_consumption
from .services.tariff_analysis_service import analyze_tariffs, compute_price_exposure
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

                cached_coverage = csv_data.get("daily_coverage")
                query_start = default_start if not cached_coverage else start_time
                query_end = default_end if not cached_coverage else end_time
                fetch_start = query_start - timedelta(hours=1)
                stats = await async_get_statistics_during_period(
                    hass,
                    fetch_start,
                    query_end,
                    {stat_id},
                    period="hour",
                    types={"sum", "state"},
                    units=None,
                )
                rows = stats.get(stat_id, [])
                queried_statistics = _statistics_from_rows(
                    rows, min_start=query_start, prefer_state=True
                )
                statistics = [
                    point
                    for point in queried_statistics
                    if start_time <= point["start"] < end_time
                ]
                if not statistics:
                    return await _error_response(hass, "api.error.no_data_in_range")

                daily_coverage = cached_coverage or _build_daily_coverage(queried_statistics)
                if not cached_coverage:
                    await async_update_cache(
                        hass,
                        {"csv_data": {**csv_data, "daily_coverage": daily_coverage}},
                    )

                available_start = csv_data.get("available_start") or csv_data.get("start")
                available_end = csv_data.get("available_end") or csv_data.get("end")
                response_data = await _build_analysis_response(
                    hass,
                    statistics,
                    statistics,
                    "csv",
                    stat_id,
                    csv_data.get("filename") or "",
                    csv_available,
                    sensor_available,
                    csv_data.get("upload_date") or dt_util.now().isoformat(),
                    available_start=available_start,
                    available_end=available_end,
                    analysis_start=start_time,
                    analysis_end=end_time,
                    daily_coverage=daily_coverage,
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

            # NEU: Zeitstempel des Uploads sichern
            upload_date_iso = dt_util.now().isoformat()

            cached = await async_load_cache(hass)
            response_data = await _build_analysis_response(
                hass,
                statistics,
                statistics,
                "csv",
                stat_id,
                filename,
                True,
                bool(cached.get("sensor_data")),
                upload_date_iso,
                available_start=statistics[0]["start"].isoformat(),
                available_end=statistics[-1]["start"].isoformat(),
                analysis_start=statistics[0]["start"],
                analysis_end=statistics[-1]["start"] + timedelta(hours=1),
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
        # 'start' is the interval-begin hour (see csv_repository ingestion),
        # so the interval covers [start, start+1h); attribute it to 'start'.
        bucket_dt = dt_util.as_local(start)
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
                if dt_util.as_local(stat["start"]).month in months
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


def _derive_consumption_metrics(statistics: list) -> dict:
    if not statistics:
        return {
            "max_peak_kwh": None,
            "max_peak_at": None,
        }

    values = [float(item.get("state", 0.0) or 0.0) for item in statistics]
    peak_index = max(range(len(values)), key=values.__getitem__)
    peak_start = statistics[peak_index].get("start")

    return {
        "max_peak_kwh": values[peak_index],
        "max_peak_at": peak_start.isoformat() if peak_start else None,
    }


def _derive_price_metrics(price_series: list) -> dict:
    if not price_series:
        return {
            "avg_daily_price_spread_ct_kwh": None,
            "spot_price_stddev_ct_kwh": None,
        }

    prices = [float(point.get("value", 0.0) or 0.0) for point in price_series]
    if not prices:
        return {
            "avg_daily_price_spread_ct_kwh": None,
            "spot_price_stddev_ct_kwh": None,
        }

    mean = sum(prices) / len(prices)
    variance = sum((value - mean) ** 2 for value in prices) / len(prices)
    stddev = variance ** 0.5

    by_day: dict[date, list[float]] = {}
    for point in price_series:
        start = point.get("start")
        if not start:
            continue
        day = dt_util.as_local(start).date()
        by_day.setdefault(day, []).append(float(point.get("value", 0.0) or 0.0))

    spreads = []
    for day_values in by_day.values():
        if day_values:
            spreads.append(max(day_values) - min(day_values))

    avg_daily_spread = (sum(spreads) / len(spreads)) if spreads else None

    return {
        "avg_daily_price_spread_ct_kwh": avg_daily_spread,
        "spot_price_stddev_ct_kwh": stddev,
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


def _get_energy_sensor(hass, entity_id: str):
    """Return a compatible energy sensor and its kWh conversion factor."""
    state = hass.states.get(entity_id)
    if not state:
        return None

    attrs = state.attributes or {}
    if attrs.get("device_class") != "energy":
        return None
    if attrs.get("state_class") not in {"total", "total_increasing"}:
        return None

    unit = attrs.get("unit_of_measurement") or "kWh"
    if unit not in {"kWh", "Wh"}:
        return None

    return state, 1.0 if unit == "kWh" else 1.0 / 1000.0


def _get_active_profile_range(cached: dict) -> tuple[datetime | None, datetime | None]:
    """Resolve the inclusive hourly range of the active main profile."""
    active_source = cached.get("active_source")
    profile = cached.get(f"{active_source}_data") if active_source in {"csv", "sensor"} else None
    if not profile:
        return None, None

    start = dt_util.parse_datetime(profile.get("available_start") or profile.get("start"))
    end = dt_util.parse_datetime(profile.get("available_end") or profile.get("end"))
    if not start or not end:
        return None, None
    return dt_util.as_utc(start), dt_util.as_utc(end) + timedelta(hours=1)


def _build_daily_coverage(statistics: list) -> dict[str, dict]:
    """Return measured and expected hourly slots for each local calendar day."""
    starts_by_date: dict[date, set[datetime]] = {}
    for stat in statistics or []:
        start = stat.get("start")
        if start is None:
            continue
        start_utc = _stat_start_to_datetime(start)
        local_date = dt_util.as_local(start_utc).date()
        starts_by_date.setdefault(local_date, set()).add(start_utc)

    timezone = dt_util.get_default_time_zone()
    coverage = {}
    for local_date in sorted(starts_by_date):
        next_date = local_date + timedelta(days=1)
        day_start = dt_util.as_utc(datetime.combine(local_date, time.min, tzinfo=timezone))
        day_end = dt_util.as_utc(datetime.combine(next_date, time.min, tzinfo=timezone))
        expected_hours = int((day_end - day_start).total_seconds() // 3600)
        available_hours = len(starts_by_date[local_date])
        coverage[local_date.isoformat()] = {
            "available_hours": available_hours,
            "expected_hours": expected_hours,
            "status": "complete" if available_hours >= expected_hours else "partial",
        }
    return coverage


def _device_analysis_response(
    entity_id: str,
    name: str,
    statistics: list,
    requested_start: datetime,
    requested_end: datetime,
) -> dict:
    """Build the device-only heatmap response."""
    expected_hours = max(1, int((requested_end - requested_start).total_seconds() // 3600))
    seasonal = _build_seasonal_heatmaps(statistics, [])
    seasonal_consumption = {}
    for season, values in seasonal.items():
        months = HEATMAP_SEASONS[season]
        matched_hours = len(statistics) if months is None else sum(
            1
            for stat in statistics
            if dt_util.as_local(stat["start"]).month in months
        )
        seasonal_consumption[season] = {
            "consumption_heatmap": values["consumption_heatmap"],
            "matched_hours": matched_hours,
        }
    return {
        "success": True,
        "entity_id": entity_id,
        "name": name,
        "available_start": statistics[0]["start"].isoformat(),
        "available_end": statistics[-1]["start"].isoformat(),
        "analysis_start": requested_start.isoformat(),
        "analysis_end": requested_end.isoformat(),
        "matched_hours": len(statistics),
        "data_completeness_ratio": min(1.0, len(statistics) / expected_hours),
        "consumption_heatmap": _build_consumption_heatmap(statistics),
        "seasonal_heatmaps": seasonal_consumption,
    }


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


def _merge_hourly_statistics(statistics_lists: list[list[dict]]) -> list[dict]:
    """Sum multiple per-hour statistics series into a single series.

    Used to combine several consumption sources ("Bezugsquellen", e.g. a
    second smart meter, PV self-consumption, battery discharge) into one
    household total. The result covers the *union* of hours present in any
    input series; a source with no data point for a given hour is treated as
    having contributed 0 for that hour (not as a gap), matching how a
    household would interpret "no data from this source" as "no consumption
    from this source" at that time. The cumulative `sum` field is
    recomputed chronologically over the merged series.
    """
    totals: dict[datetime, float] = {}
    for statistics in statistics_lists:
        for stat in statistics or []:
            start = stat.get("start")
            if start is None:
                continue
            totals[start] = totals.get(start, 0.0) + float(stat.get("state", 0.0) or 0.0)

    merged = []
    running_sum = 0.0
    for start in sorted(totals):
        state = totals[start]
        running_sum += state
        merged.append({"start": start, "state": state, "sum": running_sum})

    return merged


async def _build_analysis_response(
    hass,
    consumption_statistics: list,
    cost_statistics: list,
    source: str,
    statistic_id: str,
    filename: str,
    csv_available: bool,
    sensor_available: bool,
    upload_date_iso: str,
    available_start: str | None = None,
    available_end: str | None = None,
    sensor_entity_ids: list[str] | None = None,
    analysis_start: datetime | None = None,
    analysis_end: datetime | None = None,
    daily_coverage: dict[str, dict] | None = None,
) -> dict:
    """Build the analysis response.

    `consumption_statistics` is the household's total consumption
    ("Gesamtbezug": every configured consumption source, cost-relevant or
    not) and drives usage/timing figures (heatmaps, summary, general
    consumption metrics). `cost_statistics` is the subset of consumption that
    is actually billed (only cost-relevant sources) and is the only series
    fed into `analyze_tariffs`, so non-cost-relevant sources (e.g. PV,
    battery) never influence tariff/cost calculations. For CSV uploads (and
    any other single-series caller), both arguments are the same list.
    """
    start_iso = consumption_statistics[0]["start"].isoformat()
    end_iso = consumption_statistics[-1]["start"].isoformat()
    resolved_analysis_start = analysis_start or consumption_statistics[0]["start"]
    resolved_analysis_end = analysis_end or (consumption_statistics[-1]["start"] + timedelta(hours=1))
    resolved_daily_coverage = daily_coverage or _build_daily_coverage(consumption_statistics)
    avg_consumption = sum(item["state"] for item in consumption_statistics) / len(consumption_statistics)

    price_result = {"imported_count": 0, "average_price": None, "series_count": 0}
    try:
        price_end = consumption_statistics[-1]["start"] + timedelta(hours=1)
        price_result = await async_import_spot_prices_for_range(
            hass, consumption_statistics[0]["start"], price_end, missing_only=True
        )
    except Exception as err:
        _LOGGER.warning("Spot price import failed: %s", err, exc_info=True)

    price_series = price_result.get("series", [])
    pricing_config = get_pricing_config(hass)
    price_heatmap = build_price_heatmap(price_series)
    retail_price_heatmap = build_retail_price_heatmap(
        price_heatmap, pricing_config.tax_rate, pricing_config.spot_markup
    )
    consumption_heatmap = _build_consumption_heatmap(consumption_statistics)
    seasonal_heatmaps = _build_seasonal_heatmaps(consumption_statistics, price_series)
    for season_data in seasonal_heatmaps.values():
        season_data["retail_price_heatmap"] = build_retail_price_heatmap(
            season_data["price_heatmap"], pricing_config.tax_rate, pricing_config.spot_markup
        )
    summary = _calculate_summary(consumption_statistics)
    consumption_metrics = _derive_consumption_metrics(consumption_statistics)
    variable_consumption = analyze_variable_consumption(
        consumption_statistics,
        cost_statistics,
    )
    price_metrics = _derive_price_metrics(price_series)
    total_price_exposure = compute_price_exposure(consumption_statistics, price_series)

    tariff_analysis = analyze_tariffs(
        cost_statistics,
        price_series,
        pricing_config,
        range_start=resolved_analysis_start,
        range_end=resolved_analysis_end,
        grid_shiftable_by_start=(
            variable_consumption["grid_shiftable_by_start"]
            if variable_consumption["base_load_status"] == "available"
            else None
        ),
    )
    break_even_fixed = tariff_analysis.get("break_even_fixed_ct_kwh")
    spot_cheaper_share = tariff_analysis.get("spot_cheaper_share")
    monthly_tariff_comparison = tariff_analysis.get("monthly_tariff_comparison")

    range_start = available_start or start_iso
    range_end = available_end or end_iso
    coverage_dates = sorted(resolved_daily_coverage)
    available_start_date = coverage_dates[0] if coverage_dates else dt_util.as_local(
        consumption_statistics[0]["start"]
    ).date().isoformat()
    available_end_date = coverage_dates[-1] if coverage_dates else dt_util.as_local(
        consumption_statistics[-1]["start"]
    ).date().isoformat()
    analysis_start_date = dt_util.as_local(resolved_analysis_start).date().isoformat()
    analysis_end_date = dt_util.as_local(
        resolved_analysis_end - timedelta(microseconds=1)
    ).date().isoformat()

    response_data = {
        "source": source,
        "csv_available": csv_available,
        "sensor_available": sensor_available,
        "success": True,
        "count": len(consumption_statistics),
        "statistic_id": statistic_id,
        "start": start_iso,
        "end": end_iso,
        "available_start": range_start,
        "available_end": range_end,
        "available_start_date": available_start_date,
        "available_end_date": available_end_date,
        "analysis_start": resolved_analysis_start.isoformat(),
        "analysis_end": resolved_analysis_end.isoformat(),
        "analysis_start_date": analysis_start_date,
        "analysis_end_date": analysis_end_date,
        "daily_coverage": resolved_daily_coverage,
        "avg_consumption_kwh": avg_consumption,
        "total_consumption_kwh": summary["total_consumption_kwh"],
        "avg_consumption_kwh_per_hour": summary["avg_consumption_kwh_per_hour"],
        "avg_consumption_kwh_per_day": summary["avg_consumption_kwh_per_day"],
        "peak_hour": summary["peak_hour"],
        "weekday_avg_kwh_per_hour": summary["weekday_avg_kwh_per_hour"],
        "weekend_avg_kwh_per_hour": summary["weekend_avg_kwh_per_hour"],
        "max_peak_kwh": consumption_metrics["max_peak_kwh"],
        "max_peak_at": consumption_metrics["max_peak_at"],
        "base_load_kwh_per_hour": variable_consumption["base_load_kwh_per_hour"],
        "base_load_method": variable_consumption["base_load_method"],
        "base_load_status": variable_consumption["base_load_status"],
        "base_load_valid_nights": variable_consumption["base_load_valid_nights"],
        "baseline_consumption_kwh": variable_consumption["baseline_consumption_kwh"],
        "variable_consumption_kwh": variable_consumption["variable_consumption_kwh"],
        "variable_consumption_percent": variable_consumption["variable_consumption_percent"],
        "grid_shiftable_upper_bound_kwh": variable_consumption["grid_shiftable_upper_bound_kwh"],
        "matched_grid_shiftable_upper_bound_kwh": tariff_analysis.get(
            "matched_grid_shiftable_upper_bound_kwh"
        ),
        "avg_price_ct_kwh": price_result.get("average_price"),
        "avg_daily_price_spread_ct_kwh": price_metrics["avg_daily_price_spread_ct_kwh"],
        "spot_price_stddev_ct_kwh": price_metrics["spot_price_stddev_ct_kwh"],
        "break_even_fixed_ct_kwh": break_even_fixed,
        "spot_cheaper_share": spot_cheaper_share,
        "data_completeness_ratio": tariff_analysis.get("data_completeness_ratio"),
        "effective_spot_price_ct_kwh": tariff_analysis.get("effective_spot_price_ct_kwh"),
        "price_sensitivity_percent": tariff_analysis.get("price_sensitivity_percent"),
        "negative_price_hours": tariff_analysis.get("negative_price_hours"),
        "negative_price_share": tariff_analysis.get("negative_price_share"),
        "max_spot_price_ct_kwh": tariff_analysis.get("max_spot_price_ct_kwh"),
        "min_spot_price_ct_kwh": tariff_analysis.get("min_spot_price_ct_kwh"),
        "max_spot_price_at": tariff_analysis.get("max_spot_price_at"),
        "min_spot_price_at": tariff_analysis.get("min_spot_price_at"),
        "max_extra_savings_eur": tariff_analysis.get("max_extra_savings_eur"),
        "max_penalty_risk_eur": tariff_analysis.get("max_penalty_risk_eur"),
        "peak_exposure_percent": tariff_analysis.get("peak_exposure_percent"),
        "off_peak_share_percent": tariff_analysis.get("off_peak_share_percent"),
        "total_peak_exposure_percent": total_price_exposure.get("peak_exposure_percent"),
        "total_off_peak_share_percent": total_price_exposure.get("off_peak_share_percent"),
        "price_imported_count": price_result.get("imported_count"),
        "price_series_count": price_result.get("series_count"),
        "consumption_heatmap": consumption_heatmap,
        "price_heatmap": price_heatmap,
        "retail_price_heatmap": retail_price_heatmap,
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
        "filename": filename,
        "upload_date": upload_date_iso,
    }

    if sensor_entity_ids:
        response_data["sensor_entity_ids"] = sensor_entity_ids

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

        sources = await async_load_sources(hass)
        if not sources:
            return await _error_response(hass, "api.error.no_consumption_sources")

        range_start = payload.get("start")
        range_end = payload.get("end")

        cached = await async_load_cache(hass)
        cached_sensor = cached.get("sensor_data") if cached else None

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

        query_start = start_time
        query_end = end_time
        cached_coverage = (cached_sensor or {}).get("daily_coverage")
        if (range_start or range_end) and cached_sensor and not cached_coverage:
            cached_start = dt_util.parse_datetime(
                cached_sensor.get("available_start") or cached_sensor.get("start")
            )
            cached_end = dt_util.parse_datetime(
                cached_sensor.get("available_end") or cached_sensor.get("end")
            )
            if cached_start and cached_end:
                query_start = dt_util.as_utc(cached_start)
                query_end = dt_util.as_utc(cached_end) + timedelta(hours=1)

        # Skip (and log) sources whose sensor is no longer a valid/available
        # energy sensor rather than failing the whole analysis - a household
        # may have removed or renamed a device without cleaning up the list.
        valid_sources = []
        for source in sources:
            sensor = _get_energy_sensor(hass, source["entity_id"])
            if not sensor:
                _LOGGER.warning(
                    "Consumption source %s is no longer a valid energy sensor; skipping",
                    source["entity_id"],
                )
                continue
            _, unit_factor = sensor
            valid_sources.append({**source, "unit_factor": unit_factor})

        if not valid_sources:
            return await _error_response(hass, "api.error.no_sensor_data")

        fetch_start = query_start - timedelta(hours=1)
        stats_by_id = await async_get_statistics_during_period(
            hass,
            fetch_start,
            query_end,
            {source["entity_id"] for source in valid_sources},
            period="hour",
            types={"sum", "state"},
            units=None,
        )

        # Two merged series: `total_series`/`total_statistics` is the
        # household's Gesamtbezug (every configured source); `cost_series`/
        # `cost_statistics` only includes sources flagged cost-relevant and
        # is the only one fed into tariff/cost calculations
        # (see _build_analysis_response).
        total_series = []
        cost_series = []
        for source in valid_sources:
            rows = stats_by_id.get(source["entity_id"], [])
            if not rows:
                continue
            source_statistics = _statistics_from_rows(
                rows, unit_factor=source["unit_factor"], min_start=query_start
            )
            if not source_statistics:
                continue
            total_series.append(source_statistics)
            if source["cost_relevant"]:
                cost_series.append(source_statistics)

        all_total_statistics = _merge_hourly_statistics(total_series)
        if not all_total_statistics:
            return await _error_response(hass, "api.error.no_sensor_data")

        all_cost_statistics = _merge_hourly_statistics(cost_series)
        total_statistics = [
            point for point in all_total_statistics if start_time <= point["start"] < end_time
        ]
        cost_statistics = [
            point for point in all_cost_statistics if start_time <= point["start"] < end_time
        ]
        if not total_statistics:
            return await _error_response(hass, "api.error.no_sensor_data")

        daily_coverage = cached_coverage or _build_daily_coverage(all_total_statistics)
        if cached_sensor and not cached_coverage:
            await async_update_cache(
                hass,
                {"sensor_data": {**cached_sensor, "daily_coverage": daily_coverage}},
            )

        upload_date_iso = dt_util.now().isoformat()
        sensor_entity_ids = [source["entity_id"] for source in valid_sources]
        display_name = ", ".join(source["name"] for source in valid_sources)

        available_start = None
        available_end = None
        if cached_sensor:
            available_start = cached_sensor.get("available_start") or cached_sensor.get("start")
            available_end = cached_sensor.get("available_end") or cached_sensor.get("end")
        if not available_start or not available_end:
            available_start = total_statistics[0]["start"].isoformat()
            available_end = total_statistics[-1]["start"].isoformat()
        response_data = await _build_analysis_response(
            hass,
            total_statistics,
            cost_statistics,
            "sensor",
            "|".join(sensor_entity_ids),
            display_name,
            bool(cached.get("csv_data")),
            True,
            upload_date_iso,
            available_start=available_start,
            available_end=available_end,
            sensor_entity_ids=sensor_entity_ids,
            analysis_start=start_time if range_start or range_end else total_statistics[0]["start"],
            analysis_end=end_time if range_start or range_end else total_statistics[-1]["start"] + timedelta(hours=1),
            daily_coverage=daily_coverage,
        )

        if not (range_start or range_end):
            await async_update_cache(
                hass,
                {
                    "sensor_data": response_data,
                    "active_source": "sensor",
                    "sensor_entity_ids": sensor_entity_ids,
                },
            )

        return Response(status=200, text=json.dumps(response_data), content_type="application/json")


class SmartEnergyInsightsDevicesView(HomeAssistantView):
    url = DEVICES_API_ENDPOINT
    name = "api:smart_energy_insights:devices"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        hass = request.app["hass"]
        devices = await async_load_devices(hass)
        return Response(
            status=200,
            text=json.dumps({"success": True, "devices": devices}),
            content_type="application/json",
        )

    async def put(self, request: Request) -> Response:
        hass = request.app["hass"]
        try:
            payload = await request.json()
        except Exception:
            return await _error_response(hass, "api.error.internal_server", status=400)

        devices = payload.get("devices")
        if not isinstance(devices, list):
            return await _error_response(hass, "api.error.invalid_devices")

        entity_ids = set()
        validated = []
        for device in devices:
            if not isinstance(device, dict):
                return await _error_response(hass, "api.error.invalid_devices")
            entity_id = str(device.get("entity_id") or "").strip()
            name = str(device.get("name") or "").strip()
            if not entity_id or not name:
                return await _error_response(hass, "api.error.device_name_required")
            if entity_id in entity_ids:
                return await _error_response(hass, "api.error.duplicate_device")
            if not _get_energy_sensor(hass, entity_id):
                return await _error_response(hass, "api.error.invalid_sensor")
            entity_ids.add(entity_id)
            validated.append({"entity_id": entity_id, "name": name})

        saved = await async_save_devices(hass, validated)
        return Response(
            status=200,
            text=json.dumps({"success": True, "devices": saved}),
            content_type="application/json",
        )


class SmartEnergyInsightsDeviceAnalysisView(HomeAssistantView):
    url = DEVICE_ANALYSIS_API_ENDPOINT
    name = "api:smart_energy_insights:device_analysis"
    requires_auth = True

    async def post(self, request: Request) -> Response:
        hass = request.app["hass"]
        try:
            payload = await request.json()
        except Exception:
            return await _error_response(hass, "api.error.internal_server", status=400)

        entity_id = str(payload.get("entity_id") or "").strip()
        devices = await async_load_devices(hass)
        device = next((item for item in devices if item["entity_id"] == entity_id), None)
        if not device:
            return await _error_response(hass, "api.error.device_not_configured", status=404)

        sensor = _get_energy_sensor(hass, entity_id)
        if not sensor:
            return await _error_response(hass, "api.error.invalid_sensor")
        _, unit_factor = sensor

        profile_start, profile_end = _get_active_profile_range(await async_load_cache(hass))
        if not profile_start or not profile_end:
            return await _error_response(hass, "api.error.no_active_profile")

        requested_start, requested_end = _resolve_date_range(
            payload.get("start"), payload.get("end"), profile_start, profile_end
        )
        start_time = max(profile_start, requested_start) if requested_start else profile_start
        end_time = min(profile_end, requested_end) if requested_end else profile_end
        if start_time >= end_time:
            return Response(
                status=409,
                text=json.dumps({"error": "No overlapping data range", "code": "no_overlap"}),
                content_type="application/json",
            )

        rows_by_id = await async_get_statistics_during_period(
            hass,
            start_time - timedelta(hours=1),
            end_time,
            {entity_id},
            period="hour",
            types={"sum", "state"},
            units=None,
        )
        statistics = _statistics_from_rows(
            rows_by_id.get(entity_id, []),
            unit_factor=unit_factor,
            min_start=start_time,
        )
        if not statistics:
            return Response(
                status=409,
                text=json.dumps({"error": "No overlapping data range", "code": "no_overlap"}),
                content_type="application/json",
            )

        response_data = _device_analysis_response(
            entity_id,
            device["name"],
            statistics,
            start_time,
            end_time,
        )
        return Response(status=200, text=json.dumps(response_data), content_type="application/json")


class SmartEnergyInsightsConsumptionSourcesView(HomeAssistantView):
    """GET/PUT persistence for consumption sources ("Bezugsquellen").

    Each entry additionally carries a `cost_relevant` flag: every configured
    source is summed into the household's total consumption ("Gesamtbezug"),
    but only `cost_relevant=true` sources are included in tariff/cost
    calculations (see `_merge_hourly_statistics` and
    `SmartEnergyInsightsSensorView`).
    """

    url = CONSUMPTION_SOURCES_API_ENDPOINT
    name = "api:smart_energy_insights:consumption_sources"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        hass = request.app["hass"]
        sources = await async_load_sources(hass)
        return Response(
            status=200,
            text=json.dumps({"success": True, "sources": sources}),
            content_type="application/json",
        )

    async def put(self, request: Request) -> Response:
        hass = request.app["hass"]
        try:
            payload = await request.json()
        except Exception:
            return await _error_response(hass, "api.error.internal_server", status=400)

        sources = payload.get("sources")
        if not isinstance(sources, list):
            return await _error_response(hass, "api.error.invalid_consumption_sources")

        entity_ids = set()
        validated = []
        for source in sources:
            if not isinstance(source, dict):
                return await _error_response(hass, "api.error.invalid_consumption_sources")
            entity_id = str(source.get("entity_id") or "").strip()
            name = str(source.get("name") or "").strip()
            if not entity_id or not name:
                return await _error_response(hass, "api.error.consumption_source_name_required")
            if entity_id in entity_ids:
                return await _error_response(hass, "api.error.duplicate_consumption_source")
            if not _get_energy_sensor(hass, entity_id):
                return await _error_response(hass, "api.error.invalid_sensor")
            entity_ids.add(entity_id)
            validated.append(
                {
                    "entity_id": entity_id,
                    "name": name,
                    "cost_relevant": bool(source.get("cost_relevant", False)),
                }
            )

        saved = await async_save_sources(hass, validated)
        return Response(
            status=200,
            text=json.dumps({"success": True, "sources": saved}),
            content_type="application/json",
        )


class SmartEnergyInsightsConsumptionSourceAnalysisView(HomeAssistantView):
    """Per-source heatmap view for an individual consumption source.

    Mirrors `SmartEnergyInsightsDeviceAnalysisView` but looks entities up in
    the consumption-sources list, so each Bezugsquelle can be inspected
    individually (e.g. via the Usage tab's consumption-profile picker)
    without affecting the combined Gesamtbezug/cost analysis.
    """

    url = CONSUMPTION_SOURCE_ANALYSIS_API_ENDPOINT
    name = "api:smart_energy_insights:consumption_source_analysis"
    requires_auth = True

    async def post(self, request: Request) -> Response:
        hass = request.app["hass"]
        try:
            payload = await request.json()
        except Exception:
            return await _error_response(hass, "api.error.internal_server", status=400)

        entity_id = str(payload.get("entity_id") or "").strip()
        sources = await async_load_sources(hass)
        source = next((item for item in sources if item["entity_id"] == entity_id), None)
        if not source:
            return await _error_response(hass, "api.error.consumption_source_not_configured", status=404)

        sensor = _get_energy_sensor(hass, entity_id)
        if not sensor:
            return await _error_response(hass, "api.error.invalid_sensor")
        _, unit_factor = sensor

        profile_start, profile_end = _get_active_profile_range(await async_load_cache(hass))
        if not profile_start or not profile_end:
            return await _error_response(hass, "api.error.no_active_profile")

        requested_start, requested_end = _resolve_date_range(
            payload.get("start"), payload.get("end"), profile_start, profile_end
        )
        start_time = max(profile_start, requested_start) if requested_start else profile_start
        end_time = min(profile_end, requested_end) if requested_end else profile_end
        if start_time >= end_time:
            return Response(
                status=409,
                text=json.dumps({"error": "No overlapping data range", "code": "no_overlap"}),
                content_type="application/json",
            )

        rows_by_id = await async_get_statistics_during_period(
            hass,
            start_time - timedelta(hours=1),
            end_time,
            {entity_id},
            period="hour",
            types={"sum", "state"},
            units=None,
        )
        statistics = _statistics_from_rows(
            rows_by_id.get(entity_id, []),
            unit_factor=unit_factor,
            min_start=start_time,
        )
        if not statistics:
            return Response(
                status=409,
                text=json.dumps({"error": "No overlapping data range", "code": "no_overlap"}),
                content_type="application/json",
            )

        response_data = _device_analysis_response(
            entity_id,
            source["name"],
            statistics,
            start_time,
            end_time,
        )
        return Response(status=200, text=json.dumps(response_data), content_type="application/json")