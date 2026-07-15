from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from custom_components.smart_energy_insights.services.pricing_service import (
    PricingConfig,
    build_price_heatmap,
    compute_spot_price_matches,
    get_inputs_are_net,
    get_pricing_config,
)


class FakeConfigEntries:
    """Mock implementation of Home Assistant's ConfigEntries manager."""

    def __init__(self, entries: list) -> None:
        self._entries = entries
        self.updated_entry = None
        self.updated_options = None

    def async_entries(self, domain: str) -> list:
        return self._entries

    def async_update_entry(self, entry: SimpleNamespace, options: dict) -> None:
        self.updated_entry = entry
        self.updated_options = options


class FakeHass:
    """Mock implementation of the Home Assistant core object."""

    def __init__(self, entries: list) -> None:
        self.config_entries = FakeConfigEntries(entries)


def _fake_entry() -> SimpleNamespace:
    """Provide a standard ConfigEntry populated with realistic fallback data."""
    return SimpleNamespace(
        data={
            "fixed_price": 14.5,
            "fixed_base_fee": 4.5,
            "spot_markup": 1.2,
            "spot_base_fee": 5.5,
            "tax_rate": 19.0,
        },
        options={},
    )


def _empty_hass() -> FakeHass:
    """Provide a mock Home Assistant instance without any integration entries."""
    return FakeHass([])


def test_get_pricing_config_uses_defaults_when_no_entry() -> None:
    """Verify that hardcoded fallback values are used if no config entry exists."""
    config = get_pricing_config(_empty_hass())

    assert config == PricingConfig(
        fixed_price=15.0,
        fixed_base_fee=4.90,
        spot_markup=1.5,
        spot_base_fee=5.99,
        tax_rate=20.0,
    )


def test_get_pricing_config_prefers_options_over_data() -> None:
    """Verify that user-configured options override initial entry setup data."""
    fake_entry = _fake_entry()
    fake_entry.options = {
        "fixed_price": 16.0,
        "fixed_base_fee": 4.1,
        "spot_markup": 1.4,
        "spot_base_fee": 5.2,
        "tax_rate": 21.0,
    }
    hass = FakeHass([fake_entry])
    config = get_pricing_config(hass)

    assert config == PricingConfig(
        fixed_price=16.0,
        fixed_base_fee=4.1,
        spot_markup=1.4,
        spot_base_fee=5.2,
        tax_rate=21.0,
    )


def test_get_inputs_are_net_prefers_options_over_data() -> None:
    """Verify that the tariff tax mode is read from integration options."""
    fake_entry = _fake_entry()
    fake_entry.data["inputs_are_net"] = False
    fake_entry.options = {"inputs_are_net": True}

    assert get_inputs_are_net(FakeHass([fake_entry])) is True


def test_build_price_heatmap_averages_values_by_weekday_hour() -> None:
    """Verify that price tracking aggregates and averages price data correctly across intervals."""
    price_series = [
        {"start": datetime(2026, 1, 5, 12, tzinfo=timezone.utc), "value": 10.0},
        {"start": datetime(2026, 1, 5, 12, tzinfo=timezone.utc), "value": 14.0},
        {"start": datetime(2026, 1, 5, 13, tzinfo=timezone.utc), "value": 9.0},
    ]

    with patch(
        "custom_components.smart_energy_insights.services.pricing_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        heatmap = build_price_heatmap(price_series)

    assert heatmap[0][12] == 12.0
    assert heatmap[0][13] == 9.0
    assert heatmap[1][12] == 0


def test_build_price_heatmap_returns_empty_list_for_empty_series() -> None:
    """Verify that an empty input time-series handles gracefully without throwing exceptions."""
    assert build_price_heatmap([]) == []


def test_compute_spot_price_matches_tracks_only_matching_hours() -> None:
    statistics = [
        {"start": datetime(2026, 1, 5, 12, tzinfo=timezone.utc), "state": 2.0},
        {"start": datetime(2026, 1, 5, 13, tzinfo=timezone.utc), "state": 1.0},
    ]
    price_series = [
        {"start": datetime(2026, 1, 5, 12, tzinfo=timezone.utc), "value": 30.0},
    ]

    with patch(
        "custom_components.smart_energy_insights.services.pricing_service.dt_util.as_local",
        side_effect=lambda dt: dt,
    ):
        result = compute_spot_price_matches(statistics, price_series)

    assert result["matched_hours"] == 1
    assert result["matched_consumption"] == 2.0
    assert result["base_spot_cost_cents"] == 60.0
    assert result["duration_months"] > 0