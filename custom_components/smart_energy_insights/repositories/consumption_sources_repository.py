"""Persistent configuration for monitored consumption sources (Bezugsquellen).

A consumption source is an additional energy sensor (e.g. a second smart
meter, PV self-consumption, battery discharge to the home) whose readings are
summed together with all other configured sources to build the household's
total consumption ("Gesamtbezug"). Each source can independently be flagged
as cost-relevant; only cost-relevant sources are included in tariff/cost
calculations (see insights_view._merge_hourly_statistics and
services/tariff_analysis_service.py).
"""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from ..const import DOMAIN

STORAGE_KEY = f"{DOMAIN}_consumption_sources"
STORAGE_VERSION = 1


def normalize_sources(sources: list[dict]) -> list[dict[str, str | bool]]:
    """Normalize consumption source configuration while preserving its order."""
    normalized = []
    seen_entity_ids = set()

    for source in sources:
        entity_id = str(source.get("entity_id") or "").strip()
        name = str(source.get("name") or "").strip()
        if not entity_id or not name or entity_id in seen_entity_ids:
            continue
        seen_entity_ids.add(entity_id)
        cost_relevant = bool(source.get("cost_relevant", False))
        normalized.append(
            {"entity_id": entity_id, "name": name, "cost_relevant": cost_relevant}
        )

    return normalized


async def async_load_sources(hass: HomeAssistant) -> list[dict[str, str | bool]]:
    """Load monitored consumption sources from storage."""
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load() or {}
    return normalize_sources(data.get("sources", []))


async def async_save_sources(
    hass: HomeAssistant,
    sources: list[dict],
) -> list[dict[str, str | bool]]:
    """Normalize and persist monitored consumption sources."""
    normalized = normalize_sources(sources)
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    await store.async_save({"sources": normalized})
    return normalized


async def async_clear_sources(hass: HomeAssistant) -> None:
    """Remove monitored consumption source configuration."""
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    await store.async_remove()
