import logging

from homeassistant.components.sensor import SensorEntity, SensorStateClass

from .const import DOMAIN
from .services.spot_price_service import async_import_spot_prices_for_range

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([SpotPriceSensor(entry)])


def _get_cache(hass, entry_id):
    return hass.data.setdefault(DOMAIN, {}).setdefault(entry_id, {})


class SpotPriceSensor(SensorEntity):
    """Handle entity used only to obtain a stable entity_id for statistics import.

    This entity intentionally never sets a live state (see async_update below).
    Spot prices are written directly as long-term statistics against this
    entity's entity_id (see services/spot_price_service.py); the entity itself
    is not meant to expose a "current price" reading and should not be added to
    dashboards expecting live/polled values. See R6 in
    docs/refactoring-recommendations.md.
    """

    def __init__(self, entry):
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_sei_spot_price"
        self._attr_name = "Spot Price (statistics only, no live state)"
        self._attr_native_unit_of_measurement = "ct/kWh"
        self._attr_state_class = SensorStateClass.MEASUREMENT
        self._attr_should_poll = False

    async def async_added_to_hass(self):
        cache = _get_cache(self.hass, self._entry.entry_id)
        cache["spot_price_stat_id"] = self.entity_id

    async def async_update(self):
        # No-op by design: this entity has no live state, only long-term
        # statistics written externally. See class docstring.
        return
