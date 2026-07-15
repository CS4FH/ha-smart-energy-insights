/**
 * Smart Energy Insights - Load Profile CSV Upload Card
 */

import {
  loadHeatmaps,
  loadSensorData,
  setActiveSource,
  uploadCsv
} from "./smart-energy-insights-api.js";
import { generateHeatmapHTML } from "./smart-energy-insights-heatmap.js";
import { renderBaseCard, renderDashboardHtml } from "./smart-energy-insights-templates.js";
import { formatNumber, formatUploadDate } from "./smart-energy-insights-utils.js";

class SmartEnergyInsightsUploadCard extends HTMLElement {
  setConfig(config) {
    this.config = config;
  }

  connectedCallback() {
    if (!this.contentAdded) {
      this.render();
      this.contentAdded = true;
    }
  }

  set hass(hass) {
    const isFirstLoad = !this._hass;
    this._hass = hass;
    if (isFirstLoad) {
      this.loadHeatmapsFromBackend();
    }
    if (this.contentAdded) {
      this.syncSensorPicker();
    }
  }

  localize(key, fallback, placeholders) {
    const fullKey = `component.smart_energy_insights.${key}`;
    let text = fallback;
    if (this._hass && typeof this._hass.localize === "function") {
      const localized = this._hass.localize(fullKey);
      if (localized && localized !== fullKey) {
        text = localized;
      }
    }

    if (placeholders) {
      Object.entries(placeholders).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value));
      });
    }

    return text;
  }

  getTexts() {
    return {
      sourceTitle: this.localize("card.source_title", "Choose data source"),
      dashboardTitle: this.localize("panel.title", "Smart Energy Insights"),
      sourceStateLoading: this.localize("card.source_state_loading", "No source loaded"),
      sourceStateSensor: (name) => this.localize("card.source_state_sensor", "Sensor: {name}", { name }),
      sourceStateCsv: (name) => this.localize("card.source_state_csv", "CSV File: {name}", { name }),
      integrationSettingsLabel: this.localize("card.integration_settings_label", "Open integration settings"),
      sourceDescription: this.localize(
        "card.source_description",
        "Select how you want to load your profile. You can switch at any time."
      ),
      sourceLabel: this.localize("card.source_label", "Data source"),
      sourceSelectLabel: this.localize("card.source_select_label", "Source"),
      sourceCsv: this.localize("card.source_csv", "CSV"),
      sourceSensor: this.localize("card.source_sensor", "Sensor"),
      sourceCsvTitle: this.localize("card.source_csv_title", "Upload CSV"),
      sourceCsvDescription: this.localize(
        "card.source_csv_description",
        "Upload a load profile CSV to analyze past consumption."
      ),
      sourceSensorTitle: this.localize("card.source_sensor_title", "Use a sensor"),
      sourceSensorDescription: this.localize(
        "card.source_sensor_description",
        "Select an energy sensor and load the last 12 months."
      ),
      sensorCardTitle: this.localize("card.sensor_card_title", "Choose a sensor"),
      sensorPickerLabel: this.localize("card.sensor_picker_label", "Select energy sensor"),
      sensorPickerPlaceholder: this.localize("card.sensor_picker_placeholder", "Choose a sensor"),
      sensorHint: this.localize(
        "card.sensor_hint",
        "Uses up to the last 12 months of statistics."
      ),
      sensorNoneOption: this.localize(
        "card.sensor_none_option",
        "No compatible sensor available"
      ),
      sensorLoading: this.localize("card.sensor_loading", "Loading sensor data..."),
      sensorNoData: this.localize("card.sensor_no_data", "No statistics found for this sensor."),
      sensorInvalid: this.localize(
        "card.sensor_invalid",
        "Selected entity is not a supported energy sensor."
      ),
      sensorLoaded: this.localize("card.sensor_loaded", "Sensor data loaded."),
      sensorLoadButton: this.localize("card.sensor_load_button", "Load profile"),
      uploadTitle: this.localize("card.upload_title", "Upload new CSV"),
      uploadPrompt: this.localize("card.upload_prompt", "Drag & Drop or"),
      uploadFileSelect: this.localize("card.upload_file_select", "Choose file"),
      fileLabel: this.localize("card.file_label", "File:"),
      uploadingLabel: this.localize("card.uploading_label", "Uploading: {percent}%", { percent: 0 }),
      uploadButton: this.localize("card.upload_button", "Upload"),
      cancelButton: this.localize("card.cancel_button", "Cancel"),
      invalidFile: this.localize("card.invalid_file", "Please select a CSV file."),
      uploadSuccessTitle: this.localize("card.upload_success_title", "Upload succeeded!"),
      uploadSuccessMessage: (count) =>
        this.localize("card.upload_success_message", "{count} values were imported.", { count }),
      uploadErrorTitle: this.localize("card.upload_error_title", "Upload failed"),
      uploadAnotherTitle: this.localize("card.upload_another_title", "Upload another load profile"),
      profileDefaultFilename: this.localize("card.profile_default_filename", "Profile_loaded.csv"),
      lastImported: this.localize("card.last_imported", "Last imported"),
      profileTitle: this.localize("card.profile_title", "Current load profile:"),
      profileMeta: ({ count, start, end, uploadDate }) =>
        this.localize(
          "card.profile_meta",
          "{count} values &bull; Period: {start} to {end} &bull; Uploaded: {upload_date}",
          {
            count,
            start,
            end,
            upload_date: uploadDate
          }
        ),
      dateRangeLabel: this.localize("card.date_range_label", "Date range"),
      dateRangeModeLabel: this.localize("card.date_range_mode_label", "View"),
      dateRangeModeTotal: this.localize("card.date_range_mode_total", "Total"),
      dateRangeModeCustom: this.localize("card.date_range_mode_custom", "Custom range"),
      dateRangeModeQuarter: this.localize("card.date_range_mode_quarter", "Quarter/Season"),
      dateRangeModeMonth: this.localize("card.date_range_mode_month", "Month"),
      dateRangeModeWeek: this.localize("card.date_range_mode_week", "Week"),
      dateRangeWeekLabel: this.localize("card.date_range_week_label", "Week"),
      dateRangeMonthLabel: this.localize("card.date_range_month_label", "Month"),
      dateRangeQuarterLabel: this.localize("card.date_range_quarter_label", "Quarter"),
      dateRangeQuarterQ1: this.localize("card.date_range_quarter_q1", "Q1 (Jan-Mar)"),
      dateRangeQuarterQ2: this.localize("card.date_range_quarter_q2", "Q2 (Apr-Jun)"),
      dateRangeQuarterQ3: this.localize("card.date_range_quarter_q3", "Q3 (Jul-Sep)"),
      dateRangeQuarterQ4: this.localize("card.date_range_quarter_q4", "Q4 (Oct-Dec)"),
      dateRangeFrom: this.localize("card.date_range_from", "From"),
      dateRangeTo: this.localize("card.date_range_to", "To"),
      dateRangeApply: this.localize("card.date_range_apply", "Apply"),
      dateRangeReset: this.localize("card.date_range_reset", "Reset"),
      dateRangeMissing: this.localize("card.date_range_missing", "Please select both dates."),
      dateRangeWeekMissing: this.localize("card.date_range_week_missing", "Please select a week."),
      dateRangeMonthMissing: this.localize("card.date_range_month_missing", "Please select a month."),
      dateRangeQuarterMissing: this.localize("card.date_range_quarter_missing", "Please select quarter and year."),
      dateRangeInvalid: this.localize("card.date_range_invalid", "Start date must be before end date."),
      dateRangeClamped: this.localize(
        "card.date_range_clamped",
        "Range adjusted to available data."
      ),
      dateRangeLoading: this.localize("card.date_range_loading", "Loading date range..."),
      dateRangeSensorRequired: this.localize("card.date_range_sensor_required", "Please select a sensor first."),
      dateRangeError: this.localize("card.date_range_error", "No data found for this range."),
      analysisTitle: this.localize("card.analysis_title", "Load profile analysis"),
      analysisSummaryTitle: this.localize("card.analysis_summary_title", "Summary"),
      analysisGroupPeriodTitle: this.localize("card.analysis_group_period", "Period"),
      analysisGroupConsumptionTitle: this.localize("card.analysis_group_consumption", "Consumption"),
      analysisGroupPriceTitle: this.localize("card.analysis_group_price", "Price"),
      analysisPeriodLabel: this.localize("card.analysis_period_label", "Period"),
      analysisRangeLabel: this.localize("card.analysis_range_label", "Range"),
      analysisDaysLabel: this.localize("card.analysis_days_label", "Days"),
      analysisHoursLabel: this.localize("card.analysis_hours_label", "Hours"),
      analysisTotalLabel: this.localize("card.analysis_total_label", "Total consumption"),
      analysisAvgHourLabel: this.localize("card.analysis_avg_hour_label", "Avg per hour"),
      analysisAvgDayLabel: this.localize("card.analysis_avg_day_label", "Avg per day"),
      analysisPeakHourLabel: this.localize("card.analysis_peak_hour_label", "Peak hour"),
      analysisWeekdayAvgLabel: this.localize("card.analysis_weekday_avg_label", "Weekday avg"),
      analysisWeekendAvgLabel: this.localize("card.analysis_weekend_avg_label", "Weekend avg"),
      analysisAvgSpotLabel: this.localize("card.analysis_avg_spot_label", "Avg spot price"),
      analysisBreakEvenLabel: this.localize("card.analysis_break_even_label", "Break-even fixed"),
      analysisSpotCheaperLabel: this.localize("card.analysis_spot_cheaper_label", "Spot cheaper hours"),
      avgConsumptionLabel: this.localize("card.avg_consumption_label", "Avg consumption"),
      avgPriceLabel: this.localize("card.avg_price_label", "Avg spot price (net)"),
      heatmapLegendLow: this.localize("card.heatmap_legend_low", "Low"),
      heatmapLegendHigh: this.localize("card.heatmap_legend_high", "High"),
      heatmapConsumptionTitle: this.localize(
        "card.heatmap_consumption_title",
        "Avg consumption per hour (kWh)"
      ),
      heatmapPriceTitle: this.localize(
        "card.heatmap_price_title",
        "Avg spot price per hour (ct/kWh)"
      ),
      monthlyTariffTitle: this.localize(
        "card.monthly_tariff_title",
        "Monthly tariff comparison (dynamic vs fixed)"
      ),
      monthlyTariffSavingsLabel: this.localize("card.monthly_tariff_savings_label", "Savings vs fixed"),
      monthlyTariffExtraLabel: this.localize("card.monthly_tariff_extra_label", "Extra costs vs fixed"),
      monthlyTariffTotalLabel: this.localize("card.monthly_tariff_total_label", "Total"),
      monthlyTariffNoData: this.localize("card.monthly_tariff_no_data", "No matched tariff data in this period."),
      monthJan: this.localize("card.month_jan", "Jan"),
      monthFeb: this.localize("card.month_feb", "Feb"),
      monthMar: this.localize("card.month_mar", "Mar"),
      monthApr: this.localize("card.month_apr", "Apr"),
      monthMay: this.localize("card.month_may", "May"),
      monthJun: this.localize("card.month_jun", "Jun"),
      monthJul: this.localize("card.month_jul", "Jul"),
      monthAug: this.localize("card.month_aug", "Aug"),
      monthSep: this.localize("card.month_sep", "Sep"),
      monthOct: this.localize("card.month_oct", "Oct"),
      monthNov: this.localize("card.month_nov", "Nov"),
      monthDec: this.localize("card.month_dec", "Dec"),
      savingsTitlePositive: this.localize(
        "card.savings_title_positive",
        "Savings with dynamic tariff"
      ),
      savingsTitleNegative: this.localize(
        "card.savings_title_negative",
        "Extra costs with dynamic tariff"
      ),
      savingsMessagePositive: this.localize(
        "card.savings_message_positive",
        "For this profile, your provider would have been clearly cheaper on a <strong>spot tariff</strong>."
      ),
      savingsMessageNegative: this.localize(
        "card.savings_message_negative",
        "For this profile, a classic <strong>fixed tariff</strong> would have been cheaper."
      ),
      savingsDailyLabel: this.localize("card.savings_daily_label", "Daily savings"),
      savingsMonthlyLabel: this.localize("card.savings_monthly_label", "Monthly savings"),
      savingsYearlyLabel: this.localize("card.savings_yearly_label", "Yearly savings"),
      savingsCostPerDayFixedLabel: this.localize(
        "card.savings_cost_per_day_fixed_label",
        "Fixed cost per day"
      ),
      savingsCostPerDaySpotLabel: this.localize(
        "card.savings_cost_per_day_spot_label",
        "Spot cost per day"
      ),
      savingsExtrapolatedNote: this.localize(
        "card.savings_extrapolated_note",
        "Extrapolated from {days} days"
      ),
      savingsBreakEvenLabel: this.localize("card.savings_break_even_label", "Break-even fixed"),
      savingsCostPerDayLabel: this.localize("card.savings_cost_per_day_label", "Cost per day"),
      savingsSpotCheaperLabel: this.localize("card.savings_spot_cheaper_label", "Spot cheaper hours"),
      savingsBreakEvenHelp: this.localize(
        "card.savings_break_even_help",
        "Fixed price at which costs equal the spot tariff, based on current tariffs and market prices."
      ),
      savingsCostPerDayHelp: this.localize(
        "card.savings_cost_per_day_help",
        "Daily cost based on the selected period, shown as fixed vs spot."
      ),
      savingsCostPerDayFixedHelp: this.localize(
        "card.savings_cost_per_day_fixed_help",
        "Daily cost for the fixed tariff based on the selected period."
      ),
      savingsCostPerDaySpotHelp: this.localize(
        "card.savings_cost_per_day_spot_help",
        "Daily cost for the spot tariff based on the selected period."
      ),
      savingsSpotCheaperHelp: this.localize(
        "card.savings_spot_cheaper_help",
        "Share of hours where spot energy (incl. markup) is cheaper than fixed."
      ),
      savingsExtrapolatedHelp: this.localize(
        "card.savings_extrapolated_help",
        "Savings extrapolated from the selected period."
      ),
      costFixedLabel: this.localize("card.cost_fixed_label", "Fixed tariff cost:"),
      costSpotLabel: this.localize("card.cost_spot_label", "Spot tariff cost:"),
      costFixedHelp: this.localize(
        "card.cost_fixed_help",
        "Total cost of the fixed tariff for the selected period."
      ),
      costSpotHelp: this.localize(
        "card.cost_spot_help",
        "Total cost of the spot tariff for the selected period."
      ),
      savingsDailyHelp: this.localize(
        "card.savings_daily_help",
        "Savings per day based on the selected period."
      ),
      savingsMonthlyHelp: this.localize(
        "card.savings_monthly_help",
        "Savings per 30-day month extrapolated from the selected period."
      ),
      savingsYearlyHelp: this.localize(
        "card.savings_yearly_help",
        "Savings per 365-day year extrapolated from the selected period."
      )
    };
  }

  getTaxNote(taxRate) {
    return this.localize(
      "card.card_tax_note",
      "All values include {taxRate}% tax.",
      { taxRate: formatNumber(taxRate, 1) }
    );
  }

  render() {
    const texts = this.getTexts();
    this._texts = texts;
    if (!this._uiStateLoaded) {
      this.loadUiState();
    }
    if (!this._activeSource) {
      this._activeSource = this._storedSource || "csv";
    }

    this.innerHTML = renderBaseCard(texts);

    this.attachEventListeners();
    this.syncSensorPicker();
    this.updateSourceUI();
    this.updateSourceState();
    this.applyStyles();
  }

  attachEventListeners() {
    const dropzone = this.querySelector("#dropzone");
    const fileInput = this.querySelector("#fileInput");
    const filePickerBtn = this.querySelector("#filePickerBtn");
    const uploadBtn = this.querySelector("#uploadBtn");
    const cancelBtn = this.querySelector("#cancelBtn");
    const sourceCsvSwitch = this.querySelector("#sourceCsvSwitch");
    const sourceSensorSwitch = this.querySelector("#sourceSensorSwitch");
    const sensorPicker = this.querySelector("#sensorPicker");
    const sensorLoadBtn = this.querySelector("#sensorLoadBtn");
    const integrationSettingsBtn = this.querySelector("#integrationSettingsBtn");

    filePickerBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) this.handleFileSelected(e.target.files[0]);
    });

    dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
    dropzone.addEventListener("dragleave", () => { dropzone.classList.remove("drag-over"); });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault(); dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) this.handleFileSelected(e.dataTransfer.files[0]);
    });

    uploadBtn.addEventListener("click", () => { this.uploadFile(); });
    cancelBtn.addEventListener("click", () => { this.resetUI(); });

    sourceCsvSwitch.addEventListener("click", () => { this.selectSource("csv"); });
    sourceSensorSwitch.addEventListener("click", () => { this.selectSource("sensor"); });
    integrationSettingsBtn.addEventListener("click", () => this.navigateToIntegrations());

    if (sensorLoadBtn) {
      sensorLoadBtn.addEventListener("click", () => {
        if (this._selectedSensor) {
          this.loadSensorProfile(this._selectedSensor);
        }
      });
    }

    if (sensorPicker) {
      if (sensorPicker.tagName === "HA-ENTITY-PICKER") {
        sensorPicker.addEventListener("value-changed", (event) => {
          const value = event.detail && event.detail.value ? event.detail.value : null;
          this._selectedSensor = value;
          this.saveUiState();
          this.updateSourceState();
          const sensorLoadBtn = this.querySelector("#sensorLoadBtn");
          if (sensorLoadBtn) sensorLoadBtn.disabled = !value;
        });
      } else {
        sensorPicker.addEventListener("change", (event) => {
          const value = event.target && event.target.value ? event.target.value : null;
          this._selectedSensor = value;
          this.saveUiState();
          this.updateSourceState();
          const sensorLoadBtn = this.querySelector("#sensorLoadBtn");
          if (sensorLoadBtn) sensorLoadBtn.disabled = !value;
        });
      }
    }
  }

syncSensorPicker() {
    let picker = this.querySelector("#sensorPicker");
    if (!picker || !this._hass) return;

    const texts = this._texts || this.getTexts();
    const matches = Object.values(this._hass.states || {}).filter((state) => {
      const attrs = state.attributes || {};
      return attrs.device_class === "energy" && (attrs.state_class === "total_increasing" || attrs.state_class === "total");
    });

    if (picker.tagName === "HA-ENTITY-PICKER" && !customElements.get("ha-entity-picker")) {
      const select = document.createElement("select");
      select.id = "sensorPicker";
      select.className = "sensor-select";
      select.addEventListener("change", (e) => {
        this._selectedSensor = e.target.value || null;
        this.saveUiState();
        this.updateSourceState();
        const sensorLoadBtn = this.querySelector("#sensorLoadBtn");
        if (sensorLoadBtn) sensorLoadBtn.disabled = !this._selectedSensor;
      });
      picker.replaceWith(select);
      picker = select;
    }

    const currentSensorsHash = matches.map(m => m.entity_id).sort().join(",");
    const shouldRebuild = picker.dataset.sensorsHash !== currentSensorsHash;

    if (shouldRebuild) {
      picker.dataset.sensorsHash = currentSensorsHash;
    }

    const targetValue = this._selectedSensor || "";
    const isDisabled = matches.length === 0;

    if (picker.tagName === "HA-ENTITY-PICKER") {
      if (picker.hass !== this._hass) {
        picker.hass = this._hass;
      }
      if (picker.label !== texts.sensorPickerLabel) {
        picker.label = texts.sensorPickerLabel;
      }
      if (picker.placeholder !== texts.sensorPickerPlaceholder) {
        picker.placeholder = texts.sensorPickerPlaceholder;
      }
      
      if (!picker.includeDomains || picker.includeDomains.length === 0 || picker.includeDomains[0] !== "sensor") {
        picker.includeDomains = ["sensor"];
      }

      if (picker.value !== targetValue) {
        picker.value = targetValue;
      }
      if (picker.disabled !== isDisabled) {
        picker.disabled = isDisabled;
      }
    } else {
      if (shouldRebuild) {
        picker.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = texts.sensorPickerPlaceholder;
        placeholder.disabled = true;
        picker.appendChild(placeholder);

        matches
          .map((state) => {
            const attrs = state.attributes || {};
            return {
              id: state.entity_id,
              name: attrs.friendly_name || state.entity_id
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach((sensor) => {
            const option = document.createElement("option");
            option.value = sensor.id;
            option.textContent = sensor.name;
            picker.appendChild(option);
          });
      }

      if (picker.value !== targetValue) {
        picker.value = targetValue;
      }
      if (picker.disabled !== isDisabled) {
        picker.disabled = isDisabled;
      }
    }

    this.updateSensorMessageAndButton(matches.length, texts);
  }

  updateSensorMessageAndButton(matchesCount, texts) {
    const infoMessage = texts.sensorNoneOption;
    const messageEl = this.querySelector("#sensorMessage");
    
    if (!this._selectedSensor && matchesCount === 0) {
      this.showSensorMessage(infoMessage, "info");
    } else if (messageEl && messageEl.classList.contains("info")) {
      messageEl.style.display = "none";
      messageEl.textContent = "";
      messageEl.className = "sensor-message";
    }

    const sensorLoadBtn = this.querySelector("#sensorLoadBtn");
    if (sensorLoadBtn) {
      const targetDisabled = !this._selectedSensor;
      if (sensorLoadBtn.disabled !== targetDisabled) {
        sensorLoadBtn.disabled = targetDisabled;
      }
    }
  }

  updateSourceUI() {
    const isSensor = this._activeSource === "sensor";
    const sourceSelector = this.querySelector("#sourceSelector");
    const sourceCsvSwitch = this.querySelector("#sourceCsvSwitch");
    const sourceSensorSwitch = this.querySelector("#sourceSensorSwitch");
    const csvSection = this.querySelector("#csvSection");
    const sensorSection = this.querySelector("#sensorSection");

    if (sourceSelector) sourceSelector.style.display = "block";

    if (sourceCsvSwitch && sourceSensorSwitch) {
      sourceCsvSwitch.classList.toggle("active", !isSensor);
      sourceSensorSwitch.classList.toggle("active", isSensor);
      sourceCsvSwitch.setAttribute("aria-selected", String(!isSensor));
      sourceSensorSwitch.setAttribute("aria-selected", String(isSensor));
    }

    if (csvSection) {
      csvSection.style.display = isSensor ? "none" : "block";
      csvSection.hidden = isSensor;
    }
    if (sensorSection) {
      sensorSection.style.display = isSensor ? "block" : "none";
      sensorSection.hidden = !isSensor;
    }
    this.updateSourceState();
  }

  updateSourceState() {
    const sourceState = this.querySelector("#sourceState");
    if (!sourceState) return;

    const texts = this._texts || this.getTexts();
    if (this._activeSource === "sensor") {
      const entityId = this._loadedSensorEntityId || this.latestData?.sensor_entity_id;
      const state = this._hass?.states?.[entityId];
      const name = state?.attributes?.friendly_name || entityId;
      sourceState.textContent = name ? texts.sourceStateSensor(name) : texts.sourceStateLoading;
      return;
    }

    const filename = this._lastCsvData?.filename || this.latestData?.filename;
    sourceState.textContent = filename ? texts.sourceStateCsv(filename) : texts.sourceStateLoading;
  }

  navigateToIntegrations() {
    window.history.pushState(null, "", "/config/integrations");
    window.dispatchEvent(new Event("location-changed"));
  }

  async selectSource(source) {
    if (this._activeSource === source) return;
    this._activeSource = source;
    this.saveUiState();
    this.updateSourceUI();

    try {
      await setActiveSource(this._hass, source);
    } catch (err) {
      console.error("Failed to persist source", err);
    }

    if (source === "csv" && this._lastCsvData) {
      this.renderDashboard(this._lastCsvData);
      return;
    }

    if (source === "sensor") {
      if (this._lastSensorData) {
        this.renderDashboard(this._lastSensorData);
      } else {
        this.showSensorMessage((this._texts || this.getTexts()).sensorHint, "info");
      }
    }
  }

  showSensorMessage(message, type) {
    const el = this.querySelector("#sensorMessage");
    if (!el) return;
    el.style.display = "block";
    el.className = `sensor-message ${type || ""}`.trim();
    el.textContent = message;
  }

  async loadSensorProfile(entityId) {
    const texts = this._texts || this.getTexts();
    this.showSensorMessage(texts.sensorLoading, "loading");
    try {
      const data = await loadSensorData(this._hass, entityId);
      if (!data) {
        this.showSensorMessage(texts.sensorNoData, "error");
        return;
      }
      if (data.sensor_available !== undefined) {
        this._sensorAvailable = data.sensor_available;
        this._csvAvailable = data.csv_available;
      } else {
        this._sensorAvailable = true;
      }
      this._activeSource = "sensor";
      this.updateSourceUI();
      this.showSensorMessage(texts.sensorLoaded, "success");
      this._lastSensorData = data;
      this._loadedSensorEntityId = data.sensor_entity_id || entityId;
      this.renderDashboard(data);
    } catch (error) {
      this.showSensorMessage(error.message || texts.sensorNoData, "error");
    }
  }

  handleFileSelected(file) {
    const texts = this._texts || this.getTexts();
    if (!file.name.endsWith(".csv")) {
      this.showErrorMessage(texts.invalidFile);
      return;
    }
    const uploadBtn = this.querySelector("#uploadBtn");
    const cancelBtn = this.querySelector("#cancelBtn");
    this.selectedFile = file;
    this.querySelector("#fileName").textContent = file.name;
    this.querySelector("#fileInfo").style.display = "block";
    this.querySelector("#uploadBtn").style.display = "inline-block";
    this.querySelector("#cancelBtn").style.display = "inline-block";
    this.querySelector("#responseMessage").style.display = "none";
    uploadBtn.disabled = false;
    cancelBtn.disabled = false;
  }

  async uploadFile() {
    if (!this.selectedFile) return;
    const uploadBtn = this.querySelector("#uploadBtn");
    const cancelBtn = this.querySelector("#cancelBtn");
    const progressContainer = this.querySelector("#progressContainer");

    uploadBtn.disabled = true; cancelBtn.disabled = true; progressContainer.style.display = "block";

    try {
      const responseData = await uploadCsv(this._hass, this.selectedFile);
      this.showSuccessMessage(responseData);
      this._lastCsvData = responseData;
      this._activeSource = "csv";
      this.saveUiState();
      this.updateSourceState();
      this.renderDashboard(responseData);
      this.resetUI();
    } catch (error) {
      this.showErrorMessage(error.message);
      uploadBtn.disabled = false; cancelBtn.disabled = false; progressContainer.style.display = "none";
    }
  }

  async loadHeatmapsFromBackend() {
    try {
      let data = await loadHeatmaps(this._hass);
      if (data) {
        if (data.source && !this._storedSource) this._activeSource = data.source;
        if (data.sensor_entity_id) this._selectedSensor = data.sensor_entity_id;
        if (data.source === "sensor" && data.sensor_entity_id) {
          data = await loadSensorData(this._hass, data.sensor_entity_id);
          this._loadedSensorEntityId = data.sensor_entity_id;
        }
        if (data.csv_available !== undefined) {
          this._csvAvailable = data.csv_available;
          this._sensorAvailable = data.sensor_available;
        }
        if (data.source === "csv") this._lastCsvData = data;
        if (data.source === "sensor") this._lastSensorData = data;
        this.updateSourceUI();
        this.syncSensorPicker();
        if (this._activeSource === data.source) {
          this.renderDashboard(data);
        }
      }
    } catch (e) {
      console.error("Failed to load persistent heatmaps", e);
    }
  }

  showSuccessMessage(response) {
    const texts = this._texts || this.getTexts();
    if (response.csv_available !== undefined) {
      this._csvAvailable = response.csv_available;
      this._sensorAvailable = response.sensor_available;
    } else {
      this._csvAvailable = true;
    }
    this.updateSourceUI();
    const message = this.querySelector("#responseMessage");
    message.style.display = "block";
    message.className = "response-message success";
    message.innerHTML = `
      <div class="success-icon">✓</div>
      <p><strong>${texts.uploadSuccessTitle}</strong></p>
      <p>${texts.uploadSuccessMessage(response.count || 0)}</p>
    `;
  }

  showErrorMessage(error) {
    const texts = this._texts || this.getTexts();
    const message = this.querySelector("#responseMessage");
    message.style.display = "block";
    message.className = "response-message error";
    message.innerHTML = `<div class="error-icon">✗</div><p><strong>${texts.uploadErrorTitle}</strong></p><p>${error}</p>`;
  }

  showRangeMessage(message, type) {
    const el = this.querySelector("#rangeMessage");
    if (!el) return;
    if (!message) {
      el.style.display = "none";
      el.textContent = "";
      el.className = "range-message";
      return;
    }
    el.style.display = "block";
    el.className = `range-message ${type || ""}`.trim();
    el.textContent = message;
  }

  async applyDateRange() {
    const texts = this._texts || this.getTexts();
    const selection = this.collectRangeSelection();
    if (selection.error) {
      this.showRangeMessage(selection.error, "error");
      return;
    }

    this._rangePreset = selection.preset;
    this._rangeWeek = selection.week;
    this._rangeMonth = selection.month;
    this._rangeQuarter = selection.quarter;
    this._rangeQuarterYear = selection.quarterYear;

    if (!selection.start || !selection.end) {
      this._rangeStart = null;
      this._rangeEnd = null;
      this.showRangeMessage("", "");
      this.saveUiState();
      await this.reloadRangeData();
      return;
    }

    if (selection.start > selection.end) {
      this.showRangeMessage(texts.dateRangeInvalid, "error");
      return;
    }

    const clamped = this.clampDateRange(selection.start, selection.end);
    this._rangeStart = clamped.start;
    this._rangeEnd = clamped.end;
    if (clamped.changed) {
      this.showRangeMessage(texts.dateRangeClamped, "info");
    }
    this.saveUiState();
    await this.reloadRangeData();
  }

  async resetDateRange() {
    this._rangePreset = "total";
    this._rangeWeek = null;
    this._rangeMonth = null;
    this._rangeQuarter = null;
    this._rangeQuarterYear = null;
    this._rangeStart = null;
    this._rangeEnd = null;
    this.saveUiState();
    await this.reloadRangeData();
  }

  collectRangeSelection() {
    const texts = this._texts || this.getTexts();
    const preset = this.querySelector("#rangePreset")?.value || "total";
    const from = this.querySelector("#rangeFrom")?.value || null;
    const to = this.querySelector("#rangeTo")?.value || null;
    const week = this.querySelector("#rangeWeek")?.value || null;
    const month = this.querySelector("#rangeMonth")?.value || null;
    const quarter = this.querySelector("#rangeQuarter")?.value || null;
    const quarterYearRaw = this.querySelector("#rangeQuarterYear")?.value || "";
    const quarterYear = quarterYearRaw ? Number(quarterYearRaw) : null;

    if (preset === "total") {
      return { preset, from, to, week, month, quarter, quarterYear, start: null, end: null, error: null };
    }

    if (preset === "custom") {
      if (!from || !to) {
        return { preset, from, to, week, month, quarter, quarterYear, start: null, end: null, error: texts.dateRangeMissing };
      }
      return { preset, from, to, week, month, quarter, quarterYear, start: from, end: to, error: null };
    }

    if (preset === "week") {
      if (!week) {
        return { preset, from, to, week, month, quarter, quarterYear, start: null, end: null, error: texts.dateRangeWeekMissing };
      }
      const range = this.isoWeekToDateRange(week);
      if (!range) {
        return { preset, from, to, week, month, quarter, quarterYear, start: null, end: null, error: texts.dateRangeInvalid };
      }
      return { preset, from, to, week, month, quarter, quarterYear, start: range.start, end: range.end, error: null };
    }

    if (preset === "month") {
      if (!month) {
        return { preset, from, to, week, month, quarter, quarterYear, start: null, end: null, error: texts.dateRangeMonthMissing };
      }
      const range = this.monthToDateRange(month);
      return { preset, from, to, week, month, quarter, quarterYear, start: range.start, end: range.end, error: null };
    }

    if (!quarter || !quarterYear || !Number.isInteger(quarterYear)) {
      return { preset, from, to, week, month, quarter, quarterYear, start: null, end: null, error: texts.dateRangeQuarterMissing };
    }

    const range = this.quarterToDateRange(quarterYear, Number(quarter));
    return { preset, from, to, week, month, quarter, quarterYear, start: range.start, end: range.end, error: null };
  }

  getCurrentRequestRange() {
    const hasRangeControls = Boolean(this.querySelector("#rangePreset"));
    if (!hasRangeControls) {
      return { start: this._rangeStart, end: this._rangeEnd };
    }

    const selection = this.collectRangeSelection();
    if (selection.error) {
      return { start: this._rangeStart, end: this._rangeEnd };
    }

    this._rangePreset = selection.preset;
    this._rangeWeek = selection.week;
    this._rangeMonth = selection.month;
    this._rangeQuarter = selection.quarter;
    this._rangeQuarterYear = selection.quarterYear;

    if (!selection.start || !selection.end) {
      this._rangeStart = null;
      this._rangeEnd = null;
      this.saveUiState();
      return { start: null, end: null };
    }

    const clamped = this.clampDateRange(selection.start, selection.end);
    this._rangeStart = clamped.start;
    this._rangeEnd = clamped.end;
    this.saveUiState();
    return { start: clamped.start, end: clamped.end };
  }

  async reloadRangeData() {
    const texts = this._texts || this.getTexts();
    this.showRangeMessage(texts.dateRangeLoading, "loading");

    try {
      if (this._activeSource === "sensor") {
        if (!this._selectedSensor) {
          this.showRangeMessage(texts.dateRangeSensorRequired, "error");
          return;
        }
        const data = await loadSensorData(
          this._hass,
          this._selectedSensor,
          this._rangeStart,
          this._rangeEnd,
          { allowEmpty: false }
        );
        this.showRangeMessage("", "");
        this._lastSensorData = data;
        this.renderDashboard(data);
        return;
      }

      const data = await loadHeatmaps(
        this._hass,
        this._rangeStart,
        this._rangeEnd,
        { allowEmpty: false }
      );
      this.showRangeMessage("", "");
      this._lastCsvData = data;
      this.renderDashboard(data);
    } catch (error) {
      this.showRangeMessage(error.message || texts.dateRangeError, "error");
    }
  }

  resetUI() {
    this.querySelector("#uploadBtn").style.display = "none";
    this.querySelector("#cancelBtn").style.display = "none";
    this.querySelector("#fileInfo").style.display = "none";
    this.querySelector("#progressContainer").style.display = "none";
    this.querySelector("#fileInput").value = "";
    this.selectedFile = null;
    this.querySelector("#progressBar").style.width = "0%";
    this.querySelector("#uploadBtn").disabled = false;
    this.querySelector("#cancelBtn").disabled = false;
  }

  renderDashboard(response) {
    const container = this.querySelector("#dashboardContainer");
    if (!container) return;
    const texts = this._texts || this.getTexts();

    this.latestData = response;
    if (response.source === "sensor" && response.sensor_entity_id) {
      this._loadedSensorEntityId = response.sensor_entity_id;
    }

    if (this._activeSource !== "sensor") {
      this.querySelector("#uploadContent").classList.add("data-loaded");
      this.querySelector("#uploadTitle").textContent = texts.uploadAnotherTitle;
    }

    let heatmapsHtml = '';
    if (response.consumption_heatmap && response.consumption_heatmap.length > 0) {
      heatmapsHtml += generateHeatmapHTML(
        response.consumption_heatmap,
        texts.heatmapConsumptionTitle,
        "kWh",
        false,
        formatNumber,
        { low: texts.heatmapLegendLow, high: texts.heatmapLegendHigh }
      );
    }
    if (response.price_heatmap && response.price_heatmap.length > 0) {
      heatmapsHtml += generateHeatmapHTML(
        response.price_heatmap,
        texts.heatmapPriceTitle,
        "ct/kWh",
        false,
        formatNumber,
        { low: texts.heatmapLegendLow, high: texts.heatmapLegendHigh }
      );
    }
    heatmapsHtml += this.buildMonthlyTariffComparisonHtml(response);

    const start = response.start ? response.start.split('T')[0] : 'N/A';
    const end = response.end ? response.end.split('T')[0] : 'N/A';
    const availableStart = response.available_start
      ? response.available_start.split("T")[0]
      : start;
    const availableEnd = response.available_end
      ? response.available_end.split("T")[0]
      : end;
    
    // Metadaten für das aktuelle Profil
    const filenameStr = response.filename || texts.profileDefaultFilename;
    const uploadDateStr = formatUploadDate(response.upload_date, texts.lastImported);

    const countStr = formatNumber(response.count, 0);
    const avgConsumptionStr = formatNumber(response.avg_consumption_kwh, 3);
    const avgPriceStr = formatNumber(response.avg_price_ct_kwh, 2);

    const profileMeta = texts.profileMeta({
      count: countStr,
      start,
      end,
      uploadDate: uploadDateStr
    });

    const analysisGroups = this.buildAnalysisGroups({
      start,
      end,
      matchedHours: response.matched_hours,
      avgConsumption: avgConsumptionStr,
      avgPrice: avgPriceStr,
      totalConsumption: response.total_consumption_kwh,
      avgPerHour: response.avg_consumption_kwh_per_hour,
      avgPerDay: response.avg_consumption_kwh_per_day,
      peakHour: response.peak_hour,
      weekdayAvg: response.weekday_avg_kwh_per_hour,
      weekendAvg: response.weekend_avg_kwh_per_hour,
      breakEvenSpot: response.break_even_fixed_ct_kwh,
      spotCheaperShare: response.spot_cheaper_share
    });

    this._availableStart = availableStart !== "N/A" ? availableStart : null;
    this._availableEnd = availableEnd !== "N/A" ? availableEnd : null;

    const fallbackDate = end !== "N/A" ? end : (this._availableEnd || this._availableStart || "");
    const fallbackMonth = fallbackDate ? fallbackDate.slice(0, 7) : "";
    const fallbackWeek = fallbackDate ? this.dateToIsoWeek(fallbackDate) : "";
    const fallbackYear = fallbackDate ? Number(fallbackDate.slice(0, 4)) : new Date().getUTCFullYear();
    const fallbackQuarter = fallbackDate ? String(Math.floor((Number(fallbackDate.slice(5, 7)) - 1) / 3) + 1) : "1";

    if (!this._rangePreset) this._rangePreset = "total";
    if (!this._rangeMonth) this._rangeMonth = fallbackMonth;
    if (!this._rangeWeek) this._rangeWeek = fallbackWeek;
    if (!this._rangeQuarterYear) this._rangeQuarterYear = fallbackYear;
    if (!this._rangeQuarter) this._rangeQuarter = fallbackQuarter;
    if (!this._rangeStart) this._rangeStart = this._availableStart || start;
    if (!this._rangeEnd) this._rangeEnd = this._availableEnd || end;

    container.innerHTML = renderDashboardHtml({
      filename: filenameStr,
      profileTitle: texts.profileTitle,
      profileMeta,
      heatmapsHtml,
      analysisGroups,
      texts,
      rangePreset: this._rangePreset,
      rangeFrom: this._rangeStart,
      rangeTo: this._rangeEnd,
      rangeWeek: this._rangeWeek,
      rangeMonth: this._rangeMonth,
      rangeQuarter: this._rangeQuarter,
      rangeQuarterYear: this._rangeQuarterYear,
      availableStart: this._availableStart,
      availableEnd: this._availableEnd
    });

    const rangePreset = this.querySelector("#rangePreset");
    const rangeFromInput = this.querySelector("#rangeFrom");
    const rangeToInput = this.querySelector("#rangeTo");
    const rangeWeekInput = this.querySelector("#rangeWeek");
    const rangeMonthInput = this.querySelector("#rangeMonth");
    const rangeQuarterInput = this.querySelector("#rangeQuarter");
    const rangeQuarterYearInput = this.querySelector("#rangeQuarterYear");
    const applyRangeBtn = this.querySelector("#applyRangeBtn");
    const resetRangeBtn = this.querySelector("#resetRangeBtn");

    if (rangePreset) {
      rangePreset.addEventListener("change", () => {
        this._rangePreset = rangePreset.value || "total";
        this.updateRangePickerVisibility();
        this.saveUiState();
      });
      this.updateRangePickerVisibility();
    }

    if (rangeFromInput) {
      rangeFromInput.addEventListener("change", () => {
        this._rangeStart = rangeFromInput.value || null;
        this.saveUiState();
      });
    }
    if (rangeToInput) {
      rangeToInput.addEventListener("change", () => {
        this._rangeEnd = rangeToInput.value || null;
        this.saveUiState();
      });
    }
    if (rangeWeekInput) {
      rangeWeekInput.addEventListener("change", () => {
        this._rangeWeek = rangeWeekInput.value || null;
        this.saveUiState();
      });
    }
    if (rangeMonthInput) {
      rangeMonthInput.addEventListener("change", () => {
        this._rangeMonth = rangeMonthInput.value || null;
        this.saveUiState();
      });
    }
    if (rangeQuarterInput) {
      rangeQuarterInput.addEventListener("change", () => {
        this._rangeQuarter = rangeQuarterInput.value || null;
        this.saveUiState();
      });
    }
    if (rangeQuarterYearInput) {
      rangeQuarterYearInput.addEventListener("change", () => {
        const parsedYear = Number(rangeQuarterYearInput.value);
        this._rangeQuarterYear = Number.isInteger(parsedYear) ? parsedYear : null;
        this.saveUiState();
      });
    }

    if (applyRangeBtn) {
      applyRangeBtn.addEventListener("click", () => {
        this.applyDateRange();
      });
    }

    if (resetRangeBtn) {
      resetRangeBtn.addEventListener("click", () => {
        this.resetDateRange();
      });
    }

    this.updateSourceState();
    this.updateSavingsBanner(true);
  }

  updateSavingsBanner() {
    if (!this.latestData || this.latestData.matched_hours === 0) return;
    const texts = this._texts || this.getTexts();
    const totals = this.latestData.tariff_totals;
    if (!totals) return;

    const costFixEur = Number(totals.fixed_cost_eur || 0);
    const costSpotEur = Number(totals.spot_cost_eur || 0);
    const savingsEur = costFixEur - costSpotEur;

    const matchedHours = this.latestData.matched_hours || 0;
    const matchedDays = matchedHours > 0 ? matchedHours / 24 : 0;
    const matchedDaysRoundedUp = matchedDays > 0 ? Math.ceil(matchedDays) : 0;
    const dailySavings = matchedDays > 0 ? savingsEur / matchedDays : null;
    const monthlySavings = dailySavings !== null ? dailySavings * 30 : null;
    const yearlySavings = dailySavings !== null ? dailySavings * 365 : null;
    const fixPerDay = matchedDays > 0 ? costFixEur / matchedDays : null;
    const spotPerDay = matchedDays > 0 ? costSpotEur / matchedDays : null;
    const taxRate = this.latestData?.tax_rate ?? 20.0;
    const taxNote = this.getTaxNote(taxRate);
    const breakEvenFixed = this.latestData.break_even_fixed_ct_kwh;
    const spotCheaperShare = this.latestData.spot_cheaper_share;
    const isFullYear = matchedDaysRoundedUp === 365;
    const extrapolatedNote = matchedDays > 0 && !isFullYear
      ? texts.savingsExtrapolatedNote.replace("{days}", formatNumber(matchedDaysRoundedUp, 0))
      : "";

    const bannerContainer = this.querySelector("#dynamicSavingsBanner");
    const isPositive = savingsEur >= 0;
    const savColor = isPositive ? "#4caf50" : "#f44336";
    const savBg = isPositive ? "rgba(76, 175, 80, 0.1)" : "rgba(244, 67, 54, 0.1)";
    const savIcon = isPositive ? "💰" : "⚠️";
    const savTitle = isPositive ? texts.savingsTitlePositive : texts.savingsTitleNegative;
    const savMessage = isPositive ? texts.savingsMessagePositive : texts.savingsMessageNegative;
    
    // Die Box ist nun 100% hoch, damit sie im Grid neben den Settings schön abschließt
    bannerContainer.innerHTML = `
      <div style="background-color: ${savBg}; border: 1px solid rgba(var(--rgb-divider-color), 0.2); border-left: 4px solid ${savColor}; padding: 24px; border-radius: 0 8px 8px 0; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center;">
        <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px;">
          <div style="font-size: 48px; line-height: 1;">${savIcon}</div>
          <div>
            <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: var(--secondary-text-color); margin-bottom: 4px; font-weight: 600;">
              ${savTitle}
            </div>
            <div style="font-size: 32px; font-weight: bold; color: var(--primary-text-color);">
              ${formatNumber(Math.abs(savingsEur), 2)} €
            </div>
          </div>
        </div>
        <div style="font-size: 14px; color: var(--secondary-text-color); margin-bottom: 24px; line-height: 1.5;">
          ${savMessage}
        </div>
        <div style="margin-top: auto; font-size: 13px; background: rgba(var(--rgb-primary-text-color), 0.04); padding: 16px; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${texts.costFixedLabel}</strong></span>
            <span>${formatNumber(costFixEur, 2)} € <span class="info-icon" title="${texts.costFixedHelp}">i</span></span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${texts.costSpotLabel}</strong></span>
            <span>${formatNumber(costSpotEur, 2)} € <span class="info-icon" title="${texts.costSpotHelp}">i</span></span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${texts.savingsCostPerDayFixedLabel}</strong></span>
            <span>${fixPerDay !== null ? formatNumber(fixPerDay, 2) : "-"} € <span class="info-icon" title="${texts.savingsCostPerDayFixedHelp}">i</span></span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${texts.savingsCostPerDaySpotLabel}</strong></span>
            <span>${spotPerDay !== null ? formatNumber(spotPerDay, 2) : "-"} € <span class="info-icon" title="${texts.savingsCostPerDaySpotHelp}">i</span></span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${texts.savingsBreakEvenLabel}</strong></span>
            <span>${breakEvenFixed !== null && breakEvenFixed !== undefined ? formatNumber(breakEvenFixed, 2) : "-"} ct/kWh <span class="info-icon" title="${texts.savingsBreakEvenHelp}">i</span></span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${texts.savingsSpotCheaperLabel}</strong></span>
            <span>${spotCheaperShare !== null && spotCheaperShare !== undefined ? formatNumber(spotCheaperShare * 100, 1) : "-"} % <span class="info-icon" title="${texts.savingsSpotCheaperHelp}">i</span></span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${texts.savingsDailyLabel}</strong></span>
            <span>${dailySavings !== null ? formatNumber(dailySavings, 2) : "-"} € <span class="info-icon" title="${texts.savingsDailyHelp}">i</span></span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${texts.savingsMonthlyLabel}</strong></span>
            <span>${monthlySavings !== null ? formatNumber(monthlySavings, 2) : "-"} € <span class="info-icon" title="${texts.savingsMonthlyHelp}">i</span></span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>${texts.savingsYearlyLabel}</strong></span>
            <span>${yearlySavings !== null ? formatNumber(yearlySavings, 2) : "-"} € <span class="info-icon" title="${texts.savingsYearlyHelp}">i</span></span>
          </div>
          <div class="card-tax-note">${taxNote}</div>
          ${extrapolatedNote ? `<div style="font-size: 11px; color: var(--secondary-text-color);">${extrapolatedNote} <span class="info-icon" title="${texts.savingsExtrapolatedHelp}">i</span></div>` : ""}
        </div>
      </div>
    `;
  }

  updateRangePickerVisibility() {
    const preset = this.querySelector("#rangePreset")?.value || this._rangePreset || "total";
    const custom = this.querySelector("#rangeCustomPicker");
    const week = this.querySelector("#rangeWeekPicker");
    const month = this.querySelector("#rangeMonthPicker");
    const quarter = this.querySelector("#rangeQuarterPicker");
    if (custom) custom.style.display = preset === "custom" ? "grid" : "none";
    if (week) week.style.display = preset === "week" ? "flex" : "none";
    if (month) month.style.display = preset === "month" ? "flex" : "none";
    if (quarter) quarter.style.display = preset === "quarter" ? "flex" : "none";
  }

  dateToIsoWeek(dateString) {
    if (!dateString) return "";
    const date = new Date(`${dateString}T00:00:00Z`);
    const dayNr = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const firstThursdayDay = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 3);
    const week = 1 + Math.round((date - firstThursday) / 604800000);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  isoWeekToDateRange(weekString) {
    const match = /^([0-9]{4})-W([0-9]{2})$/.exec(String(weekString || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = (jan4.getUTCDay() + 6) % 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - jan4Day + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const toDate = (d) => d.toISOString().slice(0, 10);
    return { start: toDate(monday), end: toDate(sunday) };
  }

  monthToDateRange(monthString) {
    const match = /^([0-9]{4})-([0-9]{2})$/.exec(String(monthString || ""));
    if (!match) return { start: null, end: null };
    const year = Number(match[1]);
    const month = Number(match[2]);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(year, month, 0));
    const end = endDate.toISOString().slice(0, 10);
    return { start, end };
  }

  quarterToDateRange(year, quarter) {
    const quarterIndex = Math.max(1, Math.min(4, Number(quarter || 1))) - 1;
    const startMonth = quarterIndex * 3 + 1;
    const endMonth = startMonth + 2;
    const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(year, endMonth, 0));
    const end = endDate.toISOString().slice(0, 10);
    return { start, end };
  }

  buildMonthlyTariffComparisonHtml(response) {
    const texts = this._texts || this.getTexts();
    const months = Array.isArray(response.tariff_monthly)
      ? response.tariff_monthly
      : Array.isArray(response.monthly_tariff_comparison?.months)
        ? response.monthly_tariff_comparison.months
        : [];
    const matchedHoursTotal = Number(response.matched_hours || response.monthly_tariff_comparison?.matched_hours || 0);

    if (months.length === 0 || matchedHoursTotal === 0) {
      return `
        <div class="monthly-tariff-panel">
          <div class="monthly-tariff-title">${texts.monthlyTariffTitle}</div>
          <div class="monthly-tariff-empty">${texts.monthlyTariffNoData}</div>
        </div>
      `;
    }

    const monthLabels = [
      texts.monthJan,
      texts.monthFeb,
      texts.monthMar,
      texts.monthApr,
      texts.monthMay,
      texts.monthJun,
      texts.monthJul,
      texts.monthAug,
      texts.monthSep,
      texts.monthOct,
      texts.monthNov,
      texts.monthDec
    ];

    const thresholdEur = 0.15;
    const maxAbs = Math.max(0.01, ...months.map((item) => Math.abs(Number(item.delta_eur || 0))));

    const cells = months
      .slice()
      .sort((a, b) => Number(a.month || 0) - Number(b.month || 0))
      .map((item) => {
        const monthIndex = Math.max(1, Math.min(12, Number(item.month || 1))) - 1;
        const delta = Number(item.delta_eur || 0);
        const matchedHours = Number(item.matched_hours || 0);
        const intensity = Math.min(1, Math.abs(delta) / maxAbs);
        const hasData = matchedHours > 0;

        let cellClass = "neutral";
        if (!hasData) {
          cellClass = "nodata";
        } else if (delta > thresholdEur) {
          cellClass = "extra";
        } else if (delta < -thresholdEur) {
          cellClass = "savings";
        }

        const centerValue = !hasData
          ? "-"
          : `${delta > 0 ? "+" : ""}${formatNumber(delta, 2)} EUR`;

        return `
          <div class="monthly-cell-card ${cellClass}" title="${monthLabels[monthIndex]} | Delta: ${delta > 0 ? "+" : ""}${formatNumber(delta, 2)} EUR | Stunden: ${formatNumber(matchedHours, 0)}" style="--intensity:${intensity.toFixed(3)}">
            <div class="monthly-cell-head">${monthLabels[monthIndex]}</div>
            <div class="monthly-cell-center">${centerValue}</div>
          </div>
        `;
      })
      .join("");

    const totalDelta = response.tariff_totals
      ? Number(response.tariff_totals.delta_eur || 0)
      : months.reduce((sum, item) => sum + Number(item.delta_eur || 0), 0);
    const totalText = totalDelta < 0
      ? `${texts.monthlyTariffTotalLabel}: ${texts.monthlyTariffSavingsLabel} ${formatNumber(Math.abs(totalDelta), 2)} EUR`
      : `${texts.monthlyTariffTotalLabel}: ${texts.monthlyTariffExtraLabel} ${formatNumber(totalDelta, 2)} EUR`;
    const totalClass = totalDelta < -thresholdEur ? "savings" : totalDelta > thresholdEur ? "extra" : "neutral";

    return `
      <div class="monthly-tariff-panel">
        <div class="monthly-tariff-title">${texts.monthlyTariffTitle}</div>
        <div class="monthly-tariff-grid">${cells}</div>
        <div class="monthly-tariff-total ${totalClass}">${totalText}</div>
      </div>
    `;
  }

  buildAnalysisGroups(summary) {
    const texts = this._texts || this.getTexts();
    const taxRate = this.latestData?.tax_rate ?? 20.0;
    const taxNote = this.getTaxNote(taxRate);
    const buildItems = (items) => items
      .map((item) => `<div class="summary-item"><span>${item.label}</span><strong>${item.value}</strong></div>`)
      .join("");

    const matchedHours = Number(summary.matchedHours || 0);
    const matchedDays = matchedHours > 0 ? matchedHours / 24 : 0;
    const peakHourLabel = summary.peakHour !== null && summary.peakHour !== undefined
      ? `${String(summary.peakHour).padStart(2, "0")}:00`
      : "-";
    const spotCheaperShare = summary.spotCheaperShare !== null && summary.spotCheaperShare !== undefined
      ? `${formatNumber(summary.spotCheaperShare * 100, 1)} %`
      : "-";
    const breakEvenFixed = summary.breakEvenSpot !== null && summary.breakEvenSpot !== undefined
      ? `${formatNumber(summary.breakEvenSpot, 2)} ct/kWh`
      : "-";

    const periodItems = buildItems([
      { label: texts.analysisRangeLabel, value: `${summary.start} - ${summary.end}` },
      { label: texts.analysisDaysLabel, value: `${formatNumber(matchedDays, 1)}` },
      { label: texts.analysisHoursLabel, value: `${formatNumber(matchedHours, 0)}` }
    ]);

    const consumptionItems = buildItems([
      { label: texts.analysisTotalLabel, value: `${formatNumber(summary.totalConsumption || 0, 2)} kWh` },
      { label: texts.analysisAvgHourLabel, value: `${formatNumber(summary.avgPerHour || 0, 3)} kWh` },
      { label: texts.analysisAvgDayLabel, value: `${formatNumber(summary.avgPerDay || 0, 2)} kWh` },
      { label: texts.analysisPeakHourLabel, value: peakHourLabel },
      { label: texts.analysisWeekdayAvgLabel, value: `${formatNumber(summary.weekdayAvg || 0, 3)} kWh` },
      { label: texts.analysisWeekendAvgLabel, value: `${formatNumber(summary.weekendAvg || 0, 3)} kWh` }
    ]);

    const priceItems = buildItems([
      { label: texts.analysisAvgSpotLabel, value: `${summary.avgPrice} ct/kWh` },
      { label: texts.analysisBreakEvenLabel, value: breakEvenFixed },
      { label: texts.analysisSpotCheaperLabel, value: spotCheaperShare }
    ]);

    return `
      <div class="analysis-group">
        <div class="analysis-group-title">${texts.analysisGroupPeriodTitle}</div>
        <div class="analysis-summary-grid">${periodItems}</div>
      </div>
      <div class="analysis-group">
        <div class="analysis-group-title">${texts.analysisGroupConsumptionTitle}</div>
        <div class="analysis-summary-grid">${consumptionItems}</div>
      </div>
      <div class="analysis-group">
        <div class="analysis-group-title">${texts.analysisGroupPriceTitle}</div>
        <div class="analysis-summary-grid">${priceItems}</div>
      </div>
      <div class="card-tax-note">${taxNote}</div>
    `;
  }

  clampDateRange(start, end) {
    if (!this._availableStart || !this._availableEnd) {
      return { start, end, changed: false };
    }

    let clampedStart = start;
    let clampedEnd = end;
    let changed = false;

    if (start < this._availableStart) {
      clampedStart = this._availableStart;
      changed = true;
    }
    if (end > this._availableEnd) {
      clampedEnd = this._availableEnd;
      changed = true;
    }

    return { start: clampedStart, end: clampedEnd, changed };
  }

  loadUiState() {
    this._uiStateLoaded = true;
    try {
      const raw = localStorage.getItem("sei_ui_state");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this._storedSource = parsed.activeSource || null;
      this._rangePreset = parsed.rangePreset || "total";
      this._rangeStart = parsed.rangeStart || null;
      this._rangeEnd = parsed.rangeEnd || null;
      this._rangeWeek = parsed.rangeWeek || null;
      this._rangeMonth = parsed.rangeMonth || null;
      this._rangeQuarter = parsed.rangeQuarter || null;
      this._rangeQuarterYear = parsed.rangeQuarterYear || null;
      this._selectedSensor = parsed.selectedSensor || this._selectedSensor;
    } catch (err) {
      console.warn("Failed to load UI state", err);
    }
  }

  saveUiState() {
    try {
      const payload = {
        activeSource: this._activeSource,
        rangePreset: this._rangePreset || "total",
        rangeStart: this._rangeStart,
        rangeEnd: this._rangeEnd,
        rangeWeek: this._rangeWeek,
        rangeMonth: this._rangeMonth,
        rangeQuarter: this._rangeQuarter,
        rangeQuarterYear: this._rangeQuarterYear,
        selectedSensor: this._selectedSensor || null
      };
      localStorage.setItem("sei_ui_state", JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to save UI state", err);
    }
  }

  applyStyles() {
    const style = document.createElement("style");
    style.textContent = `
      ha-card { box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1)); border-radius: var(--ha-card-border-radius, 8px); overflow: hidden; }
      .dashboard-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 24px; border-bottom: 1px solid var(--divider-color); }
      .dashboard-title { font-size: 22px; font-weight: 600; color: var(--primary-text-color); }
      .dashboard-source-state { margin-top: 4px; color: var(--secondary-text-color); font-size: 13px; }
      .integration-settings-chip { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; padding: 0; border: 1px solid var(--divider-color); border-radius: 999px; background: transparent; color: var(--secondary-text-color); cursor: pointer; }
      .integration-settings-chip:hover { color: var(--primary-color); border-color: var(--primary-color); background: rgba(var(--rgb-primary-color), 0.08); }
      .integration-settings-chip ha-icon { --mdc-icon-size: 20px; }

      .source-card { margin: 16px; border: 1px solid var(--divider-color); border-radius: 10px; overflow: hidden; background: var(--card-background-color); }
      .source-chooser-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 16px; }
      .source-chooser-title { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .source-chooser-desc { font-size: 12px; color: var(--secondary-text-color); }
      .source-selector-buttons { display: inline-flex; border: 1px solid var(--divider-color); border-radius: 999px; overflow: hidden; background: var(--secondary-background-color); }
      .source-switch { padding: 6px 14px; border: none; background: transparent; color: var(--primary-text-color); cursor: pointer; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
      .source-switch.active { background: var(--primary-color); color: white; }

      .upload-card { width: 100%; max-width: 1200px; margin: 0 auto; height: fit-content; }
      .source-content { padding: 16px; border-top: 1px solid var(--divider-color); }
      .source-section { background: rgba(var(--rgb-primary-text-color), 0.02); }
      .source-section-header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
      .source-section-title { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .source-section-desc { font-size: 12px; color: var(--secondary-text-color); }
      .section-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
      .sensor-picker { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
      .sensor-label { font-size: 13px; color: var(--secondary-text-color); }
      .sensor-select { width: 100%; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 14px; box-sizing: border-box; }
      .sensor-select:disabled { opacity: 0.6; cursor: not-allowed; }
      .sensor-hint { font-size: 12px; color: var(--secondary-text-color); }
      .sensor-message { margin-top: 10px; font-size: 13px; padding: 8px 12px; border-radius: 6px; background: rgba(var(--rgb-primary-text-color), 0.04); }
      .sensor-message.loading { opacity: 0.8; }
      .sensor-message.info { color: var(--secondary-text-color); background: rgba(var(--rgb-primary-text-color), 0.04); }
      .sensor-message.error { color: #f44336; background: rgba(244, 67, 54, 0.08); }
      .sensor-message.success { color: #4caf50; background: rgba(76, 175, 80, 0.08); }
      
      /* Dashboard Wrapper */
      .dashboard-wrapper { padding: 24px; }
      
      /* Profil Metadaten Header */
      .profile-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--divider-color); flex-wrap: wrap; }
      .profile-icon { color: var(--primary-color); width: 40px; height: 40px; background: rgba(var(--rgb-primary-color), 0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
      .profile-icon svg { width: 24px; height: 24px; }
      .profile-info h2 { margin: 0 0 4px 0; font-size: 18px; font-weight: 500; color: var(--primary-text-color); }
      .profile-info h2 span { color: var(--primary-color); font-weight: 600; }
      .profile-info p { margin: 0; font-size: 13px; color: var(--secondary-text-color); }
      .profile-range { margin-left: auto; display: flex; flex-direction: column; gap: 8px; min-width: 220px; }
      .range-title { font-size: 12px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; }
      .range-fields { display: flex; gap: 8px; flex-wrap: wrap; }
      .range-field { display: flex; flex-direction: column; gap: 4px; }
      .range-field label { font-size: 11px; color: var(--secondary-text-color); }
      .range-field input[type="date"],
      .range-field input[type="week"],
      .range-field input[type="month"],
      .range-field input[type="number"],
      .range-field select { padding: 6px 10px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 12px; }
      .range-picker { width: 100%; }
      .range-quarter-fields { display: flex; gap: 6px; }
      .range-quarter-fields input[type="number"] { width: 92px; }
      .range-actions { display: flex; gap: 8px; }
      .range-actions button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font-size: 12px; cursor: pointer; }
      .range-actions button:first-child { background: var(--primary-color); color: white; border-color: var(--primary-color); }
      .range-message { font-size: 12px; padding: 6px 10px; border-radius: 6px; background: rgba(var(--rgb-primary-text-color), 0.04); }
      .range-message.info { color: var(--secondary-text-color); background: rgba(var(--rgb-primary-text-color), 0.04); }
      .range-message.error { color: #f44336; background: rgba(244, 67, 54, 0.08); }
      .range-message.loading { color: var(--secondary-text-color); }

      .top-dashboard-grid { margin-bottom: 24px; }
      
      .info-box { background-color: rgba(var(--rgb-primary-color), 0.05); border-left: 4px solid var(--primary-color); padding: 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0; }
      .info-box h3 { margin: 0 0 8px 0; font-size: 16px; color: var(--primary-text-color); }
      .info-box p { margin: 0; font-size: 14px; color: var(--primary-text-color); }
      .analysis-groups { display: flex; flex-direction: column; gap: 16px; }
      .analysis-group-title { font-size: 12px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; margin-bottom: 8px; }
      .analysis-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      @media(max-width: 600px) { .analysis-summary-grid { grid-template-columns: 1fr; } }
      .summary-item { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; background: rgba(var(--rgb-primary-text-color), 0.03); padding: 8px 10px; border-radius: 6px; }
      .summary-item span { color: var(--secondary-text-color); }
      .info-icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 999px; background: rgba(var(--rgb-primary-text-color), 0.08); color: var(--secondary-text-color); font-size: 11px; margin-left: 6px; cursor: help; }

      /* Heatmaps Grid */
      .heatmaps-grid { display: grid; grid-template-columns: 1fr; gap: 32px; }
      @media(min-width: 1300px) { .heatmaps-grid { grid-template-columns: 1fr 1fr; } }
      
      .heatmap-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; text-align: left; color: var(--primary-text-color); }
      .heatmap-legend { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--secondary-text-color); margin-bottom: 10px; flex-wrap: wrap; }
      .heatmap-legend-bar { width: 120px; height: 8px; border-radius: 999px; background: linear-gradient(90deg, hsl(120, 85%, 55%), hsl(0, 85%, 55%)); }
      .heatmap-legend-value { font-size: 11px; color: var(--secondary-text-color); }
      .heatmap-grid { display: grid; grid-template-columns: auto repeat(24, 1fr); gap: 2px; font-size: 10px; }
      .heatmap-header-y { display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; color: var(--secondary-text-color); font-weight: 500; }
      .heatmap-header-x { text-align: center; color: var(--secondary-text-color); padding-bottom: 4px; }
      .heatmap-cell { aspect-ratio: 1; border-radius: 2px; cursor: crosshair; transition: transform 0.1s; }
      .heatmap-cell:hover { transform: scale(1.2); box-shadow: 0 0 4px rgba(0,0,0,0.3); z-index: 2; position: relative; }
      .monthly-tariff-panel { background: linear-gradient(160deg, rgba(var(--rgb-primary-text-color), 0.02), rgba(var(--rgb-primary-text-color), 0.04)); border: 1px solid rgba(var(--rgb-divider-color), 0.6); border-radius: 10px; padding: 14px; }
      .monthly-tariff-title { font-size: 15px; font-weight: 600; color: var(--primary-text-color); margin-bottom: 10px; }
      .monthly-tariff-empty { font-size: 13px; color: var(--secondary-text-color); padding: 8px 4px; }
      .monthly-tariff-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      @media(min-width: 900px) { .monthly-tariff-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media(min-width: 1300px) { .monthly-tariff-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      .monthly-cell-card { border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 8px; padding: 10px; min-height: 72px; display: flex; flex-direction: column; justify-content: space-between; }
      .monthly-cell-card.savings { background: color-mix(in srgb, #dff4e8 calc(68% + var(--intensity) * 25%), rgba(var(--rgb-card-background-color), 0.95)); }
      .monthly-cell-card.neutral { background: color-mix(in srgb, #f7f0d9 calc(70% + var(--intensity) * 20%), rgba(var(--rgb-card-background-color), 0.95)); }
      .monthly-cell-card.extra { background: color-mix(in srgb, #f8e0df calc(68% + var(--intensity) * 25%), rgba(var(--rgb-card-background-color), 0.95)); }
      .monthly-cell-card.nodata { background: rgba(var(--rgb-primary-text-color), 0.04); opacity: 0.72; }
      .monthly-cell-head { font-size: 12px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; color: var(--secondary-text-color); margin-bottom: 8px; }
      .monthly-cell-center { font-size: 13px; font-weight: 700; text-align: center; color: var(--primary-text-color); letter-spacing: 0.1px; }
      .monthly-cell-card.savings .monthly-cell-center { color: #317a4e; }
      .monthly-cell-card.neutral .monthly-cell-center { color: #8f7a26; }
      .monthly-cell-card.extra .monthly-cell-center { color: #9b3b3b; }
      .monthly-cell-card.nodata .monthly-cell-center { color: var(--secondary-text-color); }
      .monthly-tariff-total { margin-top: 10px; padding: 8px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.2px; border: 1px solid rgba(var(--rgb-divider-color), 0.5); }
      .monthly-tariff-total.savings { background: rgba(70, 194, 111, 0.12); color: #4fb978; }
      .monthly-tariff-total.neutral { background: rgba(216, 191, 66, 0.14); color: #d4b84b; }
      .monthly-tariff-total.extra { background: rgba(219, 95, 95, 0.14); color: #d86a6a; }
      .card-tax-note { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--divider-color); color: var(--secondary-text-color); text-align: center; font-size: 12px; opacity: 0.9; }

      /* Upload Formular wenn Daten geladen sind */
      #uploadContent.data-loaded { padding: 24px; background: rgba(var(--rgb-primary-text-color), 0.02); border-top: 1px solid var(--divider-color); margin-top: 24px; }
      #uploadContent.data-loaded .dropzone { padding: 20px; border-color: rgba(var(--rgb-divider-color), 0.5); }
      #uploadContent.data-loaded .dropzone h3 { font-size: 15px; }

      /* Allgemeines Upload Styling */
      .upload-container { display: flex; flex-direction: column; gap: 16px; }
      .dropzone { border: 2px dashed var(--divider-color); border-radius: 8px; padding: 32px 16px; text-align: center; cursor: pointer; transition: all 0.3s ease; background-color: var(--secondary-background-color); }
      .dropzone:hover, .dropzone.drag-over { border-color: var(--primary-color); background-color: rgba(var(--rgb-primary-color), 0.05); }
      .upload-icon { width: 48px; height: 48px; margin: 0 auto 16px; color: var(--primary-color); opacity: 0.6; }
      .dropzone h3 { margin: 0 0 8px; color: var(--primary-text-color); }
      .dropzone p { margin: 0; color: var(--secondary-text-color); font-size: 14px; }
      .file-picker-btn { background: none; border: none; color: var(--primary-color); cursor: pointer; text-decoration: underline; font-size: inherit; padding: 0; }
      .file-info { padding: 12px; background-color: var(--secondary-background-color); border-radius: 4px; border-left: 3px solid var(--primary-color); }
      .file-info p { margin: 4px 0; font-size: 14px; }
      .progress-container { display: flex; flex-direction: column; gap: 8px; }
      .progress-bar { width: 0%; height: 4px; background-color: var(--primary-color); border-radius: 2px; transition: width 0.2s ease; }
      #progressText { font-size: 12px; color: var(--secondary-text-color); }
      .response-message { padding: 16px; border-radius: 4px; text-align: center; margin-bottom: 16px; }
      .response-message.success { background-color: rgba(76, 175, 80, 0.1); border-left: 3px solid #4caf50; }
      .response-message.error { background-color: rgba(244, 67, 54, 0.1); border-left: 3px solid #f44336; }
      .success-icon { font-size: 24px; color: #4caf50; margin-bottom: 8px; }
      .error-icon { font-size: 24px; color: #f44336; margin-bottom: 8px; }
      .upload-button, .cancel-button { padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; }
      .upload-button { background-color: var(--primary-color); color: white; }
      .upload-button:hover:not(:disabled) { opacity: 0.9; }
      .upload-button:disabled { opacity: 0.5; cursor: not-allowed; }
      .cancel-button { background-color: var(--secondary-background-color); color: var(--primary-text-color); }
      .cancel-button:hover:not(:disabled) { background-color: var(--divider-color); }
      @media(max-width: 600px) {
        .dashboard-header { padding: 16px; }
        .dashboard-title { font-size: 20px; }
        .source-card { margin: 12px; }
        .source-chooser-header { align-items: flex-start; flex-direction: column; }
      }
    `;
    this.appendChild(style);
  }
}

try {
  if (!customElements.get("smart-energy-insights-upload-card")) {
    customElements.define("smart-energy-insights-upload-card", SmartEnergyInsightsUploadCard);
  }
} catch (err) {
  if (!(err && String(err).includes("already been used"))) throw err;
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: "smart-energy-insights-upload-card",
  name: "Smart Energy Insights - Dashboard",
  description: "Load and analyze energy profiles from sensors or CSV files",
});