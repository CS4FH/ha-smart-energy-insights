"""Recorder statistics access."""

import inspect

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import (
    async_add_external_statistics,
    async_import_statistics,
    statistics_during_period,
)


async def async_add_external_stats(hass, metadata, statistics) -> None:
    result = async_add_external_statistics(hass, metadata, statistics)
    if inspect.isawaitable(result):
        await result


async def async_import_stats(hass, metadata, stats) -> None:
    result = async_import_statistics(hass, metadata, stats)
    if inspect.isawaitable(result):
        await result


async def async_get_statistics_during_period(
    hass,
    start_time,
    end_time,
    statistic_ids,
    period="hour",
    types=None,
    units=None,
):
    def _query():
        return statistics_during_period(
            hass,
            start_time,
            end_time,
            statistic_ids,
            period=period,
            units=units,
            types=types,
        )

    instance = get_instance(hass)
    return await instance.async_add_executor_job(_query)
