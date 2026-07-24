from __future__ import annotations

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.smart_energy_insights.repositories.device_repository import (
    async_clear_devices,
    async_load_devices,
    async_save_devices,
    normalize_devices,
)


@pytest.fixture
def mock_hass() -> MagicMock:
    return MagicMock(spec=HomeAssistant)


@pytest.fixture
def mock_store() -> Generator[MagicMock, None, None]:
    path = "custom_components.smart_energy_insights.repositories.device_repository.Store"
    with patch(path) as mock_store_cls:
        store_instance = MagicMock()
        store_instance.async_load = AsyncMock()
        store_instance.async_save = AsyncMock()
        store_instance.async_remove = AsyncMock()
        mock_store_cls.return_value = store_instance
        yield store_instance


def test_normalize_devices_preserves_order_and_removes_duplicates() -> None:
    devices = [
        {"entity_id": " sensor.washer ", "name": " Washer "},
        {"entity_id": "sensor.boiler", "name": "Boiler"},
        {"entity_id": "sensor.washer", "name": "Duplicate"},
        {"entity_id": "", "name": "Missing sensor"},
        {"entity_id": "sensor.unnamed", "name": "  "},
    ]

    assert normalize_devices(devices) == [
        {"entity_id": "sensor.washer", "name": "Washer"},
        {"entity_id": "sensor.boiler", "name": "Boiler"},
    ]


@pytest.mark.asyncio
async def test_async_load_devices_normalizes_stored_data(
    mock_hass: MagicMock,
    mock_store: MagicMock,
) -> None:
    mock_store.async_load.return_value = {
        "devices": [
            {"entity_id": "sensor.washer", "name": "Washer"},
            {"entity_id": "sensor.washer", "name": "Duplicate"},
        ]
    }

    result = await async_load_devices(mock_hass)

    assert result == [{"entity_id": "sensor.washer", "name": "Washer"}]


@pytest.mark.asyncio
async def test_async_save_devices_persists_normalized_data(
    mock_hass: MagicMock,
    mock_store: MagicMock,
) -> None:
    result = await async_save_devices(
        mock_hass,
        [{"entity_id": " sensor.washer ", "name": " Washer "}],
    )

    assert result == [{"entity_id": "sensor.washer", "name": "Washer"}]
    mock_store.async_save.assert_awaited_once_with({"devices": result})


@pytest.mark.asyncio
async def test_async_clear_devices(
    mock_hass: MagicMock,
    mock_store: MagicMock,
) -> None:
    await async_clear_devices(mock_hass)

    mock_store.async_remove.assert_awaited_once()