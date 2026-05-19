"""Setup and manage the Smart Energy Insights Lovelace panel."""

import logging

from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel
from homeassistant.components.lovelace import dashboard as lovelace_dashboard
from homeassistant.components.lovelace import resources as lovelace_resources
from homeassistant.components.lovelace.const import (
    CONF_ICON,
    CONF_MODE,
    CONF_REQUIRE_ADMIN,
    CONF_RESOURCE_TYPE_WS,
    CONF_SHOW_IN_SIDEBAR,
    CONF_TITLE,
    CONF_URL,
    CONF_URL_PATH,
    LOVELACE_DATA,
    MODE_STORAGE,
)
from homeassistant.const import EVENT_COMPONENT_LOADED
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    PANEL_TITLE,
    PANEL_ICON,
    PANEL_URL,
    PANEL_SETUP_KEY,
    CARD_RESOURCE_URL,
    CARD_TYPE,
    CARD_TITLE,
    DEFAULT_OBIS_CODE,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_panel(hass: HomeAssistant) -> bool:
    """Set up the Smart Energy Insights panel with resource and dashboard.
    
    This function:
    1. Ensures the custom card resource is registered in Lovelace storage
    2. Creates/updates a dedicated Lovelace dashboard with the upload card
    3. Registers the built-in panel in the sidebar
    
    Uses a guard to prevent duplicate setup when multiple config entries exist.
    """
    # Guard: only setup once per domain
    if hass.data[DOMAIN].get(PANEL_SETUP_KEY):
        _LOGGER.debug(
            "Panel for %s already setup, skipping duplicate registration", DOMAIN
        )
        return True

    try:
        # Step 1: Ensure Lovelace resource is registered
        await _ensure_card_resource(hass)

        # Step 2: Create/update dedicated dashboard
        await _ensure_dashboard_config(hass)

        # Step 3: Register built-in panel
        _register_panel(hass)

        # Mark setup as complete
        hass.data[DOMAIN][PANEL_SETUP_KEY] = True
        _LOGGER.info(
            "Successfully setup Smart Energy Insights panel at /%s", PANEL_URL
        )
        return True

    except Exception as err:
        _LOGGER.error("Failed to setup Smart Energy Insights panel: %s", err)
        return False


async def _ensure_card_resource(hass: HomeAssistant) -> None:
    """Ensure the custom card resource is registered in Lovelace storage."""
    try:
        lovelace_data = hass.data.get(LOVELACE_DATA)
        if not lovelace_data:
            _LOGGER.debug("Lovelace config not yet loaded, skipping resource setup")
            _schedule_resource_retry(hass)
            return

        resources = lovelace_data.resources
        if isinstance(resources, lovelace_resources.ResourceYAMLCollection):
            _LOGGER.warning(
                "Lovelace resources are in YAML mode; cannot auto-register %s",
                CARD_RESOURCE_URL,
            )
            return

        if isinstance(resources, lovelace_resources.ResourceStorageCollection):
            await resources.async_load()
            resource_exists = any(
                res.get(CONF_URL) == CARD_RESOURCE_URL
                for res in resources.async_items()
            )

            if not resource_exists:
                await resources.async_create_item(
                    {
                        CONF_RESOURCE_TYPE_WS: "module",
                        CONF_URL: CARD_RESOURCE_URL,
                    }
                )
                _LOGGER.debug(
                    "Registered custom card resource: %s", CARD_RESOURCE_URL
                )
            else:
                _LOGGER.debug("Custom card resource already registered")

    except Exception as err:
        _LOGGER.error("Failed to setup card resource: %s", err)
        raise


def _schedule_resource_retry(hass: HomeAssistant) -> None:
    """Retry resource registration once Lovelace is loaded."""
    listener_key = "lovelace_resource_listener"
    if hass.data[DOMAIN].get(listener_key):
        return

    def _on_component_loaded(event):
        if event.data.get("component") != "lovelace":
            return
        remove = hass.data[DOMAIN].pop(listener_key, None)
        if remove:
            remove()
        hass.async_create_task(_ensure_card_resource(hass))

    hass.data[DOMAIN][listener_key] = hass.bus.async_listen(
        EVENT_COMPONENT_LOADED,
        _on_component_loaded,
    )


async def _ensure_dashboard_config(hass: HomeAssistant) -> None:
    """Create/update a dedicated Lovelace dashboard with the upload card."""
    try:
        lovelace_data = hass.data.get(LOVELACE_DATA)
        if not lovelace_data:
            _LOGGER.debug("Lovelace data not yet loaded, skipping dashboard setup")
            return

        dashboards_collection = lovelace_dashboard.DashboardsCollection(hass)
        await dashboards_collection.async_load()

        existing = None
        for item in dashboards_collection.async_items():
            if item.get(CONF_URL_PATH) == PANEL_URL:
                existing = item
                break

        if not existing:
            existing = await dashboards_collection.async_create_item(
                {
                    CONF_URL_PATH: PANEL_URL,
                    CONF_TITLE: PANEL_TITLE,
                    CONF_ICON: PANEL_ICON,
                    CONF_SHOW_IN_SIDEBAR: True,
                    CONF_REQUIRE_ADMIN: False,
                    CONF_MODE: MODE_STORAGE,
                }
            )
            _LOGGER.debug("Created Lovelace dashboard entry for %s", PANEL_URL)

        if PANEL_URL in lovelace_data.dashboards:
            dashboard_config = lovelace_data.dashboards[PANEL_URL]
        else:
            dashboard_config = lovelace_dashboard.LovelaceStorage(hass, existing)
            lovelace_data.dashboards[PANEL_URL] = dashboard_config

        config = {
            "title": PANEL_TITLE,
            "views": [
                {
                    "title": PANEL_TITLE,
                    "path": PANEL_URL,
                    "panel": True,
                    "cards": [
                        {
                            "type": CARD_TYPE,
                            "title": CARD_TITLE,
                            "obis_code": DEFAULT_OBIS_CODE,
                        }
                    ],
                }
            ],
        }

        await dashboard_config.async_save(config)
        _LOGGER.debug(
            "Saved Smart Energy Insights dashboard config for %s",
            PANEL_URL,
        )

    except Exception as err:
        _LOGGER.error("Failed to setup dashboard config: %s", err)
        raise


def _register_panel(hass: HomeAssistant) -> None:
    """Register the built-in Lovelace panel in the sidebar."""
    try:
        async_register_built_in_panel(
            hass,
            "lovelace",
            frontend_url_path=PANEL_URL,
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            require_admin=False,
            config={"mode": MODE_STORAGE},
            update=True,
        )
        _LOGGER.debug("Registered built-in panel for Smart Energy Insights")
    except Exception as err:
        _LOGGER.error("Failed to register built-in panel: %s", err)
        raise


async def async_unload_panel(hass: HomeAssistant) -> bool:
    """Clean up the Smart Energy Insights panel.
    
    This function removes the built-in panel from the sidebar.
    The Lovelace resource and dashboard are left in place for potential reuse.
    """
    try:
        # Remove the panel from the sidebar
        await async_remove_panel(hass, PANEL_URL)
        _LOGGER.debug("Removed Smart Energy Insights panel from sidebar")

        # Reset setup guard so next entry can set it up again if needed
        if PANEL_SETUP_KEY in hass.data[DOMAIN]:
            del hass.data[DOMAIN][PANEL_SETUP_KEY]

        return True

    except Exception as err:
        _LOGGER.error("Error during panel unload: %s", err)
        return False
