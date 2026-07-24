"""Persistent configuration for monitored energy devices."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from ..const import DOMAIN

STORAGE_KEY = f"{DOMAIN}_devices"
STORAGE_VERSION = 1


def normalize_devices(devices: list[dict]) -> list[dict[str, str]]:
    """Normalize device configuration while preserving its order."""
    normalized = []
    seen_entity_ids = set()

    for device in devices:
        entity_id = str(device.get("entity_id") or "").strip()
        name = str(device.get("name") or "").strip()
        if not entity_id or not name or entity_id in seen_entity_ids:
            continue
        seen_entity_ids.add(entity_id)
        normalized.append({"entity_id": entity_id, "name": name})

    return normalized


async def async_load_devices(hass: HomeAssistant) -> list[dict[str, str]]:
    """Load monitored devices from storage."""
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load() or {}
    return normalize_devices(data.get("devices", []))


async def async_save_devices(
    hass: HomeAssistant,
    devices: list[dict],
) -> list[dict[str, str]]:
    """Normalize and persist monitored devices."""
    normalized = normalize_devices(devices)
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    await store.async_save({"devices": normalized})
    return normalized


async def async_clear_devices(hass: HomeAssistant) -> None:
    """Remove monitored device configuration."""
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    await store.async_remove()