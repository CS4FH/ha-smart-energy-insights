import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components.http import StaticPathConfig

from .const import DOMAIN
from .upload_view import SmartEnergyInsightsUploadView
from .panel import async_setup_panel, async_unload_panel

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[str] = ["sensor"]

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "cache": {
            "last_update": None,
        },
    }

    static_dir = Path(__file__).resolve().parent / "www"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path=f"/{DOMAIN}",
                path=str(static_dir),
                cache_headers=False,
            )
        ]
    )

    # Register HTTP view for CSV uploads
    hass.http.register_view(SmartEnergyInsightsUploadView())

    # Setup Smart Energy Insights Lovelace panel with auto-registered resource
    await async_setup_panel(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)

        # Unload panel if this is the last entry
        if not hass.data[DOMAIN]:
            await async_unload_panel(hass)

    return unload_ok