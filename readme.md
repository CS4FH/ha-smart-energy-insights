# Smart Energy Insights

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

A decision support tool for analyzing household electricity consumption, load shifting, and the evaluation of dynamic tariffs.

## 📌 Project Overview
This Home Assistant integration is being developed as part of a Master's Thesis at FH JOANNEUM. The goal is to empower households to minimize energy costs through data-driven tariff selection and targeted load shifting.

## 🛠 Features (Planned)
* **Tariff Simulation:** Compare historical consumption against real-time EPEX SPOT prices.
* **Load Analysis:** Identify major consumers using Non-Intrusive Load Monitoring (NILM).
* **Automation:** Direct control or "nudging" via notifications to shift loads into cheap time windows.
* **Historical Data Import:** Upload CSV load profiles (15-minute resolution) for retrospective simulations.

## 🚀 Installation
1. Open **HACS** in Home Assistant.
2. Navigate to **Integrations** -> **Custom repositories** (three-dot menu).
3. Add this repository URL and select `Integration` as the category.
4. Click **Install** and restart Home Assistant.

## 📤 Historical Data Import (Cold Start)

### CSV File Format

The integration supports importing historical load profiles from CSV files with the following format:

| Column Name | Format | Example |
|---|---|---|
| `Anlagennummer` | String | 24713092 |
| `Zählpunkt` | String | AT0082300804600000000000000141519 |
| `Tarif` | String | (optional) |
| `Statistikzeitraum Beginn` | `DD.MM.YYYY HH:MM` | 01.01.2025 00:00 |
| `Statistikzeitraum Ende` | `DD.MM.YYYY HH:MM` | 01.01.2025 00:15 |
| `Wert` | Number (comma as decimal) | 0,135 |
| `Einheit` | String | kWh |
| `Messart` | String (optional) | VAL |

**Requirements:**
* Delimiter: **Tab** (`\t`)
* Time intervals: **15 minutes** exactly
* Unit: **kWh** (case-insensitive)
* Timestamps: **Local timezone** (will be converted to UTC)
* Numeric values: Comma (`,`) as decimal separator

### Using the Upload Panel

Once you add the Smart Energy Insights integration to Home Assistant, a new panel titled **"Smart Energy Insights"** automatically appears in the sidebar. This panel provides an easy-to-use interface for uploading CSV load profiles:

1. Navigate to **Smart Energy Insights** in the sidebar.
2. Drag and drop a CSV file onto the upload area or click to select one.
3. Click **Upload** to import the load profile.

**No manual configuration is required.** The custom card resource and panel are registered automatically during integration setup.

**Supported OBIS Codes:**
* `1.8.0` — Positive active energy (import) — **[Default]**
* `1.8.1` — Positive active energy, tariff 1
* `1.8.2` — Positive active energy, tariff 2

### Direct API Usage

For automated imports or testing, POST your CSV file to the endpoint:

```bash
curl -X POST \
  -H "Authorization: Bearer <HA_TOKEN>" \
  -F "file=@load_profile.csv" \
  -F "obis_code=1.8.0" \
  http://<home-assistant-host>:8123/api/smart_energy_insights/upload
```

**Response (Success):**

```json
{
  "success": true,
  "count": 96,
  "statistic_id": "smart_energy_insights:load_profile_1_8_0",
  "start": "2025-01-01T00:00:00+00:00",
  "end": "2025-01-01T23:45:00+00:00"
}
```

**Response (Error):**

```json
{
  "error": "Invalid unit 'Wh'. Expected 'kWh'"
}
```

### Imported Statistics

Once imported, load profile data is stored as Home Assistant Long-Term Statistics and can be:
* Queried in the **Developer Tools** → **Statistics** panel
* Used in automations via `template` sensors
* Processed by the *Economic Simulation Core* for cost analysis

The statistics are stored with:
* **statistic_id:** `smart_energy_insights:load_profile_<OBIS_CODE>`
* **Unit:** `kWh`
* **Type:** Sum (cumulative energy)

## 🏗 Setup & Requirements
This integration is designed to run locally on hardware ranging from **Raspberry Pi** to **x86 systems**. It supports data acquisition via:
* **P1 Interface:** For high-resolution local data.
* **EDA Portal:** For 15-minute resolution cloud profiles.
* **CSV Upload:** For historical load profiles and cold-start scenarios.

---
*Created by Christoph Seidlinger as part of the Master's Program Software and Digital Experience Engineering.*