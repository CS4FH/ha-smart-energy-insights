DOMAIN = "smart_energy_insights"

SPOT_API_URL = "https://api.awattar.at/v1/marketdata"

# CSV Upload Configuration
UPLOAD_API_ENDPOINT = "/api/smart_energy_insights/upload"
UPLOAD_API_NAME = "api:smart_energy_insights:upload"

# Sensor Import Configuration
SENSOR_API_ENDPOINT = "/api/smart_energy_insights/sensor"
SENSOR_API_NAME = "api:smart_energy_insights:sensor"

# Monitored device configuration and analysis
DEVICES_API_ENDPOINT = "/api/smart_energy_insights/devices"
DEVICE_ANALYSIS_API_ENDPOINT = "/api/smart_energy_insights/device-analysis"

# Consumption source configuration and analysis (Bezugsquellen: additional
# whole-home energy sources such as a second smart meter, PV self-consumption
# or battery discharge, summed into total consumption; independently flagged
# as cost-relevant or not)
CONSUMPTION_SOURCES_API_ENDPOINT = "/api/smart_energy_insights/consumption-sources"
CONSUMPTION_SOURCE_ANALYSIS_API_ENDPOINT = "/api/smart_energy_insights/consumption-source-analysis"

# CSV Parsing Configuration
CSV_DELIMITER = ";"
TIMESTAMP_FORMAT = "%d.%m.%Y %H:%M"
ALLOWED_UNITS = ["kWh"]  # Compared case-insensitively, see csv_repository.py

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
CARD_RESOURCE_URL = f"/{DOMAIN}/smart-energy-insights-card.js?v=20260724o"
CARD_TYPE = "custom:smart-energy-insights-upload-card"
CARD_TITLE = "Load Profile Upload"