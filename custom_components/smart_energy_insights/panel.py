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
from homeassistant.helpers.storage import Store
from homeassistant.util import slugify

from .const import (
    DOMAIN,
    PANEL_TITLE,
    PANEL_ICON,
    PANEL_URL,
    PANEL_SETUP_KEY,
    CARD_RESOURCE_URL,
    CARD_TYPE,
    CARD_TITLE,
)
from .utils.translation import async_translate

_LOGGER = logging.getLogger(__name__)
RESOURCE_LISTENER_KEY = "lovelace_resource_listener"
_LOVELACE_DASHBOARDS_KEY = "lovelace_dashboards"
_LOVELACE_RESOURCES_KEY = "lovelace_resources"
_CARD_RESOURCE_BASE = CARD_RESOURCE_URL.split("?", 1)[0]


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

        panel_title, card_title = await _get_panel_texts(hass)

        # Step 2: Create/update dedicated dashboard
        await _ensure_dashboard_config(hass, panel_title, card_title)

        # Step 3: Register built-in panel
        _register_panel(hass, panel_title)

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

            # Remove stale resource URLs with the same base path to avoid loading old bundles.
            for resource in list(resources.async_items()):
                url = resource.get(CONF_URL)
                if isinstance(url, str) and url.startswith(_CARD_RESOURCE_BASE) and url != CARD_RESOURCE_URL:
                    await resources.async_delete_item(resource["id"])
                    _LOGGER.debug("Removed stale custom card resource: %s", url)

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


async def _get_panel_texts(hass: HomeAssistant) -> tuple[str, str]:
    panel_title = await async_translate(
        hass,
        "panel.title",
        default=PANEL_TITLE,
    )
    card_title = await async_translate(
        hass,
        "panel.card_title",
        default=CARD_TITLE,
    )
    return panel_title, card_title


def _schedule_resource_retry(hass: HomeAssistant) -> None:
    """Retry resource registration once Lovelace is loaded."""
    if hass.data[DOMAIN].get(RESOURCE_LISTENER_KEY):
        return

    def _on_component_loaded(event):
        if event.data.get("component") != "lovelace":
            return
        remove = hass.data[DOMAIN].pop(RESOURCE_LISTENER_KEY, None)
        if remove:
            remove()
        hass.async_create_task(_ensure_card_resource(hass))

    hass.data[DOMAIN][RESOURCE_LISTENER_KEY] = hass.bus.async_listen(
        EVENT_COMPONENT_LOADED,
        _on_component_loaded,
    )


async def _remove_card_resource(hass: HomeAssistant) -> None:
    """Remove the custom card resource from Lovelace storage if present."""
    lovelace_data = hass.data.get(LOVELACE_DATA)
    if not lovelace_data:
        return

    resources = lovelace_data.resources
    if isinstance(resources, lovelace_resources.ResourceYAMLCollection):
        return

    if isinstance(resources, lovelace_resources.ResourceStorageCollection):
        await resources.async_load()
        for resource in list(resources.async_items()):
            url = resource.get(CONF_URL)
            if isinstance(url, str) and url.startswith(_CARD_RESOURCE_BASE):
                await resources.async_delete_item(resource["id"])
                _LOGGER.debug("Removed custom card resource: %s", url)


async def _remove_dashboard_config(hass: HomeAssistant) -> None:
    """Remove the dedicated Lovelace dashboard entry and config if present."""
    lovelace_data = hass.data.get(LOVELACE_DATA)
    if not lovelace_data:
        return

    dashboards_collection = lovelace_dashboard.DashboardsCollection(hass)
    await dashboards_collection.async_load()
    existing = next(
        (item for item in dashboards_collection.async_items() if item.get(CONF_URL_PATH) == PANEL_URL),
        None,
    )

    if existing:
        await dashboards_collection.async_delete_item(existing["id"])
        _LOGGER.debug("Removed Lovelace dashboard entry for %s", PANEL_URL)

    if PANEL_URL in lovelace_data.dashboards:
        lovelace_data.dashboards.pop(PANEL_URL, None)


async def _cleanup_lovelace_storage(hass: HomeAssistant) -> None:
    """Remove dashboard, config, and resource entries from Lovelace storage."""
    dashboard_id = slugify(PANEL_URL)

    dashboards_store = Store(hass, 1, _LOVELACE_DASHBOARDS_KEY)
    dashboards_data = await dashboards_store.async_load() or {}
    dashboards_items = dashboards_data.get("items", [])
    filtered_dashboards = [
        item
        for item in dashboards_items
        if item.get(CONF_URL_PATH) != PANEL_URL and item.get("id") != dashboard_id
    ]
    if len(filtered_dashboards) != len(dashboards_items):
        dashboards_data["items"] = filtered_dashboards
        await dashboards_store.async_save(dashboards_data)

    resources_store = Store(hass, 1, _LOVELACE_RESOURCES_KEY)
    resources_data = await resources_store.async_load() or {}
    resources_items = resources_data.get("items", [])
    filtered_resources = [
        item
        for item in resources_items
        if item.get(CONF_URL) != CARD_RESOURCE_URL
    ]
    if len(filtered_resources) != len(resources_items):
        resources_data["items"] = filtered_resources
        await resources_store.async_save(resources_data)

    config_store = Store(hass, 1, f"lovelace.{dashboard_id}")
    await config_store.async_remove()


async def _ensure_dashboard_config(
    hass: HomeAssistant,
    panel_title: str,
    card_title: str,
) -> None:
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
                    CONF_TITLE: panel_title,
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
            "title": panel_title,
            "views": [
                {
                    "title": panel_title,
                    "path": PANEL_URL,
                    "panel": True,
                    "cards": [
                        {
                            "type": CARD_TYPE,
                            "title": card_title,
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


def _register_panel(hass: HomeAssistant, panel_title: str) -> None:
    """Register the built-in Lovelace panel in the sidebar."""
    try:
        async_register_built_in_panel(
            hass,
            "lovelace",
            frontend_url_path=PANEL_URL,
            sidebar_title=panel_title,
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
    
    This function removes the built-in panel from the sidebar and cleans up
    associated Lovelace storage artifacts.
    """
    try:
        # Remove scheduled listener if still present
        remove = hass.data[DOMAIN].pop(RESOURCE_LISTENER_KEY, None)
        if remove:
            remove()

        # Remove the panel from the sidebar
        await async_remove_panel(hass, PANEL_URL)
        _LOGGER.debug("Removed Smart Energy Insights panel from sidebar")

        # Remove associated dashboard and resource
        await _remove_dashboard_config(hass)
        await _remove_card_resource(hass)
        await _cleanup_lovelace_storage(hass)

        # Reset setup guard so next entry can set it up again if needed
        if PANEL_SETUP_KEY in hass.data[DOMAIN]:
            del hass.data[DOMAIN][PANEL_SETUP_KEY]

        return True

    except Exception as err:
        _LOGGER.error("Error during panel unload: %s", err)
        return False


async def async_cleanup_panel_storage(hass: HomeAssistant) -> None:
    """Cleanup Lovelace storage artifacts for the panel."""
    await _cleanup_lovelace_storage(hass)
