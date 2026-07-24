from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from custom_components.smart_energy_insights.insights_view import (
    SmartEnergyInsightsDeviceAnalysisView,
    _device_analysis_response,
    _get_active_profile_range,
    _get_energy_sensor,
)


def _energy_state(state_class: str = "total_increasing", unit: str = "kWh") -> MagicMock:
    state = MagicMock()
    state.attributes = {
        "device_class": "energy",
        "state_class": state_class,
        "unit_of_measurement": unit,
    }
    return state


@pytest.mark.parametrize(
    ("state_class", "unit", "expected_factor"),
    [
        ("total", "kWh", 1.0),
        ("total_increasing", "Wh", 0.001),
    ],
)
def test_get_energy_sensor_accepts_cumulative_energy_sensors(
    state_class: str,
    unit: str,
    expected_factor: float,
) -> None:
    hass = MagicMock()
    hass.states.get.return_value = _energy_state(state_class, unit)

    _, factor = _get_energy_sensor(hass, "sensor.device_energy")

    assert factor == expected_factor


def test_get_energy_sensor_rejects_power_sensor() -> None:
    hass = MagicMock()
    state = _energy_state()
    state.attributes["device_class"] = "power"
    state.attributes["unit_of_measurement"] = "W"
    hass.states.get.return_value = state

    assert _get_energy_sensor(hass, "sensor.device_power") is None


def test_get_active_profile_range_uses_selected_source() -> None:
    cached = {
        "active_source": "csv",
        "csv_data": {
            "available_start": "2026-01-01T00:00:00+00:00",
            "available_end": "2026-01-31T23:00:00+00:00",
        },
        "sensor_data": {
            "available_start": "2025-01-01T00:00:00+00:00",
            "available_end": "2026-01-31T23:00:00+00:00",
        },
    }

    start, end = _get_active_profile_range(cached)

    assert start == datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert end == datetime(2026, 2, 1, tzinfo=timezone.utc)


def test_device_analysis_response_contains_device_only_heatmaps() -> None:
    statistics = [
        {"start": datetime(2026, 1, 5, 8, tzinfo=timezone.utc), "state": 1.0},
        {"start": datetime(2026, 1, 6, 8, tzinfo=timezone.utc), "state": 2.0},
    ]

    response = _device_analysis_response(
        "sensor.washer_energy",
        "Washer",
        statistics,
        datetime(2026, 1, 5, tzinfo=timezone.utc),
        datetime(2026, 1, 7, tzinfo=timezone.utc),
    )

    assert response["name"] == "Washer"
    assert response["matched_hours"] == 2
    assert response["data_completeness_ratio"] == pytest.approx(2 / 48)
    assert "price_heatmap" not in response
    assert response["seasonal_heatmaps"]["winter"]["matched_hours"] == 2


@pytest.mark.asyncio
async def test_device_analysis_returns_no_overlap_without_device_rows() -> None:
    hass = MagicMock()
    hass.states.get.return_value = _energy_state()
    request = MagicMock()
    request.app = {"hass": hass}
    request.json = AsyncMock(return_value={"entity_id": "sensor.washer_energy"})

    with patch(
        "custom_components.smart_energy_insights.insights_view.async_load_devices",
        AsyncMock(return_value=[{"entity_id": "sensor.washer_energy", "name": "Washer"}]),
    ), patch(
        "custom_components.smart_energy_insights.insights_view.async_load_cache",
        AsyncMock(return_value={
            "active_source": "csv",
            "csv_data": {
                "available_start": "2026-01-01T00:00:00+00:00",
                "available_end": "2026-01-31T23:00:00+00:00",
            },
        }),
    ), patch(
        "custom_components.smart_energy_insights.insights_view.async_get_statistics_during_period",
        AsyncMock(return_value={"sensor.washer_energy": []}),
    ):
        response = await SmartEnergyInsightsDeviceAnalysisView().post(request)

    assert response.status == 409
    assert json.loads(response.text)["code"] == "no_overlap"