"""Canonical tariff analysis calculations (single source of truth)."""

from __future__ import annotations

from datetime import timedelta

from homeassistant.util import dt as dt_util


def analyze_tariffs(statistics: list, price_series: list, pricing_config, inputs_are_net: bool) -> dict:
    """Compute canonical tariff totals, monthly deltas, and derived metrics.

    This function is the single source of truth for tariff comparisons.
    """
    months = {
        month: {
            "month": month,
            "matched_hours": 0,
            "fixed_cost_eur": 0.0,
            "spot_cost_eur": 0.0,
            "delta_eur": 0.0,
        }
        for month in range(1, 13)
    }

    price_dict = {point["start"]: float(point["value"]) for point in (price_series or [])}
    matched_points = []
    for stat in statistics or []:
        start = stat.get("start")
        if not start:
            continue
        spot_price = price_dict.get(start)
        if spot_price is None:
            continue
        consumption = max(0.0, float(stat.get("state", 0.0) or 0.0))
        matched_points.append((start, consumption, spot_price))

    matched_hours = len(matched_points)
    matched_consumption = sum(consumption for _, consumption, _ in matched_points)
    base_spot_cost_cents = sum(consumption * spot_price for _, consumption, spot_price in matched_points)
    duration_months = matched_hours / 730.5 if matched_hours else 0.0

    tax_multiplier = 1.0 + pricing_config.tax_rate / 100.0 if inputs_are_net else 1.0
    gross_fix_price = pricing_config.fixed_price * tax_multiplier if inputs_are_net else pricing_config.fixed_price
    gross_fix_base = (
        pricing_config.fixed_base_fee * tax_multiplier
        if inputs_are_net
        else pricing_config.fixed_base_fee
    )
    gross_spot_markup = pricing_config.spot_markup * tax_multiplier if inputs_are_net else pricing_config.spot_markup
    gross_spot_base = (
        pricing_config.spot_base_fee * tax_multiplier
        if inputs_are_net
        else pricing_config.spot_base_fee
    )

    fix_base_per_hour = (duration_months * gross_fix_base) / matched_hours if matched_hours else 0.0
    spot_base_per_hour = (duration_months * gross_spot_base) / matched_hours if matched_hours else 0.0

    fixed_total_eur = 0.0
    spot_total_eur = 0.0
    delta_total_eur = 0.0
    cheaper_hours = 0

    for start, consumption, spot_price in matched_points:
        # Align monthly bucketing with heatmap semantics (interval end).
        bucket_dt = dt_util.as_local(start) + timedelta(hours=1)
        month = bucket_dt.month

        fixed_cost_hour = (consumption * gross_fix_price) / 100.0 + fix_base_per_hour
        spot_energy_price = spot_price * tax_multiplier + gross_spot_markup
        spot_cost_hour = (consumption * spot_energy_price) / 100.0 + spot_base_per_hour
        delta_hour = spot_cost_hour - fixed_cost_hour

        if spot_cost_hour < fixed_cost_hour:
            cheaper_hours += 1

        fixed_total_eur += fixed_cost_hour
        spot_total_eur += spot_cost_hour
        delta_total_eur += delta_hour

        months[month]["matched_hours"] += 1
        months[month]["fixed_cost_eur"] += fixed_cost_hour
        months[month]["spot_cost_eur"] += spot_cost_hour
        months[month]["delta_eur"] += delta_hour

    normalized_months = []
    for month in range(1, 13):
        current = months[month]
        normalized_months.append(
            {
                "month": month,
                "matched_hours": current["matched_hours"],
                "fixed_cost_eur": round(current["fixed_cost_eur"], 4),
                "spot_cost_eur": round(current["spot_cost_eur"], 4),
                "delta_eur": round(current["delta_eur"], 4),
            }
        )

    break_even_fixed = None
    if matched_consumption > 0:
        base_spot_cost_eur = base_spot_cost_cents / 100.0
        base_spot_cost_eur_adjusted = (
            base_spot_cost_eur
            if inputs_are_net
            else base_spot_cost_eur * (1.0 + pricing_config.tax_rate / 100.0)
        )
        avg_spot_price = (base_spot_cost_eur_adjusted * 100.0 / matched_consumption)
        break_even_fixed = avg_spot_price + gross_spot_markup + (
            duration_months * (gross_spot_base - gross_fix_base) * 100.0 / matched_consumption
        )

    spot_cheaper_share = cheaper_hours / matched_hours if matched_hours > 0 else None

    return {
        "matched_hours": matched_hours,
        "matched_consumption": matched_consumption,
        "base_spot_cost_cents": base_spot_cost_cents,
        "duration_months": duration_months,
        "spot_cheaper_share": spot_cheaper_share,
        "break_even_fixed_ct_kwh": break_even_fixed,
        "fixed_total_eur": round(fixed_total_eur, 4),
        "spot_total_eur": round(spot_total_eur, 4),
        "delta_total_eur": round(delta_total_eur, 4),
        "total_savings_eur": round(max(0.0, -delta_total_eur), 4),
        "total_extra_cost_eur": round(max(0.0, delta_total_eur), 4),
        "monthly": normalized_months,
        "monthly_tariff_comparison": {
            "months": normalized_months,
            "total_delta_eur": round(delta_total_eur, 4),
            "total_savings_eur": round(max(0.0, -delta_total_eur), 4),
            "total_extra_cost_eur": round(max(0.0, delta_total_eur), 4),
            "matched_hours": matched_hours,
        },
    }
