"""Spot price import service."""

import logging

from homeassistant.components.recorder.models.statistics import StatisticMeanType
from homeassistant.components.recorder.statistics import StatisticData, StatisticMetaData
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from ..const import DOMAIN, SPOT_API_URL
from ..repositories.statistics_repository import (
    async_get_statistics_during_period,
    async_import_stats,
)

_LOGGER = logging.getLogger(__name__)


def _safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _average(values):
    if not values:
        return None
    return sum(values) / len(values)


async def _get_spot_price_statistic_id(hass):
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return None

    registry = er.async_get(hass)
    for entry in entries:
        unique_id = f"{entry.entry_id}_sei_spot_price"
        entity_id = registry.async_get_entity_id("sensor", DOMAIN, unique_id)
        if entity_id:
            return entity_id

    return None


async def _get_existing_price_series(hass, stat_id, start_time, end_time):
    stats = await async_get_statistics_during_period(
        hass,
        start_time,
        end_time,
        {stat_id},
        period="hour",
        units=None,
        types={"mean"},
    )

    series = []
    starts = set()
    for row in stats.get(stat_id, []):
        start = row.get("start")
        if start is None:
            continue
        if isinstance(start, (int, float)):
            start = dt_util.utc_from_timestamp(start)
        else:
            start = dt_util.as_utc(start)
        starts.add(start)
        value = _safe_float(row.get("mean"))
        if value is None:
            continue
        series.append({"start": start, "value": value})
    series.sort(key=lambda item: item["start"])
    return series, starts


async def _fetch_spot_prices(hass, start_time, end_time):
    start_ms = int(dt_util.as_utc(start_time).timestamp() * 1000)
    end_ms = int(dt_util.as_utc(end_time).timestamp() * 1000)

    params = {"start": start_ms, "end": end_ms}

    _LOGGER.debug(
        "Fetching spot prices from %s (start_ms=%s end_ms=%s)",
        SPOT_API_URL,
        start_ms,
        end_ms,
    )
    session = async_get_clientsession(hass)
    async with session.get(SPOT_API_URL, params=params, timeout=30) as resp:
        payload = await resp.json()

    _LOGGER.debug("Spot price API returned %s points", len(payload.get("data", [])))

    series = []
    for point in payload.get("data", []):
        start_ts = point.get("start_timestamp")
        if start_ts is None:
            continue
        price_eur_mwh = _safe_float(point.get("marketprice"))
        if price_eur_mwh is None:
            continue

        start_dt = dt_util.utc_from_timestamp(start_ts / 1000)
        price_ct_kwh = price_eur_mwh * 0.1
        series.append({"start": start_dt, "value": price_ct_kwh})

    series.sort(key=lambda item: item["start"])
    return series


async def _write_price_statistics(hass, stat_id, series, last_written):
    if not series:
        return last_written

    if not stat_id:
        _LOGGER.warning("Spot price entity_id not available for statistics import")
        return last_written

    metadata = StatisticMetaData(
        has_mean=True,
        has_sum=False,
        mean_type=StatisticMeanType.ARITHMETIC,
        name="Spot Price",
        # Internal statistics tied to a real entity_id must use source="recorder"
        # (HA rejects any other value here). This differs from the load-profile
        # import, which uses external statistics (statistic_id="domain:object_id")
        # and therefore sets source=<domain>. See R8 in refactoring-recommendations.md.
        source="recorder",
        statistic_id=stat_id,
        unit_class=None,
        unit_of_measurement="ct/kWh",
    )

    stats = []
    for point in series:
        start = point["start"]
        value = point["value"]
        if last_written and start <= last_written:
            continue
        stats.append(StatisticData(start=start, mean=value))

    if not stats:
        return last_written

    # Determine human-readable start/end for logging in a robust way
    try:
        first_start = stats[0].start if hasattr(stats[0], "start") else stats[0].get("start")
    except Exception:
        first_start = None

    try:
        last_start = stats[-1].start if hasattr(stats[-1], "start") else stats[-1].get("start")
    except Exception:
        last_start = None

    _LOGGER.info(
        "Importing %s price statistics for %s (%s -> %s)",
        len(stats),
        stat_id,
        first_start,
        last_start,
    )

    try:
        await async_import_stats(hass, metadata, stats)
    except Exception as err:
        _LOGGER.error("Failed to import spot price statistics: %s", err, exc_info=True)
        return last_written

    last_stat = stats[-1]
    if hasattr(last_stat, "start"):
        return last_stat.start
    if isinstance(last_stat, dict):
        return last_stat.get("start")
    # Fallback: try attribute access via getattr
    return getattr(last_stat, "start", last_written)


async def async_import_spot_prices_for_range(
    hass,
    start_time,
    end_time,
    missing_only=True,
):
    stat_id = await _get_spot_price_statistic_id(hass)
    if not stat_id:
        _LOGGER.warning("Spot price statistic_id not available")
        return {"imported_count": 0, "average_price": None, "series_count": 0}

    _LOGGER.debug("Spot price statistic_id resolved to %s", stat_id)

    fetched_series = await _fetch_spot_prices(hass, start_time, end_time)
    existing_series, existing_starts = await _get_existing_price_series(
        hass,
        stat_id,
        start_time,
        end_time,
    )

    _LOGGER.debug(
        "Spot price fetched_count=%s existing_count=%s",
        len(fetched_series),
        len(existing_series),
    )

    if existing_starts:
        series_to_write = [
            point
            for point in fetched_series
            if not missing_only or dt_util.as_utc(point["start"]) not in existing_starts
        ]
    else:
        series_to_write = fetched_series

    _LOGGER.debug(
        "Spot price series_to_write=%s missing_only=%s existing_starts=%s",
        len(series_to_write),
        missing_only,
        len(existing_starts),
    )

    await _write_price_statistics(hass, stat_id, series_to_write, None)

    merged_by_start = {point["start"]: point for point in existing_series}
    merged_by_start.update(
        {dt_util.as_utc(point["start"]): point for point in fetched_series}
    )
    series = [merged_by_start[start] for start in sorted(merged_by_start)]
    average_price = _average([point["value"] for point in series])

    return {
        "imported_count": len(series_to_write),
        "average_price": average_price,
        "series_count": len(series),
        "series": series,
    }
