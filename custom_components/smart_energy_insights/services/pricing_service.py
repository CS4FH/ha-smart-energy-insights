"""Pricing configuration and calculations."""

from dataclasses import dataclass

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .tariff_analysis_service import AVERAGE_HOURS_PER_MONTH


@dataclass(frozen=True)
class PricingConfig:
    fixed_price: float
    fixed_base_fee: float
    spot_markup: float
    spot_base_fee: float
    tax_rate: float


def get_pricing_config(hass: HomeAssistant) -> PricingConfig:
    defaults = {
        "fixed_price": 15.0,
        "fixed_base_fee": 5.0,
        "spot_markup": 1.5,
        "spot_base_fee": 2.5,
        "tax_rate": 20.0,
    }

    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return PricingConfig(**defaults)

    entry = entries[0]
    return PricingConfig(
        fixed_price=entry.options.get("fixed_price", entry.data.get("fixed_price", defaults["fixed_price"])),
        fixed_base_fee=entry.options.get(
            "fixed_base_fee", entry.data.get("fixed_base_fee", defaults["fixed_base_fee"])
        ),
        spot_markup=entry.options.get("spot_markup", entry.data.get("spot_markup", defaults["spot_markup"])),
        spot_base_fee=entry.options.get(
            "spot_base_fee", entry.data.get("spot_base_fee", defaults["spot_base_fee"])
        ),
        tax_rate=entry.options.get("tax_rate", entry.data.get("tax_rate", defaults["tax_rate"])),
    )


def build_retail_price_heatmap(price_heatmap: list, tax_rate: float, spot_markup: float) -> list:
    """Convert a net/wholesale spot-price heatmap into a gross retail-price heatmap.

    Applies the same fixed net->gross conversion used in analyze_tariffs
    (tax_rate converts the net wholesale price to gross, spot_markup is
    already gross and added on top), so cost/comparison views that need a
    retail-equivalent price never re-derive this formula independently.
    See R9/R11 in docs/refactoring-recommendations.md.
    """
    tax_multiplier = 1.0 + tax_rate / 100.0
    return [
        [round(value * tax_multiplier + spot_markup, 3) for value in row]
        for row in (price_heatmap or [])
    ]


def build_price_heatmap(price_series: list) -> list:
    if not price_series:
        return []

    sums = {day: {hour: 0.0 for hour in range(24)} for day in range(7)}
    counts = {day: {hour: 0 for hour in range(24)} for day in range(7)}

    for point in price_series:
        dt_local = dt_util.as_local(point["start"])
        day = dt_local.weekday()
        hour = dt_local.hour
        sums[day][hour] += float(point["value"])
        counts[day][hour] += 1

    heatmap = []
    for day in range(7):
        row = []
        for hour in range(24):
            avg = sums[day][hour] / counts[day][hour] if counts[day][hour] > 0 else 0.0
            row.append(round(avg, 3))
        heatmap.append(row)

    return heatmap


def compute_spot_price_matches(statistics: list, price_series: list) -> dict:
    matched_hours = 0
    matched_consumption = 0.0
    base_spot_cost_cents = 0.0

    if not price_series:
        return {
            "matched_hours": 0,
            "matched_consumption": 0.0,
            "base_spot_cost_cents": 0.0,
            "price_heatmap": [],
            "duration_months": 0.0,
        }

    price_dict = {point["start"]: float(point["value"]) for point in price_series}

    for stat in statistics:
        cons = float(stat["state"])
        spot_price = price_dict.get(stat["start"])
        if spot_price is not None:
            matched_hours += 1
            matched_consumption += cons
            base_spot_cost_cents += cons * spot_price

    duration_months = matched_hours / AVERAGE_HOURS_PER_MONTH if matched_hours > 0 else 0.0

    return {
        "matched_hours": matched_hours,
        "matched_consumption": matched_consumption,
        "base_spot_cost_cents": base_spot_cost_cents,
        "price_heatmap": build_price_heatmap(price_series),
        "duration_months": duration_months,
    }
