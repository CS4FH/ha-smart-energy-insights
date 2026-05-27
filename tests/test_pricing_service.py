from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from custom_components.smart_energy_insights.services.pricing_service import (
    PricingConfig,
    build_price_heatmap,
    compute_spot_price_matches,
    get_pricing_config,
    update_pricing_config,
)


class FakeConfigEntries:
    def __init__(self, entries):
        self._entries = entries
        self.updated_entry = None
        self.updated_options = None

    def async_entries(self, domain):
        return self._entries

    def async_update_entry(self, entry, options):
        self.updated_entry = entry
        self.updated_options = options


class FakeHass:
    def __init__(self, entries):
        self.config_entries = FakeConfigEntries(entries)


class PricingServiceTests(unittest.TestCase):
    def setUp(self):
        self.fake_entry = SimpleNamespace(
            data={
                "fixed_price": 14.5,
                "fixed_base_fee": 4.5,
                "spot_markup": 1.2,
                "spot_base_fee": 5.5,
                "tax_rate": 19.0,
            },
            options={},
        )

    def test_get_pricing_config_uses_defaults_when_no_entry(self):
        hass = FakeHass([])

        config = get_pricing_config(hass)

        self.assertEqual(
            config,
            PricingConfig(
                fixed_price=15.0,
                fixed_base_fee=4.90,
                spot_markup=1.5,
                spot_base_fee=5.99,
                tax_rate=20.0,
            ),
        )

    def test_get_pricing_config_prefers_options_over_data(self):
        self.fake_entry.options = {
            "fixed_price": 16.0,
            "fixed_base_fee": 4.1,
            "spot_markup": 1.4,
            "spot_base_fee": 5.2,
            "tax_rate": 21.0,
        }
        hass = FakeHass([self.fake_entry])

        config = get_pricing_config(hass)

        self.assertEqual(
            config,
            PricingConfig(
                fixed_price=16.0,
                fixed_base_fee=4.1,
                spot_markup=1.4,
                spot_base_fee=5.2,
                tax_rate=21.0,
            ),
        )

    def test_update_pricing_config_maps_payload_to_options(self):
        hass = FakeHass([self.fake_entry])

        update_pricing_config(
            hass,
            {
                "fixed_price_ct": 17.5,
                "fixed_base_fee_eur": 4.2,
                "spot_markup_ct": 1.8,
                "spot_base_fee_eur": 6.1,
                "tax_rate": 22.0,
            },
        )

        self.assertIs(hass.config_entries.updated_entry, self.fake_entry)
        self.assertEqual(
            hass.config_entries.updated_options,
            {
                "fixed_price": 17.5,
                "fixed_base_fee": 4.2,
                "spot_markup": 1.8,
                "spot_base_fee": 6.1,
                "tax_rate": 22.0,
            },
        )

    def test_build_price_heatmap_averages_values_by_weekday_hour(self):
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

        self.assertEqual(heatmap[0][12], 12.0)
        self.assertEqual(heatmap[0][13], 9.0)
        self.assertEqual(heatmap[1][12], 0)

    def test_compute_spot_price_matches_aggregates_matching_hours(self):
        start = datetime(2026, 1, 5, 12, tzinfo=timezone.utc)
        statistics = [
            {"start": start, "state": 2.0},
            {"start": start.replace(hour=13), "state": 3.0},
            {"start": start.replace(hour=14), "state": 4.0},
        ]
        price_series = [
            {"start": start, "value": 10.0},
            {"start": start.replace(hour=13), "value": 11.0},
            {"start": start.replace(hour=15), "value": 12.0},
        ]

        with patch(
            "custom_components.smart_energy_insights.services.pricing_service.dt_util.as_local",
            side_effect=lambda dt: dt,
        ):
            result = compute_spot_price_matches(statistics, price_series)

        self.assertEqual(result["matched_hours"], 2)
        self.assertEqual(result["matched_consumption"], 5.0)
        self.assertAlmostEqual(result["base_spot_cost_cents"], 53.0)
        self.assertAlmostEqual(result["duration_months"], 2 / 730.5)
        self.assertEqual(result["price_heatmap"][0][12], 10.0)
        self.assertEqual(result["price_heatmap"][0][13], 11.0)


if __name__ == "__main__":
    unittest.main()
