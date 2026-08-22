"""Robust household baseline and variable-consumption calculations."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import timedelta
from statistics import median

from homeassistant.util import dt as dt_util

BASE_LOAD_METHOD = "nighttime_median_rolling_28d_median"
BASE_LOAD_STATUS_AVAILABLE = "available"
BASE_LOAD_STATUS_INSUFFICIENT_DATA = "insufficient_data"
MINIMUM_VALID_NIGHTS = 7
MINIMUM_NIGHT_VALUES = 3
NIGHT_HOURS = range(0, 6)
ROLLING_WINDOW_DAYS = 28


def _normalized_points(statistics: list) -> list[tuple]:
    points = []
    for item in statistics or []:
        start = item.get("start")
        if start is None:
            continue
        try:
            value = float(item.get("state", 0.0) or 0.0)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(value) or value < 0.0:
            continue
        points.append((start, value, dt_util.as_local(start).date()))
    return points


def _empty_result(valid_nights: int = 0) -> dict:
    return {
        "base_load_kwh_per_hour": None,
        "base_load_method": BASE_LOAD_METHOD,
        "base_load_status": BASE_LOAD_STATUS_INSUFFICIENT_DATA,
        "base_load_valid_nights": valid_nights,
        "baseline_consumption_kwh": None,
        "variable_consumption_kwh": None,
        "variable_consumption_percent": None,
        "grid_shiftable_upper_bound_kwh": None,
        "variable_consumption_by_start": {},
        "grid_shiftable_by_start": {},
    }


def analyze_variable_consumption(
    consumption_statistics: list,
    cost_statistics: list | None = None,
) -> dict:
    """Estimate robust base load and the variable share of household demand."""
    points = _normalized_points(consumption_statistics)
    if not points:
        return _empty_result()

    night_values_by_date: dict = defaultdict(list)
    for start, value, local_date in points:
        if dt_util.as_local(start).hour in NIGHT_HOURS and value > 0.0:
            night_values_by_date[local_date].append(value)

    nightly_candidates = {
        local_date: median(values)
        for local_date, values in night_values_by_date.items()
        if len(values) >= MINIMUM_NIGHT_VALUES
    }
    valid_nights = len(nightly_candidates)
    if valid_nights < MINIMUM_VALID_NIGHTS:
        return _empty_result(valid_nights)

    fallback_baseline = median(nightly_candidates.values())
    observed_dates = {local_date for _, _, local_date in points}
    baseline_by_date = {}
    for local_date in observed_dates:
        window_start = local_date - timedelta(days=13)
        window_end = local_date + timedelta(days=14)
        window_candidates = [
            candidate
            for candidate_date, candidate in nightly_candidates.items()
            if window_start <= candidate_date <= window_end
        ]
        baseline_by_date[local_date] = median(window_candidates) if len(
            window_candidates
        ) >= MINIMUM_VALID_NIGHTS else fallback_baseline

    variable_by_start = {}
    baseline_consumption_kwh = 0.0
    variable_consumption_kwh = 0.0
    total_consumption_kwh = 0.0
    for start, value, local_date in points:
        baseline = baseline_by_date[local_date]
        baseline_energy = min(value, baseline)
        variable_energy = max(0.0, value - baseline)
        total_consumption_kwh += value
        baseline_consumption_kwh += baseline_energy
        variable_consumption_kwh += variable_energy
        variable_by_start[start] = variable_energy

    cost_by_start = {
        start: value
        for start, value, _ in _normalized_points(cost_statistics or [])
    }
    grid_shiftable_by_start = {
        start: min(cost_by_start[start], variable_energy)
        for start, variable_energy in variable_by_start.items()
        if start in cost_by_start
    }

    return {
        "base_load_kwh_per_hour": median(baseline_by_date.values()),
        "base_load_method": BASE_LOAD_METHOD,
        "base_load_status": BASE_LOAD_STATUS_AVAILABLE,
        "base_load_valid_nights": valid_nights,
        "baseline_consumption_kwh": baseline_consumption_kwh,
        "variable_consumption_kwh": variable_consumption_kwh,
        "variable_consumption_percent": (
            variable_consumption_kwh / total_consumption_kwh * 100.0
            if total_consumption_kwh > 0.0
            else None
        ),
        "grid_shiftable_upper_bound_kwh": sum(grid_shiftable_by_start.values()),
        "variable_consumption_by_start": variable_by_start,
        "grid_shiftable_by_start": grid_shiftable_by_start,
    }
