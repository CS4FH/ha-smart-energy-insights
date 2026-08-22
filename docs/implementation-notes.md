# Implementation Notes — Smart Energy Insights (Handoff for Chapter 5)

Fact base extracted from the Home Assistant integration repository
**`CS4FH/ha-smart-energy-insights`** (public GitHub, main branch). Use this file to write
**Chapter 5 — Software Architecture and Implementation** (`chapters/60_implementation.tex`,
`\label{chap:implementation}`) without re-reading the whole codebase.

> All statements below are grounded in the actual source. Where a file line range is given, it is
> the authoritative source. Describe *what the code does* — do not invent behaviour.

---

## 0. How to continue writing

- Target chapter length: **~18 pages** total. Section split (from `docs/thesis-outline.md`):
  - **5.1 Local Edge-Computing Architecture and Data Privacy Strategy** — ~3 p. (write first, 3–4 p. ok)
  - **5.2 Data Ingestion: Sensor APIs and CSV Load Profile Parsing** — ~4 p.
  - **5.3 Backend Development: Python Component and HA Long-Term Statistics** — ~6 p.
  - **5.4 Frontend Realisation: JavaScript Custom Lovelace Dashboards** — ~5 p.
- File to edit: `chapters/60_implementation.tex` (currently only `\TODO{}` placeholders + section labels).
- Writing rules: **British English**, spell out numbers 1–12 in prose (numerals for units/%/versions,
  e.g. `15`-minute, `20\%`), escape LaTeX specials (`&`, `%`, `_`, `$`, `#`), never invent `\cite{}`
  keys. See `.github/instructions/latex.instructions.md` and the `thesis-editing` skill.
- Figures: author (Christoph) will add screenshots. Reference `docs/images/*` from the repo where
  useful and leave `\TODO{figure}` markers with captions. Propose an architecture diagram for 5.1.
- Cross-refs already available: `\ref{chap:concept}` (Ch. 4), `\ref{chap:background}` (Ch. 3, incl.
  Home Assistant subsection `sec:bg:ha`).

### Resolved factual issues (author-confirmed)
1. **CSV delimiter = semicolon (`;`).** Authoritative. `const.py` now also defines
   `CSV_DELIMITER = ";"`, matching `csv_repository.parse_and_validate_csv` and all parser tests.
2. **No NILM.** The code contains **no disaggregation/NILM algorithm**; "monitored devices" are
   separate per-appliance energy sensors. Do **not** mention NILM in the thesis.

> **Post-refactor update (2026-08):** Several behaviours below were changed after the first draft of
> Chapter 5. The most important corrections are flagged inline with **[UPDATED]**: the timestamp
> convention is now consistently **interval-begin** (the old `+1h` interval-end was a bug and was
> removed); tariff inputs are **always gross** (the `inputs_are_net` toggle was removed and the tax
> rate now only grosses up the wholesale spot price); `SpotPriceSensor` is a **statistics carrier
> with no live state**; the flexibility/best-case figure is framed as a **theoretical upper bound**;
> and a **data-completeness warning banner** was added to the frontend.

---

## 1. High-level facts

- **Purpose:** local Home Assistant (HA) integration helping a household decide between a **fixed**
  and a **dynamic day-ahead (spot) electricity tariff**, using their own historical consumption
  (uploaded 15-minute CSV load profile **or** an existing HA energy sensor).
- **Distribution:** HACS custom integration; on setup it auto-registers a sidebar panel, a Lovelace
  dashboard and the custom card resource, and creates a `Spot Price` sensor.
- **Language split:** JavaScript ~58.7 %, Python ~41.3 %.
- **Requirements:** HA **2024.1.0+**, the `recorder` integration (long-term statistics, enabled by
  default via `default_config`), and internet access for the aWATTar API (Austrian market).
- **Author/supervision:** Christoph Seidlinger; supervisor FH-Prof. DI Dr. Alexander Nischelwitzer.

---

## 2. Repository / component layout

```
custom_components/smart_energy_insights/
  __init__.py                 # setup entry: static paths, HTTP views, panel, sensor platform
  const.py                    # DOMAIN, SPOT_API_URL, CSV constants, panel/card config
  config_flow.py              # ConfigFlow (pricing form at setup) + OptionsFlow (tariff parameters)
  sensor.py                   # SpotPriceSensor
  panel.py                    # Lovelace panel + dashboard + card-resource (register/cleanup)
  insights_view.py            # HTTP API views + analysis-response builder + heatmaps/metrics
  services/
    pricing_service.py        # PricingConfig, defaults, price heatmap, spot matches
    spot_price_service.py     # aWATTar fetch, EUR/MWh->ct/kWh, LTS import
    tariff_analysis_service.py# analyze_tariffs() — single source of truth for tariff comparison
  repositories/
    csv_repository.py         # parse_and_validate_csv (15-min -> hourly, heatmap)
    statistics_repository.py  # recorder wrappers (add/import/query LTS)
    cache_repository.py       # dashboard cache (active source, csv/sensor data)
    device_repository.py      # monitored-device persistence
  utils/translation.py        # async_translate
  www/                        # frontend (served under /smart_energy_insights)
    smart-energy-insights-card.js       # ~2941-line web component (main card)
    smart-energy-insights-api.js        # fetch wrappers to the HTTP API
    smart-energy-insights-heatmap.js    # generateHeatmapHTML (7x24 grid)
    smart-energy-insights-templates.js  # renderBaseCard, renderDashboardHtml
    smart-energy-insights-utils.js      # debounce, formatNumber, formatUploadDate
tests/                        # pytest suite (see §8)
docs/images/                  # screenshots (see §9)
```

---

## 3. Constants & configuration (`const.py`, `config_flow.py`, `pricing_service.py`)

- `DOMAIN = "smart_energy_insights"`
- `SPOT_API_URL = "https://api.awattar.at/v1/marketdata"`
- HTTP endpoints: `/api/smart_energy_insights/upload`, `/sensor`, `/devices`, `/device-analysis`
- CSV: `CSV_DELIMITER = ";"` **[UPDATED]** (parser and constant now agree),
  `TIMESTAMP_FORMAT = "%d.%m.%Y %H:%M"`, `ALLOWED_UNITS = ["KWH","kWh","kWH","KWh"]`,
  `CSV_COLUMNS_REQUIRED = ["Statistikzeitraum Beginn","Statistikzeitraum Ende","Wert","Einheit"]`,
  `MAX_UPLOAD_FILE_SIZE_MB = 50`.
- Panel/card: `PANEL_URL = "smart-energy-insights"`, `PANEL_ICON = "mdi:flash"`,
  `CARD_TYPE = "custom:smart-energy-insights-upload-card"`,
  `CARD_RESOURCE_URL = f"/{DOMAIN}/smart-energy-insights-card.js?v=..."` (versioned query for
  cache-busting), `STATISTICS_SOURCE = "smart_energy_insights"`.
- **Config flow [UPDATED]:** `SmartEnergyConfigFlow.async_step_user` now shows a **pricing form at
  setup time** (no longer an empty schema). The form is built by the shared helper
  `_build_pricing_schema(defaults=...)` and pre-fills the five tariff fields with
  `DEFAULT_PRICING_VALUES`. All five fields are `vol.Required` and coerced to `float`
  (`vol.Coerce(float)`). On submit, the values are stored in the config entry's **`data`** via
  `async_create_entry(title="Smart Energy Insights", data=user_input)`; `VERSION = 1`.
- **Options flow [UPDATED]:** `SmartEnergyOptionsFlow.async_step_init` re-uses the *same*
  `_build_pricing_schema` helper but seeds its defaults from the **current effective values**
  (`options` → entry `data` → `DEFAULT_PRICING_VALUES`), so re-configuring pre-fills the last saved
  settings. On submit it writes to the entry's **`options`** (`async_create_entry(title="", data=...)`).
  Reachable via Settings → Devices & Services → Configure.
- **Shared schema helper:** `_build_pricing_schema(*, defaults=None)` is the single source of truth for
  both flows; missing defaults fall back to `vol.UNDEFINED` (empty field). Precedence at read time in
  `get_pricing_config` is therefore **options → entry data → defaults** — and because the config flow
  now populates entry `data`, a fresh install already carries explicit tariff parameters rather than
  relying on the service-side defaults.
- **Default values** are defined **twice and must be kept in sync**: `DEFAULT_PRICING_VALUES` in
  `config_flow.py` and the `defaults` dict in `pricing_service.get_pricing_config`. Both currently
  agree.
- **Tariff options + defaults** (`_build_pricing_schema` / `DEFAULT_PRICING_VALUES` in `config_flow.py`,
  mirrored by `get_pricing_config`; options override entry data override defaults):

  | Option (`vol` key) | Meaning | Default |
  |---|---|---|
  | `fixed_price` | fixed tariff energy price (ct/kWh) | `15.0` |
  | `fixed_base_fee` | fixed tariff monthly base fee (€) | `5.0` |
  | `spot_markup` | supplier markup on spot (ct/kWh) | `1.5` |
  | `spot_base_fee` | dynamic tariff monthly base fee (€) | `2.5` |
  | `tax_rate` | tax that grosses up the **wholesale spot price** only (%) | `20.0` |

- **[UPDATED]** The `inputs_are_net` option was **removed**. All entered tariff parameters
  (`fixed_price`, `fixed_base_fee`, `spot_markup`, `spot_base_fee`) are treated as **gross**. The
  `tax_rate` is applied **only** to the net wholesale spot price to convert it to a gross retail
  price.
- `PricingConfig` is a frozen dataclass with those five numeric fields.

---

## 4. Data ingestion (Section 5.2)

### 4.1 CSV path (`csv_repository.parse_and_validate_csv`, L16–116)
- Reads with `csv.DictReader(..., delimiter=";")`; empty/`no fieldnames` → `api.error.empty_csv`.
- Validates required columns → `api.error.missing_columns` (lists missing columns).
- Per row: unit must be in allowed set (`{kwh}` ∪ lowercased allowed) → `api.error.invalid_unit`;
  begin/end timestamps required → `api.error.missing_timestamps`; parsed with `%d.%m.%Y %H:%M` →
  `api.error.invalid_date`; value parsed with **comma decimal** (`.replace(",", ".")`) →
  `api.error.invalid_value`.
- **15-minute → hourly aggregation:** each interval is added into `hourly_data[hour_start_local]`
  (floor to the hour, i.e. the interval's *begin* hour). Empty → `api.error.no_valid_rows`.
- Emits `statistics` list of `{start (UTC), state (hourly kWh), sum (running cumulative)}`, tz via
  `dt_util.get_default_time_zone()` then `as_utc`.
- Builds a **7×24 consumption heatmap** (`[weekday][hour]`, averaged). **[UPDATED]** Uses the
  **interval-begin convention**: an interval covering 13:00–14:00 is placed in the `13:00` bucket, so
  `weekday()`/`hour` are taken at the interval's begin. The old `+1h` interval-end offset was a bug
  and has been removed; ingestion, backend heatmaps and month bucketing now agree.
- Catch-all → `api.error.parse_failed` with the exception message.

### 4.2 Upload endpoint (`insights_view.SmartEnergyInsightsUploadView.post`, L171–285)
- JSON body with `active_source` → persists the chosen dashboard source and returns.
- Multipart file upload: enforces `MAX_UPLOAD_FILE_SIZE_MB` (413 `api.error.file_too_large`); decodes
  trying `utf-8, utf-8-sig, latin-1, iso-8859-1, cp1252` (else `api.error.encoding_not_supported`).
- Parses via `parse_and_validate_csv`; builds `StatisticMetaData(has_mean=False, has_sum=True,
  name="Load Profile", source=<safe_domain>, statistic_id="<safe_domain>:load_profile",
  unit_class="energy", unit_of_measurement="kWh")`; writes via `async_add_external_stats`.
- Then builds the analysis response and caches it (`active_source="csv"`).

### 4.3 Sensor path (`SmartEnergyInsightsSensorView`, `_get_energy_sensor`, `_statistics_from_rows`)
- Accepts cumulative energy sensors: `state_class` `total`/`total_increasing`, unit kWh (factor 1.0)
  or Wh (factor 0.001); **rejects power sensors** (test-confirmed).
- Imports up to the **last 12 months** of long-term statistics; converts rows to the same
  `{start, state, sum}` shape (`_statistics_from_rows`, differences from cumulative sums).

### 4.4 Monitored devices
- `SmartEnergyInsightsDevicesView` (GET/PUT) persists a device list; `SmartEnergyInsightsDeviceAnalysisView`
  returns **device-only** heatmaps (`_device_analysis_response`), no price heatmap. Enables a
  per-appliance breakdown. (This is NOT NILM — separate sensors, see open issue 2.)

---

## 5. Spot prices (`spot_price_service.py`) — part of 5.2/5.3

- `_fetch_spot_prices` (L70–102): calls aWATTar with `start`/`end` in **ms epoch**; for each point
  reads `start_timestamp` (ms) and `marketprice` (**EUR/MWh**); converts to **ct/kWh via `* 0.1`**;
  returns sorted `[{start (UTC datetime), value (ct/kWh)}]`.
- `_get_spot_price_statistic_id`: resolves entity id from unique_id `f"{entry_id}_sei_spot_price"`.
- `_get_existing_price_starts`: queries existing LTS to support `missing_only` (idempotent import,
  no duplicates).
- `_write_price_statistics` (L105–172): `StatisticMetaData(has_mean=True, has_sum=False,
  mean_type=StatisticMeanType.ARITHMETIC, name="Spot Price", source="recorder",
  unit_of_measurement="ct/kWh")`; each point → `StatisticData(start, mean=value)`; imported via
  `async_import_stats`.
- `async_import_spot_prices_for_range` (L174–221): orchestrates fetch → dedupe (`missing_only`) →
  write; returns `{imported_count, average_price, series_count, series}`.

---

## 6. Backend analysis (Section 5.3)

### 6.1 Recorder wrappers (`statistics_repository.py`)
- `async_add_external_stats` / `async_import_stats` — call HA's `async_add_external_statistics` /
  `async_import_statistics`, awaiting if the result is awaitable (sync/async compatibility shim).
- `async_get_statistics_during_period` — runs `statistics_during_period` on the recorder executor
  thread (`get_instance(hass).async_add_executor_job`).

### 6.2 Response builder (`insights_view._build_analysis_response`, L668–772)
Pipeline for a loaded profile:
1. import spot prices for `[first_start, last_start + 1h)` (`missing_only=True`);
2. `price_series = price_result["series"]`; `pricing_config = get_pricing_config(hass)`;
3. `build_price_heatmap`, `_build_consumption_heatmap`, `_build_seasonal_heatmaps`;
4. `_calculate_summary`, `_derive_consumption_metrics`, `_derive_price_metrics`;
5. `analyze_tariffs(statistics, price_series, pricing_config)` — the canonical result. **[UPDATED]**
   (no `inputs_are_net` argument).
Returns a large JSON dict consumed by the frontend (totals, monthly comparison, KPIs, heatmaps,
tariff parameters echoed back: `fixed_price_ct`, `fixed_base_fee_eur`, `spot_markup_ct`,
`spot_base_fee_eur`, `tax_rate`). **[UPDATED]** (`inputs_are_net` no longer echoed).

### 6.3 Derived metrics (helpers in `insights_view.py`)
- `_calculate_summary` (L339–410): total/avg per hour/day, `peak_hour`, weekday vs weekend averages.
- `_derive_consumption_metrics`: peak value and first peak timestamp only.
- `analyze_variable_consumption` in `consumption_metrics_service.py` estimates physical base load from
  the reconstructed total household profile. For each local day, it takes the median of the positive
  values between 00:00 and 05:59 when at least three such values exist. At least seven valid nights
  are required. Daily candidates are smoothed with a centered 28-day median; sparse edge windows
  fall back to the median of all valid nightly candidates in the selected period.
- Hourly baseline energy is `min(total_load, daily_baseline)` and variable energy is
  `max(0, total_load - daily_baseline)`. `variable_consumption_percent` is therefore a theoretical
  upper bound for the variable share, not a classification of technically shiftable devices.
- `_derive_price_metrics` (L432–468): spot-price stddev; `avg_daily_price_spread_ct_kwh` = mean of
  daily (max−min) spot price.
- `_build_consumption_heatmap` (L286–306): 7×24 average, **[UPDATED]** interval-begin bucketing
  (no `+1h` offset).
- `_build_seasonal_heatmaps` / `HEATMAP_SEASONS`: northern-hemisphere seasons (spring 3–5, summer
  6–8, autumn 9–11, winter 12/1/2; whole year = all months).

### 6.4 `analyze_tariffs` — the cost model (Section 5.3 / Ch. 4.2 maths). File: `tariff_analysis_service.py`
Docstring: *"single source of truth for tariff comparisons."* Signature: **[UPDATED]**
`analyze_tariffs(statistics, price_series, pricing_config, range_start=None, range_end=None,
grid_shiftable_by_start=None) -> dict`
(no `inputs_are_net`).

Key mechanics (line ranges authoritative):
- **Matching (L11–47):** builds `price_dict = {start: value}`; keeps only stats whose `start` has a
  matching spot price → `matched_points = [(start, consumption, spot_price)]`. `matched_hours`,
  `matched_consumption`, `base_spot_cost_cents = Σ consumption*spot_price`,
  `duration_months = matched_hours / 730.5`, `total_consumption_kwh`. For a selected analysis range,
  `expected_hours` covers the complete half-open interval `[range_start, range_end)` rather than
  shrinking to the first and last available measurement; the legacy measurement-bound fallback is
  retained for callers without explicit bounds. `data_completeness_ratio =
  consumption_hours/expected_hours` therefore includes missing hours at either edge.
- **Gross prices and taxation (L50–69) [UPDATED]:** `tax_multiplier = 1 + tax_rate/100` is applied
  **only to the wholesale spot price** (always, not conditionally). All entered tariff parameters are
  already gross: `fix_price`, `fix_base`, `spot_markup`, `spot_base` are used as-is. Base fees spread
  per hour: `fix_base_per_hour = duration_months*fix_base/matched_hours` (same for spot).
- **Per-hour costs (L89–105) [UPDATED]:** month bucket via **interval-begin** (`as_local(start)`, no
  `+1h`).
  - `fixed_cost_hour  = consumption*fix_price/100 + fix_base_per_hour`
  - `spot_energy_price = spot_price*tax_multiplier + spot_markup`
  - `spot_cost_hour   = consumption*spot_energy_price/100 + spot_base_per_hour`
  - `delta_hour = spot_cost_hour − fixed_cost_hour` (negative ⇒ spot cheaper)
  - counts `cheaper_hours`, `negative_price_hours`; tracks min/max spot price + timestamps.
- **Aggregation:** monthly `{matched_hours, fixed_cost_eur, spot_cost_eur, delta_eur}` and totals
  `fixed_total_eur`, `spot_total_eur`, `delta_total_eur`, `total_savings_eur = max(0,−delta)`,
  `total_extra_cost_eur = max(0,delta)`.
- **Break-even fixed price (L129–144):** average spot cost per kWh (net/gross-adjusted) + markup +
  base-fee-difference term spread over consumption ⇒ the fixed ct/kWh at which both tariffs cost the
  same. `spot_cheaper_share = cheaper_hours/matched_hours`.
- **Effective spot price (L144–150):** consumption-weighted `Σ consumption*(spot*tax+markup)/matched_consumption`.
- **Variable consumption and projection input:** physical variable consumption is calculated before
  tariff analysis from the total household profile. Per timestamp it is capped by cost-relevant grid
  draw: `grid_shiftable = min(grid_draw, variable_consumption)`. `analyze_tariffs` uses only capped
  timestamps that also have a matching spot price. Without at least seven valid nights, this input and
  the derived best-/worst-case projection remain unavailable. `price_sensitivity_percent =
  (break_even/effective_spot − 1)*100` is independent of this estimate.
- **Daily 6-hour windows (L176–226):** per day, adjusted prices (`price*tax+markup`); cheapest and
  most expensive **6 hours** averaged → `avg_cheapest_daily_price_ct_kwh` /
  `avg_most_expensive_daily_price_ct_kwh`. `max_extra_savings_eur = matched_grid_shiftable*(effective−cheapest)/100`;
  `max_penalty_risk_eur = matched_grid_shiftable*(expensive−effective)/100`.
- **Exposure (L227–246):** per day, sort matched points by price, take min(6,n): `off_peak_kwh` =
  cheapest 6h consumption, `peak_exposure_kwh` = most-expensive 6h; shares over `matched_consumption`.
- **Return dict (L246–286):** all of the above incl. `monthly`, `monthly_tariff_comparison`,
  `tariff_totals`, min/max spot price + `_at` timestamps.

---

## 7. Frontend (Section 5.4)

- **Serving/registration:** `__init__.async_setup_entry` registers static path `/smart_energy_insights`
  → `www/`; `panel.py` registers the card **resource** (versioned URL, removes stale versions),
  creates a dedicated **storage-mode Lovelace dashboard** with a single panel view containing the
  card, and registers the **built-in sidebar panel**; symmetric cleanup on unload/remove.
- **Sensor entity [UPDATED]:** `SpotPriceSensor` — `unique_id = f"{entry_id}_sei_spot_price"`, name
  `Spot Price`, unit `ct/kWh`; stores its `entity_id` in cache. It is a **statistics carrier only**:
  it deliberately provides **no live/continuously updated state** and exists solely as a stable
  anchor entity for the long-term spot-price statistics. Do **not** describe it as showing the
  current market price live.
- **Custom element:** `SmartEnergyInsightsUploadCard extends HTMLElement`, registered as
  `smart-energy-insights-upload-card` and pushed to `window.customCards`. Loads persisted heatmaps
  and monitored devices on first `hass`.
- **API module (`smart-energy-insights-api.js`):** `setActiveSource`, `uploadCsv` (multipart),
  `loadHeatmaps`, `loadSensorData`, `loadMonitoredDevices`, `saveMonitoredDevices`,
  `loadDeviceAnalysis` — all via `hass.fetchWithAuth`.
- **Templates:** `renderBaseCard` (source chooser: sensor vs CSV tabs, sensor picker, monitored
  devices), `renderDashboardHtml` (savings banner + a collapsible "detailed analysis" island with
  four tabs).
- **Analysis-period calendar [UPDATED]:** a compact, collapsible custom day-range picker is rendered
  above the dashboard. It has no presets or time-of-day controls. Start and end dates are inclusive
  in the UI and converted to the backend's half-open `[start, end)` range. Days with at least one
  total-consumption value are selectable: complete local days have a green marker, partial days a
  yellow half-filled marker, and days without data are disabled. Local-day expectations are
  DST-aware (23, 24 or 25 hours). Selection is a draft until **Apply** is pressed; reset restores the
  full available period. The applied range is persisted per CSV/sensor source, included in
  monitored-device and consumption-source analysis requests, and protected against stale main
  responses by a monotonically increasing request generation.
- **Four dashboard tabs:** `monthly` (Monthly comparison), `usage` (Usage behaviour: seasonal
  heatmaps), `risk` (Risk & optimisation: cost-projection range + timing profile), `technical`
  (Technical details: raw figures + tariff parameters).
- **Hero cards / savings banner (`updateSavingsBanner`) [UPDATED]:** status-quo fixed vs spot
  projection, plus **Best Case (Theoretical Max.)** = `currentDelta − |maxExtraSavings|` and **Worst
  Case (Risk)** = `currentDelta + |maxPenaltyRisk|` (load-shifting effects on top of status quo); the
  best case is explicitly labelled as a theoretical maximum, not a guaranteed outcome. A
  **data-completeness warning banner** is shown when the spot-price coverage
  (`data_completeness_ratio`) is low, cautioning that the comparison is based on partial data.
- **Heatmaps (`generateHeatmapHTML`):** 7×24 grid; robust scaling via **P02/P98** percentiles unless
  a fixed scale is passed; German default day labels (`Mo…So`, overridable); an "optimization"
  colour mode with a diverging red→neutral→green legend. Interactive modes:
  - consumption: `absolute` vs `relative_mean`;
  - spot price: `absolute` vs `fixed` (delta to break-even/fixed);
  - optimisation: `cost_gradient` (consumption×price) vs `shift_score` (load-shift potential).
- **Client-side computations in the card:** `computeCostImpactHeatmap`, `computeLoadShiftPotentialHeatmap`,
  `computePriceDeltaHeatmap`, `computeConsumptionDisplayHeatmap`, symmetric/robust/absolute scale
  helpers, seasonal coverage warnings (<50 % of a season's hours flagged).
- **UI state** persisted in `localStorage["sei_ui_state"]` (active source, selected season/modes,
  active tab, analysis-open, selected sensor/consumption profile, and applied range per source).
- **Utils:** `formatNumber` uses **comma decimal** (European); `formatUploadDate`; `debounce`.
- **i18n:** all strings via `this.localize(key, fallback, placeholders)`; English fallbacks in code.

---

## 8. Tests (`tests/`, pytest) — evidence of behaviour for the text

- `test_csv_parser.py` — success path, empty/missing columns, invalid unit/date/value, missing
  timestamps, running-sum aggregation, heatmap interval-begin placement **[UPDATED]**, catch-all.
- `test_pricing_service.py` — defaults vs option override; `compute_spot_price_matches`.
- `test_spot_price_service.py` — EUR/MWh→ct/kWh conversion, `missing_only` dedupe, empty API,
  metadata (`unit_of_measurement == "ct/kWh"`, arithmetic mean).
- `test_tariff_analysis_service.py` — monthly/total consistency, no-match handling, negative prices +
  completeness gap, explicit-range edge gaps, daily-6h risk metrics, weighted peak/off-peak exposure.
- `test_date_range_coverage.py` — local-day availability, duplicate-hour handling, partial days and
  23/25-hour DST transitions.
- `test_statistics_repository.py` — sync/async add/import, query on executor.
- `test_monitored_devices.py` — energy-sensor acceptance (kWh/Wh), power-sensor rejection,
  device-only heatmaps, completeness ratio.
- `test_seasonal_heatmaps.py` — northern-hemisphere months.

---

## 9. Available screenshots (`docs/images/` in the repo)

`ChooseDataSource.png`, `CSVUpload.png`, `HeroCard.png`, `monthly.png`, `UsageBehaviour.png`,
`RiskAndOptimization.png`, `TechnicalDetails.png`. Map these to 5.4 (frontend/tabs) and 5.1 (data
source selection / architecture overview).

---

## 10. Suggested narrative per section (for the writer)

- **5.1 Architecture & privacy (write first, 3–4 p.):** motivate the **local edge** approach — all
  consumption processing happens inside the household's HA instance; the only outbound call is to the
  public aWATTar market-price API (no consumption data leaves the home). Cover: HA custom-integration
  model, the `recorder`/long-term-statistics backbone, the component boundaries (views → services →
  repositories), static serving of the frontend, and auto-registration of panel/dashboard/card. End
  with a data-flow/architecture diagram (`\TODO{figure}`) and the privacy argument (data minimisation,
  local storage, no third-party consumption transfer, only anonymous market prices fetched).
- **5.2 Ingestion:** dual source (CSV vs sensor), the Austrian 15-minute format, 15-min→hourly
  aggregation, unit/tz handling, robust decoding, LTS as the common storage; idempotent spot-price
  import.
- **5.3 Backend:** the views→services→repositories layering, HA LTS integration, and a focused
  walkthrough of `analyze_tariffs` (cost equations, break-even, flexibility, exposure, best/worst
  case) — the analytical heart; reference Ch. 4.2 for the formal maths.
- **5.4 Frontend:** the custom Lovelace web component, four-tab dashboard, interactive seasonal
  heatmaps and their client-side transforms, hero-card best/worst-case logic, and UI-state
  persistence; use screenshots.
