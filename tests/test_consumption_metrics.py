from __future__ import annotations

from datetime import datetime, timezone

from custom_components.smart_energy_insights.insights_view import (
    _derive_consumption_metrics,
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