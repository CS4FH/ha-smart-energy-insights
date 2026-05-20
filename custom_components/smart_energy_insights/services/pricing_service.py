"""Pricing configuration and calculations."""

from dataclasses import dataclass

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ..const import DOMAIN


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
        "fixed_base_fee": 4.90,
        "spot_markup": 1.5,
        "spot_base_fee": 5.99,
        "tax_rate": 20.0,
    }

    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return PricingConfig(**defaults)

    entry = entries[0]
    return PricingConfig(
        fixed_price=entry.options.get("fixed_price", entry.data.get("fixed_price", defaults["fixed_price"])),
        fixed_base_fee=entry.options.get("fixed_base_fee", entry.data.get("fixed_base_fee", defaults["fixed_base_fee"])),
        spot_markup=entry.options.get("spot_markup", entry.data.get("spot_markup", defaults["spot_markup"])),
        spot_base_fee=entry.options.get("spot_base_fee", entry.data.get("spot_base_fee", defaults["spot_base_fee"])),
        tax_rate=entry.options.get("tax_rate", entry.data.get("tax_rate", defaults["tax_rate"])),
    )


def update_pricing_config(hass: HomeAssistant, payload: dict) -> None:
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return

    entry = entries[0]
    new_options = dict(entry.options)
    mapping = {
        "fixed_price_ct": "fixed_price",
        "fixed_base_fee_eur": "fixed_base_fee",
        "spot_markup_ct": "spot_markup",
        "spot_base_fee_eur": "spot_base_fee",
        "tax_rate": "tax_rate",
    }

    for payload_key, option_key in mapping.items():
        if payload_key in payload:
            new_options[option_key] = float(payload[payload_key])

    hass.config_entries.async_update_entry(entry, options=new_options)


def build_price_heatmap(price_series: list) -> list:
    if not price_series:
        return []

    sums = {d: {h: 0.0 for h in range(24)} for d in range(7)}
    counts = {d: {h: 0 for h in range(24)} for d in range(7)}
    for point in price_series:
        dt_local = dt_util.as_local(point["start"])
        d = dt_local.weekday()
        h = dt_local.hour
        sums[d][h] += point["value"]
        counts[d][h] += 1

    heatmap = []
    for d in range(7):
        row = []
        for h in range(24):
            avg = sums[d][h] / counts[d][h] if counts[d][h] > 0 else 0
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

    price_dict = {p["start"]: p["value"] for p in price_series}

    for stat in statistics:
        cons = stat["state"]
        spot_price = price_dict.get(stat["start"])
        if spot_price is not None:
            matched_hours += 1
            matched_consumption += cons
            base_spot_cost_cents += cons * spot_price

    duration_months = matched_hours / 730.5 if matched_hours > 0 else 0.0

    return {
        "matched_hours": matched_hours,
        "matched_consumption": matched_consumption,
        "base_spot_cost_cents": base_spot_cost_cents,
        "price_heatmap": build_price_heatmap(price_series),
        "duration_months": duration_months,
    }
