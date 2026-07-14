from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

from custom_components.smart_energy_insights.services.pricing_service import PricingConfig
from custom_components.smart_energy_insights.services.tariff_analysis_service import (
    analyze_tariffs,
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
        result = analyze_tariffs(statistics, price_series, pricing, inputs_are_net=False)

    assert result["matched_hours"] == 2
    assert result["matched_consumption"] == 3.0
    assert result["break_even_fixed_ct_kwh"] is not None
    assert result["spot_cheaper_share"] is not None

    monthly = result["monthly"]
    assert len(monthly) == 12

    monthly_delta_sum = sum(item["delta_eur"] for item in monthly)
    assert abs(monthly_delta_sum - result["delta_total_eur"]) < 0.001

    assert result["total_savings_eur"] >= 0
    assert result["total_extra_cost_eur"] >= 0


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
        result = analyze_tariffs(statistics, price_series, pricing, inputs_are_net=True)

    assert result["matched_hours"] == 0
    assert result["delta_total_eur"] == 0.0
    assert result["break_even_fixed_ct_kwh"] is None
    assert result["monthly_tariff_comparison"]["matched_hours"] == 0
