from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from custom_components.smart_energy_insights.insights_view import (
    _derive_consumption_metrics,
)
from custom_components.smart_energy_insights.services.consumption_metrics_service import (
    analyze_variable_consumption,
)


def test_consumption_metrics_include_first_max_peak_timestamp() -> None:
    first_peak = datetime(2026, 8, 20, 14, tzinfo=timezone.utc)
    statistics = [
        {"start": datetime(2026, 8, 20, 13, tzinfo=timezone.utc), "state": 1.2},
        {"start": first_peak, "state": 4.5},
        {"start": datetime(2026, 8, 21, 18, tzinfo=timezone.utc), "state": 4.5},
    ]

    metrics = _derive_consumption_metrics(statistics)

    assert metrics["max_peak_kwh"] == 4.5
    assert metrics["max_peak_at"] == first_peak.isoformat()


def test_consumption_metrics_without_statistics_have_no_peak_timestamp() -> None:
    metrics = _derive_consumption_metrics([])

    assert metrics["max_peak_kwh"] is None
    assert metrics["max_peak_at"] is None


def _hourly_profile(days: int, value_for_hour) -> list[dict]:
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [
        {
            "start": start + timedelta(hours=offset),
            "state": value_for_hour(offset // 24, offset % 24),
        }
        for offset in range(days * 24)
    ]


def test_variable_consumption_requires_seven_valid_nights() -> None:
    statistics = _hourly_profile(6, lambda _day, _hour: 0.3)

    with patch(
        "custom_components.smart_energy_insights.services.consumption_metrics_service.dt_util.as_local",
        side_effect=lambda value: value,
    ):
        result = analyze_variable_consumption(statistics, statistics)

    assert result["base_load_status"] == "insufficient_data"
    assert result["base_load_valid_nights"] == 6
    assert result["base_load_kwh_per_hour"] is None
    assert result["variable_consumption_percent"] is None
    assert result["grid_shiftable_upper_bound_kwh"] is None


def test_variable_consumption_uses_night_median_despite_ev_outlier() -> None:
    night_values = [0.29, 0.30, 0.31, 0.32, 0.33, 4.0]
    statistics = _hourly_profile(
        7,
        lambda _day, hour: night_values[hour] if hour < 6 else 0.8,
    )

    with patch(
        "custom_components.smart_energy_insights.services.consumption_metrics_service.dt_util.as_local",
        side_effect=lambda value: value,
    ):
        result = analyze_variable_consumption(statistics, statistics)

    assert result["base_load_status"] == "available"
    assert result["base_load_valid_nights"] == 7
    assert result["base_load_method"] == "nighttime_median_rolling_28d_median"
    assert result["base_load_kwh_per_hour"] == 0.315
    assert result["variable_consumption_percent"] is not None


def test_variable_consumption_is_stable_when_pv_reduces_grid_draw() -> None:
    total_statistics = _hourly_profile(
        7,
        lambda _day, hour: 0.3 if hour < 6 else 1.0,
    )
    cost_statistics = _hourly_profile(
        7,
        lambda _day, hour: 0.0 if 10 <= hour < 16 else (0.3 if hour < 6 else 1.0),
    )

    with patch(
        "custom_components.smart_energy_insights.services.consumption_metrics_service.dt_util.as_local",
        side_effect=lambda value: value,
    ):
        result = analyze_variable_consumption(total_statistics, cost_statistics)

    assert result["base_load_kwh_per_hour"] == 0.3
    assert abs(result["variable_consumption_kwh"] - 88.2) < 0.0001
    assert abs(result["grid_shiftable_upper_bound_kwh"] - 58.8) < 0.0001
    assert result["grid_shiftable_upper_bound_kwh"] < result["variable_consumption_kwh"]


def test_variable_consumption_ignores_zero_night_values() -> None:
    night_values = [0.0, 0.0, 0.29, 0.30, 0.31, 0.32]
    statistics = _hourly_profile(
        7,
        lambda _day, hour: night_values[hour] if hour < 6 else 0.8,
    )

    with patch(
        "custom_components.smart_energy_insights.services.consumption_metrics_service.dt_util.as_local",
        side_effect=lambda value: value,
    ):
        result = analyze_variable_consumption(statistics, statistics)

    assert result["base_load_status"] == "available"
    assert result["base_load_kwh_per_hour"] == 0.305


def test_variable_consumption_rolling_window_tracks_baseline_change() -> None:
    statistics = _hourly_profile(
        56,
        lambda day, hour: (0.2 if day < 28 else 0.6) if hour < 6 else 1.0,
    )

    with patch(
        "custom_components.smart_energy_insights.services.consumption_metrics_service.dt_util.as_local",
        side_effect=lambda value: value,
    ):
        result = analyze_variable_consumption(statistics, statistics)

    variable_by_start = result["variable_consumption_by_start"]
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert variable_by_start[start + timedelta(days=5, hours=12)] == 0.8
    assert variable_by_start[start + timedelta(days=50, hours=12)] == 0.4