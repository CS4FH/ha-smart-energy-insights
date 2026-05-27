from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from custom_components.smart_energy_insights.repositories.statistics_repository import (
    async_add_external_stats,
    async_get_statistics_during_period,
    async_import_stats,
)


@pytest.fixture
def mock_hass() -> MagicMock:
    """Provide a mock Home Assistant core instance."""
    return MagicMock()


@pytest.mark.asyncio
@patch("custom_components.smart_energy_insights.repositories.statistics_repository.async_add_external_statistics")
async def test_async_add_external_stats_sync_handling(mock_core_add: MagicMock, mock_hass: MagicMock) -> None:
    """Verify execution flow when underlying Home Assistant component returns synchronously."""
    mock_core_add.return_value = None  # Sync return
    
    await async_add_external_stats(mock_hass, {"meta": "data"}, [{"stat": 1}])
    
    mock_core_add.assert_called_once_with(mock_hass, {"meta": "data"}, [{"stat": 1}])


@pytest.mark.asyncio
@patch(
    "custom_components.smart_energy_insights.repositories.statistics_repository.async_add_external_statistics",
    new_callable=AsyncMock,
)
async def test_async_add_external_stats_async_handling(mock_core_add: AsyncMock, mock_hass: MagicMock) -> None:
    """Verify await execution when underlying Home Assistant component returns an awaitable coroutine."""
    await async_add_external_stats(mock_hass, {"meta": "data"}, [{"stat": 1}])

    mock_core_add.assert_called_once()
    mock_core_add.assert_awaited_once()


@pytest.mark.asyncio
@patch("custom_components.smart_energy_insights.repositories.statistics_repository.async_import_statistics")
async def test_async_import_stats_sync_handling(mock_core_import: MagicMock, mock_hass: MagicMock) -> None:
    """Verify synchronous execution compatibility fallback for stat importing."""
    mock_core_import.return_value = None
    
    await async_import_stats(mock_hass, {"meta": "data"}, [{"stat": 1}])
    
    mock_core_import.assert_called_once()


@pytest.mark.asyncio
@patch(
    "custom_components.smart_energy_insights.repositories.statistics_repository.async_import_statistics",
    new_callable=AsyncMock,
)
async def test_async_import_stats_async_handling(mock_core_import: AsyncMock, mock_hass: MagicMock) -> None:
    """Verify asynchronous resolution handling for stat importing."""
    await async_import_stats(mock_hass, {"meta": "data"}, [{"stat": 1}])

    mock_core_import.assert_called_once()
    mock_core_import.assert_awaited_once()


@pytest.mark.asyncio
@patch("custom_components.smart_energy_insights.repositories.statistics_repository.get_instance")
async def test_async_get_statistics_during_period(mock_get_instance: MagicMock, mock_hass: MagicMock) -> None:
    """Verify that query logic maps properly onto the Home Assistant executor database thread queue."""
    mock_recorder = MagicMock()
    mock_recorder.async_add_executor_job = AsyncMock(return_value={"sensor.test": []})
    mock_get_instance.return_value = mock_recorder

    result = await async_get_statistics_during_period(
        mock_hass, "2026-01-01", "2026-01-02", {"sensor.test"}
    )

    assert result == {"sensor.test": []}
    mock_recorder.async_add_executor_job.assert_called_once()