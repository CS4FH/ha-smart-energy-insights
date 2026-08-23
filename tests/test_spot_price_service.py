from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from custom_components.smart_energy_insights.services.spot_price_service import (
    async_import_spot_prices_for_range,
)


@pytest.fixture
def mock_hass() -> MagicMock:
    """Provide a mock Home Assistant core instance with initialized sub-components."""
    hass = MagicMock()
    
    mock_entry = MagicMock()
    mock_entry.entry_id = "mock_entry_id"
    hass.config_entries.async_entries.return_value = [mock_entry]
    
    return hass


@pytest.fixture
def mock_entity_registry() -> MagicMock:
    """Mock the Home Assistant entity registry to return a fixed entity ID."""
    with patch("custom_components.smart_energy_insights.services.spot_price_service.er.async_get") as mock_get:
        registry = MagicMock()
        registry.async_get_entity_id.return_value = "sensor.mock_entry_id_sei_spot_price"
        mock_get.return_value = registry
        yield registry


@pytest.fixture
def mock_http_client() -> AsyncMock:
    """Mock aiohttp client session to simulate successful API responses."""
    with patch("custom_components.smart_energy_insights.services.spot_price_service.async_get_clientsession") as mock_session_get:
        session = MagicMock()
        response = AsyncMock()
        
        response.__aenter__.return_value = response
        session.get.return_value = response
        mock_session_get.return_value = session
        
        yield response


@pytest.fixture
def mock_repo() -> dict:
    """Mock the underlying database repository functions for recorder statistics."""
    path = "custom_components.smart_energy_insights.services.spot_price_service"
    with patch(f"{path}.async_get_statistics_during_period", new_callable=AsyncMock) as mock_get, \
         patch(f"{path}.async_import_stats", new_callable=AsyncMock) as mock_import:
        yield {"get": mock_get, "import": mock_import}


@pytest.mark.asyncio
async def test_import_successful_range(
    mock_hass: MagicMock,
    mock_entity_registry: MagicMock,
    mock_http_client: AsyncMock,
    mock_repo: dict,
) -> None:
    """Verify successful end-to-end processing and unit conversion of spot prices."""
    start_time = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    end_time = datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc)

    mock_http_client.json.return_value = {
        "data": [
            {"start_timestamp": 1767225600000, "marketprice": 50.0},
            {"start_timestamp": 1767229200000, "marketprice": 70.0},
        ]
    }
    
    mock_repo["get"].return_value = {}

    result = await async_import_spot_prices_for_range(
        mock_hass, start_time, end_time, missing_only=True
    )

    assert result["imported_count"] == 2
    assert result["average_price"] == 6.0
    assert result["series_count"] == 2

    mock_repo["import"].assert_called_once()
    
    # Verify metadata payload content (Home Assistant StatisticMetaData is a TypedDict at runtime)
    called_metadata = mock_repo["import"].call_args[0][1]
    assert called_metadata["statistic_id"] == "sensor.mock_entry_id_sei_spot_price"
    assert called_metadata["unit_of_measurement"] == "ct/kWh"

    # Verify statistics payload content (Home Assistant StatisticData is a TypedDict at runtime)
    called_stats = mock_repo["import"].call_args[0][2]
    assert len(called_stats) == 2
    assert called_stats[0]["mean"] == 5.0
    assert called_stats[1]["mean"] == 7.0


@pytest.mark.asyncio
async def test_import_skips_existing_records(
    mock_hass: MagicMock,
    mock_entity_registry: MagicMock,
    mock_http_client: AsyncMock,
    mock_repo: dict,
) -> None:
    """Verify that existing database records are tracked and duplicates are filtered out."""
    start_time = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    end_time = datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc)

    mock_http_client.json.return_value = {
        "data": [
            {"start_timestamp": 1767225600000, "marketprice": 50.0},
            {"start_timestamp": 1767229200000, "marketprice": 70.0},
        ]
    }

    stat_id = "sensor.mock_entry_id_sei_spot_price"
    mock_repo["get"].return_value = {
        stat_id: [{"start": 1767225600.0}] 
    }

    result = await async_import_spot_prices_for_range(
        mock_hass, start_time, end_time, missing_only=True
    )

    assert result["imported_count"] == 1
    assert result["series_count"] == 2
    
    # Access called data as dictionary keys due to TypedDict implementation
    called_stats = mock_repo["import"].call_args[0][2]
    assert len(called_stats) == 1
    assert called_stats[0]["mean"] == 7.0


@pytest.mark.asyncio
async def test_import_handles_empty_api_gracefully(
    mock_hass: MagicMock,
    mock_entity_registry: MagicMock,
    mock_http_client: AsyncMock,
    mock_repo: dict,
) -> None:
    """Verify that an empty response from the API does not trigger database writes or failures."""
    start_time = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    end_time = datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc)

    mock_http_client.json.return_value = {"data": []}
    mock_repo["get"].return_value = {}

    result = await async_import_spot_prices_for_range(
        mock_hass, start_time, end_time, missing_only=True
    )

    assert result["imported_count"] == 0
    assert result["average_price"] is None
    mock_repo["import"].assert_not_called()


@pytest.mark.asyncio
async def test_import_returns_recorder_history_when_api_range_is_partial(
    mock_hass: MagicMock,
    mock_entity_registry: MagicMock,
    mock_http_client: AsyncMock,
    mock_repo: dict,
) -> None:
    """Keep tariff analysis complete when the API omits already stored hours."""
    start_time = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
    end_time = datetime(2026, 5, 1, 3, 0, tzinfo=timezone.utc)
    stat_id = "sensor.mock_entry_id_sei_spot_price"

    mock_http_client.json.return_value = {
        "data": [
            {"start_timestamp": 1777597200000, "marketprice": 30.0},
        ]
    }
    mock_repo["get"].return_value = {
        stat_id: [
            {"start": 1777593600.0, "mean": 2.0},
            {"start": 1777597200.0, "mean": 3.0},
            {"start": 1777600800.0, "mean": 4.0},
        ]
    }

    result = await async_import_spot_prices_for_range(
        mock_hass, start_time, end_time, missing_only=True
    )

    assert result["imported_count"] == 0
    assert result["series_count"] == 3
    assert [point["value"] for point in result["series"]] == [2.0, 3.0, 4.0]
    assert result["average_price"] == 3.0
    mock_repo["import"].assert_not_called()
