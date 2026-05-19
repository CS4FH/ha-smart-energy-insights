DOMAIN = "smart_energy_insights"

SPOT_API_URL = "https://api.awattar.at/v1/marketdata"

# CSV Upload Configuration
UPLOAD_API_ENDPOINT = "/api/smart_energy_insights/upload"
UPLOAD_API_NAME = "api:smart_energy_insights:upload"

# CSV Parsing Configuration
CSV_DELIMITER = "\t"
TIMESTAMP_FORMAT = "%d.%m.%Y %H:%M"
ALLOWED_UNITS = ["KWH", "kWh", "kWH", "KWh"]  # Case-insensitive handling
DEFAULT_OBIS_CODE = "1.8.0"  # Positive active energy (import)
ALLOWED_OBIS_CODES = ["1.8.0", "1.8.1", "1.8.2"]  # Import codes

# CSV Column Names (exact matching)
CSV_COLUMNS_REQUIRED = [
    "Statistikzeitraum Beginn",
    "Statistikzeitraum Ende",
    "Wert",
    "Einheit",
]

# Statistics Configuration
MAX_UPLOAD_FILE_SIZE_MB = 50
STATISTICS_SOURCE = "smart_energy_insights"

# Panel Configuration
PANEL_TITLE = "Smart Energy Insights"
PANEL_ICON = "mdi:flash"
PANEL_URL = "smart-energy-insights"
PANEL_SETUP_KEY = "panel_setup_complete"  # Guard key for one-time setup
CARD_RESOURCE_URL = f"/{DOMAIN}/smart-energy-insights-card.js"
CARD_TYPE = "custom:smart-energy-insights-upload-card"
CARD_TITLE = "Load Profile Upload"