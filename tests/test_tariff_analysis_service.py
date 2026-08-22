from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from custom_components.smart_energy_insights.services.pricing_service import PricingConfig
from custom_components.smart_energy_insights.services.tariff_analysis_service import (
    analyze_tariffs,
    compute_price_exposure,
)


def test_analyze_tariffs_is_consistent_for_monthly_and_total() -> None:
    statistics = [
        {"start": datetime(2026, 1, 31, 23, tzinfo=timezone.utc), "state": 2.0},
        {"start": datetime(2026, 2, 1, 0, tzinfo=timezone.utc), "state": 1.0},
    ]
    price_series = [
        {"start": datetime(2026, 1, 31, 23, tzinfo=timezone.utc), "value": 8.0},
        {"start": datetime(2026, 2, 1, 0, tzinfo=timezone.utc), "value": 45.0},
    ]
    pricing = PricingConfig(
        fixed_price=20.0,
        fixed_base_fee=5.0,
        spot_markup=1.0,
        spot_base_fee=6.0,
        tax_rate=20.0,
    )

    with patch(
        "custom_components.smart_energy_insights.services.tariff_analysis_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        result = analyze_tariffs(statistics, price_series, pricing)

    assert result["matched_hours"] == 2
    assert result["consumption_hours"] == 2
    assert result["expected_hours"] == 2
    assert result["data_completeness_ratio"] == 1.0
    assert result["matched_consumption"] == 3.0
    assert result["break_even_fixed_ct_kwh"] is not None
    assert result["spot_cheaper_share"] is not None
    assert result["effective_spot_price_ct_kwh"] is not None
    assert result["flexibility_potential_percent"] is not None
    assert result["price_sensitivity_percent"] is not None
    assert result["negative_price_hours"] == 0
    assert result["negative_price_share"] == 0.0
    assert result["max_spot_price_ct_kwh"] == 45.0
    assert result["min_spot_price_ct_kwh"] == 8.0
    assert result["max_spot_price_at"] == "2026-02-01T00:00:00+00:00"
    assert result["min_spot_price_at"] == "2026-01-31T23:00:00+00:00"
    assert result["max_extra_savings_eur"] is not None
    assert result["max_penalty_risk_eur"] is not None

    monthly = result["monthly"]
    assert len(monthly) == 12

    monthly_delta_sum = sum(item["delta_eur"] for item in monthly)
    assert abs(monthly_delta_sum - result["delta_total_eur"]) < 0.001
    assert sum(item["expected_hours"] for item in monthly) == result["expected_hours"]
    assert sum(item["expected_days"] for item in monthly) == 2

    assert result["total_savings_eur"] >= 0
    assert result["total_extra_cost_eur"] >= 0


def test_analyze_tariffs_month_expectations_handle_leap_year_and_dst() -> None:
    local_tz = ZoneInfo("Europe/Vienna")
    periods = [
        (
            datetime(2024, 2, 1, tzinfo=local_tz),
            datetime(2024, 3, 1, tzinfo=local_tz),
            2,
            29 * 24,
            29,
        ),
        (
            datetime(2026, 3, 1, tzinfo=local_tz),
            datetime(2026, 4, 1, tzinfo=local_tz),
            3,
            31 * 24 - 1,
            31,
        ),
        (
            datetime(2026, 10, 1, tzinfo=local_tz),
            datetime(2026, 11, 1, tzinfo=local_tz),
            10,
            31 * 24 + 1,
            31,
        ),
    ]
    pricing = PricingConfig(
        fixed_price=20.0,
        fixed_base_fee=0.0,
        spot_markup=0.0,
        spot_base_fee=0.0,
        tax_rate=0.0,
    )

    for local_start, local_end, month, expected_hours, expected_days in periods:
        utc_start = local_start.astimezone(timezone.utc)
        utc_end = local_end.astimezone(timezone.utc)
        starts = []
        current = utc_start
        while current < utc_end:
            starts.append(current)
            current += timedelta(hours=1)

        statistics = [{"start": start, "state": 1.0} for start in starts]
        price_series = [{"start": start, "value": 10.0} for start in starts]

        with patch(
            "custom_components.smart_energy_insights.services.tariff_analysis_service.dt_util.as_local",
            side_effect=lambda value: value.astimezone(local_tz),
        ):
            result = analyze_tariffs(statistics, price_series, pricing)

        month_result = result["monthly"][month - 1]
        assert month_result["expected_hours"] == expected_hours
        assert month_result["expected_days"] == expected_days


def test_analyze_tariffs_handles_no_matches() -> None:
    statistics = [
        {"start": datetime(2026, 1, 1, 0, tzinfo=timezone.utc), "state": 2.0},
    ]
    price_series = []
    pricing = PricingConfig(
        fixed_price=15.0,
        fixed_base_fee=4.9,
        spot_markup=1.5,
        spot_base_fee=5.99,
        tax_rate=20.0,
    )

    with patch(
        "custom_components.smart_energy_insights.services.tariff_analysis_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        result = analyze_tariffs(statistics, price_series, pricing)

    assert result["matched_hours"] == 0
    assert result["consumption_hours"] == 1
    assert result["expected_hours"] == 1
    assert result["data_completeness_ratio"] == 1.0
    assert result["delta_total_eur"] == 0.0
    assert result["break_even_fixed_ct_kwh"] is None
    assert result["effective_spot_price_ct_kwh"] is None
    assert result["flexibility_potential_percent"] is not None
    assert result["price_sensitivity_percent"] is None
    assert result["negative_price_hours"] == 0
    assert result["negative_price_share"] is None
    assert result["max_spot_price_ct_kwh"] is None
    assert result["min_spot_price_ct_kwh"] is None
    assert result["max_spot_price_at"] is None
    assert result["min_spot_price_at"] is None
    assert result["max_extra_savings_eur"] is None
    assert result["max_penalty_risk_eur"] is None
    assert result["monthly_tariff_comparison"]["matched_hours"] == 0


def test_analyze_tariffs_handles_empty_cost_relevant_statistics() -> None:
    # A household with zero cost-relevant consumption sources (e.g. only PV
    # self-consumption/battery configured, no grid draw) must not crash
    # analyze_tariffs; every derived metric should degrade to 0/None.
    price_series = [
        {"start": datetime(2026, 1, 1, 0, tzinfo=timezone.utc), "value": 10.0},
    ]
    pricing = PricingConfig(
        fixed_price=15.0,
        fixed_base_fee=4.9,
        spot_markup=1.5,
        spot_base_fee=5.99,
        tax_rate=20.0,
    )

    with patch(
        "custom_components.smart_energy_insights.services.tariff_analysis_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        result = analyze_tariffs([], price_series, pricing)

    assert result["matched_hours"] == 0
    assert result["consumption_hours"] == 0
    assert result["matched_consumption"] == 0.0
    assert result["delta_total_eur"] == 0.0
    assert result["break_even_fixed_ct_kwh"] is None
    assert result["effective_spot_price_ct_kwh"] is None
    assert result["peak_exposure_percent"] is None
    assert result["off_peak_share_percent"] is None
    assert result["monthly_tariff_comparison"]["matched_hours"] == 0


def test_compute_price_exposure_ranks_daily_cheapest_and_most_expensive_hours() -> None:
    statistics = [
        {"start": datetime(2026, 1, 1, 0, tzinfo=timezone.utc), "state": 1.0},
        {"start": datetime(2026, 1, 1, 1, tzinfo=timezone.utc), "state": 2.0},
    ]
    price_series = [
        {"start": datetime(2026, 1, 1, 0, tzinfo=timezone.utc), "value": 5.0},
        {"start": datetime(2026, 1, 1, 1, tzinfo=timezone.utc), "value": 50.0},
    ]

    with patch(
        "custom_components.smart_energy_insights.services.tariff_analysis_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        result = compute_price_exposure(statistics, price_series)

    assert result["matched_consumption"] == 3.0
    # Both hours fall within the (max) 6h cheapest and most-expensive windows
    # for their single day, so all consumption counts toward both shares.
    assert result["peak_exposure_percent"] == 100.0
    assert result["off_peak_share_percent"] == 100.0


def test_compute_price_exposure_handles_no_matches() -> None:
    result = compute_price_exposure(
        [{"start": datetime(2026, 1, 1, 0, tzinfo=timezone.utc), "state": 1.0}],
        [],
    )

    assert result["matched_consumption"] == 0.0
    assert result["peak_exposure_percent"] is None
    assert result["off_peak_share_percent"] is None


def test_analyze_tariffs_reports_negative_price_stats_and_completeness_gap() -> None:
    statistics = [
        {"start": datetime(2026, 1, 1, 0, tzinfo=timezone.utc), "state": 1.0},
        {"start": datetime(2026, 1, 1, 2, tzinfo=timezone.utc), "state": 2.0},
    ]
    price_series = [
        {"start": datetime(2026, 1, 1, 0, tzinfo=timezone.utc), "value": -5.0},
        {"start": datetime(2026, 1, 1, 2, tzinfo=timezone.utc), "value": 10.0},
    ]
    pricing = PricingConfig(
        fixed_price=20.0,
        fixed_base_fee=0.0,
        spot_markup=0.0,
        spot_base_fee=0.0,
        tax_rate=0.0,
    )

    with patch(
        "custom_components.smart_energy_insights.services.tariff_analysis_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        result = analyze_tariffs(statistics, price_series, pricing)

    assert result["matched_hours"] == 2
    assert result["consumption_hours"] == 2
    assert result["expected_hours"] == 3
    assert abs(result["data_completeness_ratio"] - (2 / 3)) < 0.0001
    assert result["negative_price_hours"] == 1
    assert abs(result["negative_price_share"] - 0.5) < 0.0001
    assert result["max_spot_price_ct_kwh"] == 10.0
    assert result["min_spot_price_ct_kwh"] == -5.0
    assert result["max_spot_price_at"] == "2026-01-01T02:00:00+00:00"
    assert result["min_spot_price_at"] == "2026-01-01T00:00:00+00:00"
    # Weighted mean: (1 * -5 + 2 * 10) / 3 = 5 ct/kWh
    assert abs(result["effective_spot_price_ct_kwh"] - 5.0) < 0.0001


def test_analyze_tariffs_risk_and_optimization_metrics_daily_6h() -> None:
    statistics = [
        {"start": datetime(2026, 1, 1, h, tzinfo=timezone.utc), "state": 1.0}
        for h in range(8)
    ]
    price_series = [
        {"start": datetime(2026, 1, 1, 0, tzinfo=timezone.utc), "value": 5.0},
        {"start": datetime(2026, 1, 1, 1, tzinfo=timezone.utc), "value": 6.0},
        {"start": datetime(2026, 1, 1, 2, tzinfo=timezone.utc), "value": 7.0},
        {"start": datetime(2026, 1, 1, 3, tzinfo=timezone.utc), "value": 8.0},
        {"start": datetime(2026, 1, 1, 4, tzinfo=timezone.utc), "value": 9.0},
        {"start": datetime(2026, 1, 1, 5, tzinfo=timezone.utc), "value": 10.0},
        {"start": datetime(2026, 1, 1, 6, tzinfo=timezone.utc), "value": 50.0},
        {"start": datetime(2026, 1, 1, 7, tzinfo=timezone.utc), "value": 60.0},
    ]
    pricing = PricingConfig(
        fixed_price=20.0,
        fixed_base_fee=0.0,
        spot_markup=0.0,
        spot_base_fee=0.0,
        tax_rate=0.0,
    )

    with patch(
        "custom_components.smart_energy_insights.services.tariff_analysis_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        result = analyze_tariffs(statistics, price_series, pricing)

    # total = 8 kWh, P05 = 1.0 kWh/h, base volume = 8 -> flexible volume = 0
    assert abs(result["flexibility_potential_percent"] - 0.0) < 0.0001
    assert abs(result["flexible_volume_kwh"] - 0.0) < 0.0001

    # Effective weighted spot price (uniform consumption) = arithmetic mean of all 8 prices = 19.375
    assert abs(result["effective_spot_price_ct_kwh"] - 19.375) < 0.0001

    # Daily cheapest 6h average = (5+6+7+8+9+10)/6 = 7.5
    assert abs(result["avg_cheapest_daily_price_ct_kwh"] - 7.5) < 0.0001

    # Daily most expensive 6h average = (7+8+9+10+50+60)/6 = 24.0
    assert abs(result["avg_most_expensive_daily_price_ct_kwh"] - 24.0) < 0.0001

    # Flexible volume is zero in this synthetic profile, so both EUR effects must be zero.
    assert abs(result["max_extra_savings_eur"] - 0.0) < 0.0001
    assert abs(result["max_penalty_risk_eur"] - 0.0) < 0.0001


def test_analyze_tariffs_peak_and_off_peak_exposure_daily_6h_weighted() -> None:
    starts = [datetime(2026, 1, 2, hour, tzinfo=timezone.utc) for hour in range(12)]
    consumptions = [
        5.0,
        5.0,
        5.0,
        5.0,
        5.0,
        5.0,
        1.0,
        1.0,
        1.0,
        1.0,
        1.0,
        1.0,
    ]
    prices = [
        1.0,
        2.0,
        3.0,
        4.0,
        5.0,
        6.0,
        50.0,
        51.0,
        52.0,
        53.0,
        54.0,
        55.0,
    ]
    statistics = [
        {"start": start, "state": consumption}
        for start, consumption in zip(starts, consumptions, strict=True)
    ]
    price_series = [
        {"start": start, "value": price}
        for start, price in zip(starts, prices, strict=True)
    ]
    pricing = PricingConfig(
        fixed_price=20.0,
        fixed_base_fee=0.0,
        spot_markup=0.0,
        spot_base_fee=0.0,
        tax_rate=0.0,
    )

    with patch(
        "custom_components.smart_energy_insights.services.tariff_analysis_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        result = analyze_tariffs(statistics, price_series, pricing)

    # Daily cheapest 6h are the first six points -> 30 kWh of total 36 kWh.
    assert abs(result["off_peak_share_percent"] - ((30.0 / 36.0) * 100.0)) < 0.0001

    # Daily most expensive 6h are the last six points -> 6 kWh of total 36 kWh.
    assert abs(result["peak_exposure_percent"] - ((6.0 / 36.0) * 100.0)) < 0.0001
