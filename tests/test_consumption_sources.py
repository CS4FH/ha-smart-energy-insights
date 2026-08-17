from __future__ import annotations

from collections.abc import Generator
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.smart_energy_insights.insights_view import (
    _merge_hourly_statistics,
)
from custom_components.smart_energy_insights.repositories.consumption_sources_repository import (
    async_clear_sources,
    async_load_sources,
    async_save_sources,
    normalize_sources,
)


@pytest.fixture
def mock_hass() -> MagicMock:
    return MagicMock(spec=HomeAssistant)


@pytest.fixture
def mock_store() -> Generator[MagicMock, None, None]:
    path = (
        "custom_components.smart_energy_insights.repositories."
        "consumption_sources_repository.Store"
    )
    with patch(path) as mock_store_cls:
        store_instance = MagicMock()
        store_instance.async_load = AsyncMock()
        store_instance.async_save = AsyncMock()
        store_instance.async_remove = AsyncMock()
        mock_store_cls.return_value = store_instance
        yield store_instance


def test_normalize_sources_preserves_order_removes_duplicates_and_defaults_cost_relevant() -> None:
    sources = [
        {"entity_id": " sensor.grid ", "name": " Grid ", "cost_relevant": True},
        {"entity_id": "sensor.pv", "name": "PV Self-consumption"},
        {"entity_id": "sensor.grid", "name": "Duplicate", "cost_relevant": False},
        {"entity_id": "", "name": "Missing sensor"},
        {"entity_id": "sensor.unnamed", "name": "  "},
    ]

    assert normalize_sources(sources) == [
        {"entity_id": "sensor.grid", "name": "Grid", "cost_relevant": True},
        {"entity_id": "sensor.pv", "name": "PV Self-consumption", "cost_relevant": False},
    ]


@pytest.mark.asyncio
async def test_async_load_sources_normalizes_stored_data(
    mock_hass: MagicMock,
    mock_store: MagicMock,
) -> None:
    mock_store.async_load.return_value = {
        "sources": [
            {"entity_id": "sensor.grid", "name": "Grid", "cost_relevant": True},
            {"entity_id": "sensor.grid", "name": "Duplicate"},
        ]
    }

    result = await async_load_sources(mock_hass)

    assert result == [{"entity_id": "sensor.grid", "name": "Grid", "cost_relevant": True}]


@pytest.mark.asyncio
async def test_async_save_sources_persists_normalized_data(
    mock_hass: MagicMock,
    mock_store: MagicMock,
) -> None:
    result = await async_save_sources(
        mock_hass,
        [{"entity_id": " sensor.pv ", "name": " PV ", "cost_relevant": False}],
    )

    assert result == [{"entity_id": "sensor.pv", "name": "PV", "cost_relevant": False}]
    mock_store.async_save.assert_awaited_once_with({"sources": result})


@pytest.mark.asyncio
async def test_async_clear_sources(
    mock_hass: MagicMock,
    mock_store: MagicMock,
) -> None:
    await async_clear_sources(mock_hass)

    mock_store.async_remove.assert_awaited_once()


def test_merge_hourly_statistics_sums_overlapping_hours_and_treats_missing_as_zero() -> None:
    hour_1 = datetime(2026, 1, 1, 0, tzinfo=timezone.utc)
    hour_2 = datetime(2026, 1, 1, 1, tzinfo=timezone.utc)

    grid = [
        {"start": hour_1, "state": 2.0, "sum": 2.0},
        {"start": hour_2, "state": 1.0, "sum": 3.0},
    ]
    # PV only reported for hour_1 - hour_2 should be treated as 0, not skipped.
    pv = [
        {"start": hour_1, "state": 0.5, "sum": 0.5},
    ]

    merged = _merge_hourly_statistics([grid, pv])

    assert merged == [
        {"start": hour_1, "state": 2.5, "sum": 2.5},
        {"start": hour_2, "state": 1.0, "sum": 3.5},
    ]


def test_merge_hourly_statistics_handles_empty_input() -> None:
    assert _merge_hourly_statistics([]) == []
    assert _merge_hourly_statistics([[], []]) == []
