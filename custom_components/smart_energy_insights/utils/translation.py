"""Translation helpers for Smart Energy Insights."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.translation import async_get_translations

from ..const import DOMAIN


async def async_translate(
    hass: HomeAssistant,
    key: str,
    placeholders: dict | None = None,
    default: str | None = None,
) -> str:
    translations = await async_get_translations(hass, hass.config.language, DOMAIN)
    text = translations.get(key, default if default is not None else key)
    if placeholders:
        try:
            text = text.format(**placeholders)
        except Exception:
            pass
    return text
