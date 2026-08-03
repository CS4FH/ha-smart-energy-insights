"""CSV parsing and validation for load profiles."""

import csv
import io
import logging
from datetime import datetime

from homeassistant.util import dt as dt_util

from ..const import ALLOWED_UNITS, CSV_COLUMNS_REQUIRED, CSV_DELIMITER

_LOGGER = logging.getLogger(__name__)


def parse_and_validate_csv(csv_content: str) -> dict:
    try:
        csv_reader = csv.DictReader(io.StringIO(csv_content), delimiter=CSV_DELIMITER)
        if not csv_reader.fieldnames:
            return {"error_key": "api.error.empty_csv"}

        missing_cols = set(CSV_COLUMNS_REQUIRED) - set(csv_reader.fieldnames or [])
        if missing_cols:
            return {
                "error_key": "api.error.missing_columns",
                "error_placeholders": {"columns": ", ".join(sorted(missing_cols))},
            }

        allowed_units = {u.lower() for u in ALLOWED_UNITS}
        hourly_data = {}
        row_count = 0

        for row in csv_reader:
            row_count += 1
            unit = row.get("Einheit", "").strip().lower()
            if unit not in allowed_units:
                return {
                    "error_key": "api.error.invalid_unit",
                    "error_placeholders": {"row": row_count, "unit": unit},
                }

            begin_str = row.get("Statistikzeitraum Beginn", "").strip()
            end_str = row.get("Statistikzeitraum Ende", "").strip()
            if not begin_str or not end_str:
                return {
                    "error_key": "api.error.missing_timestamps",
                    "error_placeholders": {"row": row_count},
                }

            try:
                fmt = "%d.%m.%Y %H:%M"
                begin_local = datetime.strptime(begin_str, fmt)
                end_local = datetime.strptime(end_str, fmt)
                del end_local
            except ValueError:
                return {
                    "error_key": "api.error.invalid_date",
                    "error_placeholders": {"row": row_count},
                }

            try:
                value = float(row.get("Wert", "").strip().replace(",", "."))
            except ValueError:
                return {
                    "error_key": "api.error.invalid_value",
                    "error_placeholders": {"row": row_count},
                }

            hour_start_local = begin_local.replace(minute=0, second=0, microsecond=0)
            if hour_start_local not in hourly_data:
                hourly_data[hour_start_local] = 0.0
            hourly_data[hour_start_local] += value

        if not hourly_data:
            return {"error_key": "api.error.no_valid_rows"}

        statistics = []
        running_sum = 0.0
        tz = dt_util.get_default_time_zone()
        for hour_local in sorted(hourly_data.keys()):
            hourly_value = hourly_data[hour_local]
            running_sum += hourly_value
            hour_utc = dt_util.as_utc(hour_local.replace(tzinfo=tz))
            statistics.append(
                {"start": hour_utc, "state": hourly_value, "sum": running_sum}
            )

        heatmap_sums = {d: {h: 0.0 for h in range(24)} for d in range(7)}
        heatmap_counts = {d: {h: 0 for h in range(24)} for d in range(7)}
        for hour_local, val in hourly_data.items():
            # hour_local is already the interval-begin hour; attribute directly.
            d = hour_local.weekday()
            h = hour_local.hour
            heatmap_sums[d][h] += val
            heatmap_counts[d][h] += 1

        consumption_heatmap = []
        for d in range(7):
            row = []
            for h in range(24):
                avg = (
                    heatmap_sums[d][h] / heatmap_counts[d][h]
                    if heatmap_counts[d][h] > 0
                    else 0
                )
                row.append(round(avg, 3))
            consumption_heatmap.append(row)

        return {"statistics": statistics, "consumption_heatmap": consumption_heatmap}

    except Exception as err:
        _LOGGER.error("CSV error: %s", err)
        return {
            "error_key": "api.error.parse_failed",
            "error_placeholders": {"message": str(err)},
        }
