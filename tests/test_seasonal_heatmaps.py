from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

from custom_components.smart_energy_insights.insights_view import _build_seasonal_heatmaps


def test_build_seasonal_heatmaps_uses_northern_hemisphere_months() -> None:
    statistics = [
        {"start": datetime(2026, 1, 15, 8, tzinfo=timezone.utc), "state": 1.0},
        {"start": datetime(2026, 3, 15, 9, tzinfo=timezone.utc), "state": 2.0},
        {"start": datetime(2026, 6, 15, 10, tzinfo=timezone.utc), "state": 3.0},
        {"start": datetime(2026, 9, 15, 11, tzinfo=timezone.utc), "state": 4.0},
        {"start": datetime(2026, 12, 15, 12, tzinfo=timezone.utc), "state": 5.0},
    ]
    price_series = [
        {"start": item["start"], "value": item["state"] * 10}
        for item in statistics
    ]

    with patch(
        "custom_components.smart_energy_insights.insights_view.dt_util.as_local",
        side_effect=lambda dt: dt,
    ), patch(
        "custom_components.smart_energy_insights.services.pricing_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        heatmaps = _build_seasonal_heatmaps(statistics, price_series)

    def heatmap_total(season: str, name: str) -> float:
        return sum(sum(row) for row in heatmaps[season][name])

    assert heatmap_total("whole_year", "consumption_heatmap") == 15.0
    assert heatmap_total("spring", "consumption_heatmap") == 2.0
    assert heatmap_total("summer", "consumption_heatmap") == 3.0
    assert heatmap_total("autumn", "consumption_heatmap") == 4.0
    assert heatmap_total("winter", "consumption_heatmap") == 6.0
    assert heatmap_total("winter", "price_heatmap") == 60.0


def test_seasonal_heatmaps_does_not_shift_month_boundary() -> None:
    """R2 regression: an interval starting at 23:00 on the last day of a month
    must be attributed to that month, not shifted into the next month by an
    incorrect +1h adjustment (start already represents the interval-begin)."""
    statistics = [
        {"start": datetime(2026, 2, 28, 23, tzinfo=timezone.utc), "state": 7.0},
    ]

    with patch(
        "custom_components.smart_energy_insights.insights_view.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        heatmaps = _build_seasonal_heatmaps(statistics, [])

    def heatmap_total(season: str) -> float:
        return sum(sum(row) for row in heatmaps[season]["consumption_heatmap"])

    assert heatmap_total("winter") == 7.0
    assert heatmap_total("spring") == 0.0
