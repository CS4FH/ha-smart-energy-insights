"""Canonical tariff analysis calculations (single source of truth)."""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from homeassistant.util import dt as dt_util

# Average number of hours in a calendar month (365.25 days / 12), used to
# convert a count of matched hours into a fractional month duration for
# base-fee proration. See R10 in docs/refactoring-recommendations.md.
AVERAGE_HOURS_PER_MONTH = 730.5

# Size of the daily "cheapest"/"most expensive" price window (in hours) used
# for the load-shifting potential estimate. See R10 in
# docs/refactoring-recommendations.md.
DAILY_SHIFT_WINDOW_HOURS = 6


def compute_price_exposure(statistics: list, price_series: list) -> dict:
    """Compute per-day price-ranked consumption exposure shares.

    Ranks each day's matched consumption by the raw (net wholesale) spot
    price and reports the share of consumption occurring in that day's
    cheapest / most expensive `DAILY_SHIFT_WINDOW_HOURS`-hour windows.
    Tariff-parameter independent (no tax/markup applied), so it can be run on
    any consumption series against the same price series - e.g. once for the
    cost-relevant consumption (mirrors the exposure numbers embedded in
    `analyze_tariffs`) and once for the household's total consumption
    (Gesamtbezug, including non-cost-relevant sources such as PV/battery) to
    describe *when* energy is actually used, independent of who pays for it.
    """
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

    matched_consumption = sum(consumption for _, consumption, _ in matched_points)

    peak_exposure_percent = None
    off_peak_share_percent = None
    if matched_consumption > 0:
        matched_points_by_day: dict = defaultdict(list)
        for start, consumption, spot_price in matched_points:
            day_key = dt_util.as_local(start).date()
            matched_points_by_day[day_key].append((consumption, spot_price))

        peak_exposure_kwh = 0.0
        off_peak_kwh = 0.0
        for day_points in matched_points_by_day.values():
            if not day_points:
                continue
            sorted_day_points = sorted(day_points, key=lambda entry: entry[1])
            take = min(DAILY_SHIFT_WINDOW_HOURS, len(sorted_day_points))
            off_peak_kwh += sum(consumption for consumption, _ in sorted_day_points[:take])
            peak_exposure_kwh += sum(consumption for consumption, _ in sorted_day_points[-take:])

        peak_exposure_percent = (peak_exposure_kwh / matched_consumption) * 100.0
        off_peak_share_percent = (off_peak_kwh / matched_consumption) * 100.0

    return {
        "matched_consumption": matched_consumption,
        "peak_exposure_percent": peak_exposure_percent,
        "off_peak_share_percent": off_peak_share_percent,
    }


def analyze_tariffs(
    statistics: list,
    price_series: list,
    pricing_config,
    range_start=None,
    range_end=None,
) -> dict:
    """Compute canonical tariff totals, monthly deltas, and derived metrics.

    This function is the single source of truth for tariff comparisons.

    Fixed convention (no user-configurable net/gross toggle, see R11 in
    docs/refactoring-recommendations.md): fixed_price, fixed_base_fee,
    spot_markup and spot_base_fee are always entered and treated as gross
    (tax-included) prices, matching how retail tariffs are normally quoted.
    The day-ahead spot market price in price_series is always a net/wholesale
    price (that's what the aWATTar exchange data is), so tax_rate is always
    applied to convert it to a gross retail price before it is combined with
    the (already gross) markup/base fee.
    """
    months = {
        month: {
            "month": month,
            "matched_hours": 0,
            "expected_hours": 0,
            "expected_days": 0,
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
    consumption_hours = sum(1 for stat in (statistics or []) if stat.get("start") is not None)
    matched_consumption = sum(consumption for _, consumption, _ in matched_points)
    base_spot_cost_cents = sum(consumption * spot_price for _, consumption, spot_price in matched_points)
    duration_months = matched_hours / AVERAGE_HOURS_PER_MONTH if matched_hours else 0.0
    total_consumption_kwh = sum(max(0.0, float(stat.get("state", 0.0) or 0.0)) for stat in (statistics or []))

    expected_hours = 0
    expected_dates_by_month = {month: set() for month in range(1, 13)}
    expectation_start = range_start
    expectation_end = range_end
    if expectation_start is None or expectation_end is None:
        starts = [stat.get("start") for stat in statistics if stat.get("start") is not None]
        if starts:
            expectation_start = min(starts)
            expectation_end = max(starts) + timedelta(hours=1)

    if expectation_start is not None and expectation_end is not None:
        current_start = expectation_start
        while current_start < expectation_end:
            local_start = dt_util.as_local(current_start)
            months[local_start.month]["expected_hours"] += 1
            expected_dates_by_month[local_start.month].add(local_start.date())
            expected_hours += 1
            current_start += timedelta(hours=1)

    for month, expected_dates in expected_dates_by_month.items():
        months[month]["expected_days"] = len(expected_dates)

    data_completeness_ratio = (
        consumption_hours / expected_hours
        if expected_hours > 0
        else None
    )

    # tax_multiplier converts the net wholesale spot price to a gross retail
    # price. fixed_price/fixed_base_fee/spot_markup/spot_base_fee are already
    # gross (fixed convention, see docstring above), so they are used as-is.
    tax_multiplier = 1.0 + pricing_config.tax_rate / 100.0
    gross_fix_price = pricing_config.fixed_price
    gross_fix_base = pricing_config.fixed_base_fee
    gross_spot_markup = pricing_config.spot_markup
    gross_spot_base = pricing_config.spot_base_fee

    fix_base_per_hour = (duration_months * gross_fix_base) / matched_hours if matched_hours else 0.0
    spot_base_per_hour = (duration_months * gross_spot_base) / matched_hours if matched_hours else 0.0

    fixed_total_eur = 0.0
    spot_total_eur = 0.0
    delta_total_eur = 0.0
    cheaper_hours = 0
    negative_price_hours = 0
    max_spot_price_ct_kwh = None
    min_spot_price_ct_kwh = None
    max_spot_price_at = None
    min_spot_price_at = None

    for start, consumption, spot_price in matched_points:
        # 'start' is the interval-begin hour (see csv_repository ingestion),
        # so the interval covers [start, start+1h); attribute it to 'start'.
        bucket_dt = dt_util.as_local(start)
        month = bucket_dt.month

        fixed_cost_hour = (consumption * gross_fix_price) / 100.0 + fix_base_per_hour
        spot_energy_price = spot_price * tax_multiplier + gross_spot_markup
        spot_cost_hour = (consumption * spot_energy_price) / 100.0 + spot_base_per_hour
        delta_hour = spot_cost_hour - fixed_cost_hour

        if spot_cost_hour < fixed_cost_hour:
            cheaper_hours += 1
        if spot_price < 0:
            negative_price_hours += 1
        if max_spot_price_ct_kwh is None or spot_price > max_spot_price_ct_kwh:
            max_spot_price_ct_kwh = spot_price
            max_spot_price_at = start.isoformat()
        if min_spot_price_ct_kwh is None or spot_price < min_spot_price_ct_kwh:
            min_spot_price_ct_kwh = spot_price
            min_spot_price_at = start.isoformat()

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
                "expected_hours": current["expected_hours"],
                "expected_days": current["expected_days"],
                "fixed_cost_eur": round(current["fixed_cost_eur"], 4),
                "spot_cost_eur": round(current["spot_cost_eur"], 4),
                "delta_eur": round(current["delta_eur"], 4),
            }
        )

    break_even_fixed = None
    if matched_consumption > 0:
        base_spot_cost_eur = base_spot_cost_cents / 100.0
        base_spot_cost_eur_adjusted = base_spot_cost_eur * tax_multiplier
        avg_spot_price = (base_spot_cost_eur_adjusted * 100.0 / matched_consumption)
        break_even_fixed = avg_spot_price + gross_spot_markup + (
            duration_months * (gross_spot_base - gross_fix_base) * 100.0 / matched_consumption
        )

    spot_cheaper_share = cheaper_hours / matched_hours if matched_hours > 0 else None
    negative_price_share = negative_price_hours / matched_hours if matched_hours > 0 else None
    effective_spot_price_ct_kwh = None
    if matched_consumption > 0:
        weighted_spot_energy_price_sum = sum(
            consumption * (spot_price * tax_multiplier + gross_spot_markup)
            for _, consumption, spot_price in matched_points
        )
        effective_spot_price_ct_kwh = weighted_spot_energy_price_sum / matched_consumption

    # Flexibility potential: share of consumption above baseline (P05 * total hours).
    values = [max(0.0, float(stat.get("state", 0.0) or 0.0)) for stat in (statistics or [])]
    base_load_p05_kwh = None
    if values:
        positive_values = [value for value in values if value > 0.0]
        percentile_source = sorted(positive_values if positive_values else values)
        if percentile_source:
            idx = int((len(percentile_source) - 1) * 0.05)
            base_load_p05_kwh = percentile_source[idx]

    absolute_base_load_kwh = None
    flexible_volume_kwh = None
    flexibility_potential_percent = None
    if base_load_p05_kwh is not None:
        absolute_base_load_kwh = base_load_p05_kwh * consumption_hours
        flexible_volume_kwh = max(0.0, total_consumption_kwh - absolute_base_load_kwh)
        if total_consumption_kwh > 0:
            flexibility_potential_percent = (flexible_volume_kwh / total_consumption_kwh) * 100.0

    price_sensitivity_percent = None
    if (
        break_even_fixed is not None
        and effective_spot_price_ct_kwh is not None
        and effective_spot_price_ct_kwh > 0
    ):
        price_sensitivity_percent = ((break_even_fixed / effective_spot_price_ct_kwh) - 1.0) * 100.0

    daily_prices: dict = defaultdict(list)
    for point in price_series or []:
        point_start = point.get("start")
        point_value = point.get("value")
        if point_start is None or point_value is None:
            continue
        price_ct_kwh = float(point_value)
        adjusted_price_ct_kwh = price_ct_kwh * tax_multiplier + gross_spot_markup
        day_key = dt_util.as_local(point_start).date()
        daily_prices[day_key].append(adjusted_price_ct_kwh)

    cheapest_daily_averages = []
    expensive_daily_averages = []
    for prices in daily_prices.values():
        if not prices:
            continue
        sorted_prices = sorted(prices)
        take = min(DAILY_SHIFT_WINDOW_HOURS, len(sorted_prices))
        cheapest_daily_averages.append(sum(sorted_prices[:take]) / take)
        expensive_daily_averages.append(sum(sorted_prices[-take:]) / take)

    avg_cheapest_daily_price_ct_kwh = (
        sum(cheapest_daily_averages) / len(cheapest_daily_averages)
        if cheapest_daily_averages
        else None
    )
    avg_most_expensive_daily_price_ct_kwh = (
        sum(expensive_daily_averages) / len(expensive_daily_averages)
        if expensive_daily_averages
        else None
    )

    max_extra_savings_eur = None
    max_penalty_risk_eur = None
    peak_exposure_percent = None
    off_peak_share_percent = None
    if flexible_volume_kwh is not None and effective_spot_price_ct_kwh is not None:
        savings_per_kwh_ct = 0.0
        if avg_cheapest_daily_price_ct_kwh is not None:
            savings_per_kwh_ct = max(0.0, effective_spot_price_ct_kwh - avg_cheapest_daily_price_ct_kwh)
        penalty_per_kwh_ct = 0.0
        if avg_most_expensive_daily_price_ct_kwh is not None:
            penalty_per_kwh_ct = max(0.0, avg_most_expensive_daily_price_ct_kwh - effective_spot_price_ct_kwh)
        max_extra_savings_eur = (flexible_volume_kwh * savings_per_kwh_ct) / 100.0
        max_penalty_risk_eur = (flexible_volume_kwh * penalty_per_kwh_ct) / 100.0

    # Exposure metrics: share of matched consumption that occurs in each day's
    # cheapest / most expensive 6-hour windows.
    if matched_consumption > 0:
        matched_points_by_day: dict = defaultdict(list)
        for start, consumption, spot_price in matched_points:
            day_key = dt_util.as_local(start).date()
            matched_points_by_day[day_key].append((consumption, spot_price))

        peak_exposure_kwh = 0.0
        off_peak_kwh = 0.0
        for day_points in matched_points_by_day.values():
            if not day_points:
                continue
            sorted_day_points = sorted(day_points, key=lambda entry: entry[1])
            take = min(DAILY_SHIFT_WINDOW_HOURS, len(sorted_day_points))
            off_peak_kwh += sum(consumption for consumption, _ in sorted_day_points[:take])
            peak_exposure_kwh += sum(consumption for consumption, _ in sorted_day_points[-take:])

        peak_exposure_percent = (peak_exposure_kwh / matched_consumption) * 100.0
        off_peak_share_percent = (off_peak_kwh / matched_consumption) * 100.0

    return {
        "matched_hours": matched_hours,
        "consumption_hours": consumption_hours,
        "expected_hours": expected_hours,
        "data_completeness_ratio": data_completeness_ratio,
        "matched_consumption": matched_consumption,
        "total_consumption_kwh": total_consumption_kwh,
        "base_load_p05_kwh": base_load_p05_kwh,
        "absolute_base_load_kwh": absolute_base_load_kwh,
        "flexible_volume_kwh": flexible_volume_kwh,
        "flexibility_potential_percent": flexibility_potential_percent,
        "base_spot_cost_cents": base_spot_cost_cents,
        "duration_months": duration_months,
        "spot_cheaper_share": spot_cheaper_share,
        "effective_spot_price_ct_kwh": effective_spot_price_ct_kwh,
        "price_sensitivity_percent": price_sensitivity_percent,
        "negative_price_hours": negative_price_hours,
        "negative_price_share": negative_price_share,
        "max_spot_price_ct_kwh": max_spot_price_ct_kwh,
        "min_spot_price_ct_kwh": min_spot_price_ct_kwh,
        "max_spot_price_at": max_spot_price_at,
        "min_spot_price_at": min_spot_price_at,
        "avg_cheapest_daily_price_ct_kwh": avg_cheapest_daily_price_ct_kwh,
        "avg_most_expensive_daily_price_ct_kwh": avg_most_expensive_daily_price_ct_kwh,
        "max_extra_savings_eur": max_extra_savings_eur,
        "max_penalty_risk_eur": max_penalty_risk_eur,
        "peak_exposure_percent": peak_exposure_percent,
        "off_peak_share_percent": off_peak_share_percent,
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
