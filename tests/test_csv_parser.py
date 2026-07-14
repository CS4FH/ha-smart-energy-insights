from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch
import pytest

from custom_components.smart_energy_insights.repositories.csv_repository import parse_and_validate_csv #todo: refactor to utils


@pytest.fixture(autouse=True)
def mock_csv_constants():
    """Patch constants to isolate parser testing from changes in const.py."""
    path = "custom_components.smart_energy_insights.repositories.csv_repository"
    with patch(f"{path}.CSV_COLUMNS_REQUIRED", ["Statistikzeitraum Beginn", "Statistikzeitraum Ende", "Einheit", "Wert"]), \
         patch(f"{path}.ALLOWED_UNITS", {"kwh", "wh"}):
        yield


def test_parse_successful_valid_csv() -> None:
    """Verify successful end-to-end parsing, state calculation, and heatmap generation."""
    csv_content = (
        "Statistikzeitraum Beginn;Statistikzeitraum Ende;Einheit;Wert\n"
        "01.01.2026 00:00;01.01.2026 01:00;kWh;1,5\n"
        "01.01.2026 01:00;01.01.2026 02:00;kWh;2,5\n"
    )

    result = parse_and_validate_csv(csv_content)

    assert "error_key" not in result
    assert "statistics" in result
    assert "consumption_heatmap" in result

    stats = result["statistics"]
    assert len(stats) == 2
    assert stats[0]["state"] == 1.5
    assert stats[0]["sum"] == 1.5
    assert stats[1]["state"] == 2.5
    assert stats[1]["sum"] == 4.0  # Running sum aggregation

    # 01.01.2026 is a Thursday (Index 3)
    heatmap = result["consumption_heatmap"]
    assert heatmap[3][1] == 1.5  # Interval 00:00-01:00 shown at 01:00
    assert heatmap[3][2] == 2.5  # Interval 01:00-02:00 shown at 02:00


def test_parse_empty_csv() -> None:
    """Verify error response when parsing completely empty contents."""
    result = parse_and_validate_csv("")
    assert result["error_key"] == "api.error.empty_csv"


def test_parse_missing_columns() -> None:
    """Verify detection of missing required columns."""
    csv_content = "Statistikzeitraum Beginn;Einheit;Wert\n"
    result = parse_and_validate_csv(csv_content)
    
    assert result["error_key"] == "api.error.missing_columns"
    assert "Statistikzeitraum Ende" in result["error_placeholders"]["columns"]


def test_parse_invalid_unit() -> None:
    """Verify error reporting when encountering an unallowed measurement unit."""
    csv_content = (
        "Statistikzeitraum Beginn;Statistikzeitraum Ende;Einheit;Wert\n"
        "01.01.2026 00:00;01.01.2026 01:00;INVALID_UNIT;1,5\n"
    )
    result = parse_and_validate_csv(csv_content)
    
    assert result["error_key"] == "api.error.invalid_unit"
    assert result["error_placeholders"]["row"] == 1
    assert result["error_placeholders"]["unit"] == "invalid_unit"


def test_parse_missing_timestamps() -> None:
    """Verify detection of missing or blank timestamp cells."""
    csv_content = (
        "Statistikzeitraum Beginn;Statistikzeitraum Ende;Einheit;Wert\n"
        ";01.01.2026 01:00;kWh;1,5\n"
    )
    result = parse_and_validate_csv(csv_content)
    assert result["error_key"] == "api.error.missing_timestamps"


def test_parse_invalid_date_format() -> None:
    """Verify error reporting for unparseable timestamp strings."""
    csv_content = (
        "Statistikzeitraum Beginn;Statistikzeitraum Ende;Einheit;Wert\n"
        "2026-01-01 00:00;01.01.2026 01:00;kWh;1,5\n"
    )
    result = parse_and_validate_csv(csv_content)
    assert result["error_key"] == "api.error.invalid_date"


def test_parse_invalid_value() -> None:
    """Verify error response when float conversion fails for numerical values."""
    csv_content = (
        "Statistikzeitraum Beginn;Statistikzeitraum Ende;Einheit;Wert\n"
        "01.01.2026 00:00;01.01.2026 01:00;kWh;text_value\n"
    )
    result = parse_and_validate_csv(csv_content)
    assert result["error_key"] == "api.error.invalid_value"


def test_parse_unexpected_exception() -> None:
    """Verify catch-all exception handling works gracefully during general processing failures."""
    with patch("csv.DictReader", side_effect=RuntimeError("Fatal error")):
        result = parse_and_validate_csv("valid;csv;content;here")
        assert result["error_key"] == "api.error.parse_failed"
        assert result["error_placeholders"]["message"] == "Fatal error"