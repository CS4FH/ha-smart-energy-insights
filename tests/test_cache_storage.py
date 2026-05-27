from __future__ import annotations

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from homeassistant.core import HomeAssistant

from custom_components.smart_energy_insights.repositories.cache_repository import ( #todo: refactor to utils
    async_clear_cache,
    async_load_cache,
    async_save_cache,
    async_update_cache,
)


@pytest.fixture
def mock_hass() -> MagicMock:
    """Provide a mock Home Assistant core instance."""
    return MagicMock(spec=HomeAssistant)


@pytest.fixture
def mock_store() -> Generator[MagicMock, None, None]:
    """Mock the Home Assistant Store class."""
    path = "custom_components.smart_energy_insights.repositories.cache_repository.Store"
    with patch(path) as mock_store_cls:
        store_instance = MagicMock()
        store_instance.async_load = AsyncMock()
        store_instance.async_save = AsyncMock()
        store_instance.async_remove = AsyncMock()
        mock_store_cls.return_value = store_instance
        yield store_instance


@pytest.mark.asyncio
async def test_async_load_cache_empty(mock_hass: MagicMock, mock_store: MagicMock) -> None:
    """Verify that an empty dictionary is returned if store returns None."""
    mock_store.async_load.return_value = None

    result = await async_load_cache(mock_hass)

    assert result == {}
    mock_store.async_load.assert_called_once()


@pytest.mark.asyncio
async def test_async_load_cache_with_data(mock_hass: MagicMock, mock_store: MagicMock) -> None:
    """Verify that data is correctly loaded from storage."""
    mock_store.async_load.return_value = {"key": "value"}

    result = await async_load_cache(mock_hass)

    assert result == {"key": "value"}


@pytest.mark.asyncio
async def test_async_save_cache(mock_hass: MagicMock, mock_store: MagicMock) -> None:
    """Verify that data is correctly saved to storage."""
    test_data = {"foo": "bar"}
    
    await async_save_cache(mock_hass, test_data)

    mock_store.async_save.assert_called_once_with(test_data)


@pytest.mark.asyncio
async def test_async_update_cache(mock_hass: MagicMock, mock_store: MagicMock) -> None:
    """Verify that update correctly merges patches into existing cache data."""
    mock_store.async_load.return_value = {"existing": 1, "nested": {"a": 1}}
    patch_data = {"existing": 2, "new": 3}

    result = await async_update_cache(mock_hass, patch_data)

    expected_data = {"existing": 2, "nested": {"a": 1}, "new": 3}
    assert result == expected_data
    mock_store.async_save.assert_called_with(expected_data)


@pytest.mark.asyncio
async def test_async_clear_cache(mock_hass: MagicMock, mock_store: MagicMock) -> None:
    """Verify that the storage removal method is triggered."""
    await async_clear_cache(mock_hass)

    mock_store.async_remove.assert_called_once()