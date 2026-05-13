import logging
from datetime import timedelta
import inspect

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.components.recorder.statistics import (
    StatisticData,
    StatisticMetaData,
    async_import_statistics,
)
from homeassistant.components.recorder.models.statistics import StatisticMeanType
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from .const import SPOT_API_URL, DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([SpotPriceSensor(entry)])


def _safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _get_cache(hass, entry_id):
    return hass.data.setdefault(DOMAIN, {}).setdefault(entry_id, {})


async def _fetch_spot_prices(hass, start_time, end_time):
    start_ms = int(dt_util.as_utc(start_time).timestamp() * 1000)
    end_ms = int(dt_util.as_utc(end_time).timestamp() * 1000)

    params = {
        "start": start_ms,
        "end": end_ms,
    }

    session = async_get_clientsession(hass)
    async with session.get(SPOT_API_URL, params=params, timeout=30) as resp:
        payload = await resp.json()

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

    _LOGGER.info(
        "Importing %s price statistics for %s (%s -> %s)",
        len(stats),
        stat_id,
        stats[0].get("start") if isinstance(stats[0], dict) else stats[0].start,
        stats[-1].get("start") if isinstance(stats[-1], dict) else stats[-1].start,
    )
    result = async_import_statistics(hass, metadata, stats)
    if inspect.isawaitable(result):
        await result

    last_stat = stats[-1]
    return last_stat.start if hasattr(last_stat, "start") else last_stat.get("start")


class SpotPriceSensor(SensorEntity):
    def __init__(self, entry):
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_sei_spot_price"
        self._attr_name = "Spot Price"
        self._attr_native_unit_of_measurement = "ct/kWh"
        self._attr_state_class = SensorStateClass.MEASUREMENT
        self._attr_should_poll = True

    async def async_update(self):
        cache = _get_cache(self.hass, self._entry.entry_id)
        now = dt_util.utcnow()
        start_time = now - timedelta(days=365)

        series = await _fetch_spot_prices(self.hass, start_time, now)
        cache["last_written"] = await _write_price_statistics(
            self.hass,
            self.entity_id,
            series,
            cache.get("last_written"),
        )

        if series:
            self._attr_native_value = series[-1]["value"]
        else:
            self._attr_native_value = None
