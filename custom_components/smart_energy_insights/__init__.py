import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.db_schema import StatisticsMeta
from homeassistant.components.recorder.util import session_scope
from homeassistant.helpers import entity_registry as er
from homeassistant.util import slugify

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

    # Register HTTP view for CSV uploads
    hass.http.register_view(SmartEnergyInsightsUploadView())

    # Setup Smart Energy Insights Lovelace panel with auto-registered resource
    await async_setup_panel(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        registry = er.async_get(hass)
        unique_id = f"{entry.entry_id}_sei_spot_price"
        entity_id = registry.async_get_entity_id("sensor", DOMAIN, unique_id)
        stat_ids = [
            stat_id
            for stat_id in [
                entity_id,
                f"{DOMAIN}:{slugify(entry.entry_id)}_spot_price",
            ]
            if stat_id
        ]

        if stat_ids:
            instance = get_instance(hass)

            def _purge_statistics(instance, stat_ids):
                with session_scope(session=instance.get_session()) as session:
                    return (
                        session.query(StatisticsMeta)
                        .filter(StatisticsMeta.statistic_id.in_(stat_ids))
                        .delete(synchronize_session=False)
                    )

            deleted = await instance.async_add_executor_job(
                _purge_statistics,
                instance,
                stat_ids,
            )
            _LOGGER.info("Deleted %s statistics meta rows", deleted)

        hass.data[DOMAIN].pop(entry.entry_id)

        # Unload panel if this is the last entry
        if not hass.data[DOMAIN]:
            await async_unload_panel(hass)

    return unload_ok