from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from custom_components.smart_energy_insights.insights_view import _build_daily_coverage


def _utc_hours_for_local_day(local_date: date, local_tz: ZoneInfo) -> list[datetime]:
    start = datetime.combine(local_date, time.min, tzinfo=local_tz).astimezone(timezone.utc)
    end = datetime.combine(
        local_date + timedelta(days=1), time.min, tzinfo=local_tz
    ).astimezone(timezone.utc)
    hours = []
    current = start
    while current < end:
        hours.append(current)
        current += timedelta(hours=1)
    return hours


def test_build_daily_coverage_handles_dst_and_partial_days() -> None:
    local_tz = ZoneInfo("Europe/Vienna")
    spring_date = date(2026, 3, 29)
    autumn_date = date(2026, 10, 25)
    partial_date = date(2026, 10, 26)
    spring_hours = _utc_hours_for_local_day(spring_date, local_tz)
    autumn_hours = _utc_hours_for_local_day(autumn_date, local_tz)
    partial_hours = _utc_hours_for_local_day(partial_date, local_tz)[:3]
    statistics = [
        {"start": start, "state": 1.0}
        for start in spring_hours + autumn_hours + partial_hours + partial_hours[:1]
    ]

    with patch(
        "custom_components.smart_energy_insights.insights_view.dt_util.get_default_time_zone",
        return_value=local_tz,
    ), patch(
        "custom_components.smart_energy_insights.insights_view.dt_util.as_local",
        side_effect=lambda value: value.astimezone(local_tz),
    ):
        coverage = _build_daily_coverage(statistics)

    assert coverage["2026-03-29"] == {
        "available_hours": 23,
        "expected_hours": 23,
        "status": "complete",
    }
    assert coverage["2026-10-25"] == {
        "available_hours": 25,
        "expected_hours": 25,
        "status": "complete",
    }
    assert coverage["2026-10-26"] == {
        "available_hours": 3,
        "expected_hours": 24,
        "status": "partial",
    }