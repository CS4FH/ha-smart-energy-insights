"""Cache storage access for Smart Energy Insights."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from ..const import DOMAIN

STORAGE_KEY = f"{DOMAIN}_cache"
STORAGE_VERSION = 1


async def async_load_cache(hass: HomeAssistant) -> dict:
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    return await store.async_load() or {}


async def async_save_cache(hass: HomeAssistant, data: dict) -> None:
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    await store.async_save(data)


async def async_update_cache(hass: HomeAssistant, patch: dict) -> dict:
    data = await async_load_cache(hass)
    data.update(patch)
    await async_save_cache(hass, data)
    return data


async def async_clear_cache(hass: HomeAssistant) -> None:
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    await store.async_remove()
