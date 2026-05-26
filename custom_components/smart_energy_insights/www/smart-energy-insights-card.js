/**
 * Smart Energy Insights - Load Profile CSV Upload Card
 */

import {
  loadHeatmaps,
  loadSensorData,
  saveSettings,
  setActiveSource,
  uploadCsv
} from "./smart-energy-insights-api.js";
import { generateHeatmapHTML } from "./smart-energy-insights-heatmap.js";
import { calculateSavings } from "./smart-energy-insights-savings.js";
import { renderBaseCard, renderDashboardHtml } from "./smart-energy-insights-templates.js";
import { debounce, formatNumber, formatUploadDate } from "./smart-energy-insights-utils.js";

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
      dateRangeFrom: this.localize("card.date_range_from", "From"),
      dateRangeTo: this.localize("card.date_range_to", "To"),
      dateRangeApply: this.localize("card.date_range_apply", "Apply"),
      dateRangeReset: this.localize("card.date_range_reset", "Reset"),
      dateRangeMissing: this.localize("card.date_range_missing", "Please select both dates."),
      dateRangeInvalid: this.localize("card.date_range_invalid", "Start date must be before end date."),
      dateRangeClamped: this.localize(
        "card.date_range_clamped",
        "Range adjusted to available data."
      ),
      dateRangeLoading: this.localize("card.date_range_loading", "Loading date range..."),
      dateRangeSensorRequired: this.localize("card.date_range_sensor_required", "Please select a sensor first."),
      dateRangeError: this.localize("card.date_range_error", "No data found for this range."),
      tariffSimTitle: this.localize("card.tariff_sim_title", "Tariff simulation"),
      tariffApplyButton: this.localize("card.tariff_apply_button", "Apply tariffs"),
      tariffResetButton: this.localize("card.tariff_reset_button", "Reset tariffs"),
      taxNetLabel: this.localize("card.tax_net_label", "Values are net"),
      taxNetHint: this.localize("card.tax_net_hint", "(Final billing is gross)"),
      taxLabel: this.localize("card.tax_label", "Tax (%)"),
      fixedTariffTitle: this.localize("card.fixed_tariff_title", "Fixed tariff comparison"),
      fixedPriceLabel: this.localize("card.fixed_price_label", "Energy price (ct/kWh)"),
      fixedBaseLabel: this.localize("card.fixed_base_label", "Base fee (EUR/month)"),
      spotTariffTitle: this.localize("card.spot_tariff_title", "Spot tariff (dynamic)"),
      spotMarkupLabel: this.localize("card.spot_markup_label", "Markup (ct/kWh)"),
      spotBaseLabel: this.localize("card.spot_base_label", "Base fee (EUR/month)"),
      disclaimer: this.localize(
        "card.disclaimer",
        "Note: grid fees & charges are identical in both variants."
      ),
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
      cardTaxNote: this.localize(
        "card.card_tax_note",
        "All values in this card include tax."
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

  render() {
    const title =
      this.config?.title || this.localize("panel.card_title", "Load Profile Upload");
    const texts = this.getTexts();
    this._texts = texts;
    if (!this._uiStateLoaded) {
      this.loadUiState();
    }
    if (!this._activeSource) {
      this._activeSource = this._storedSource || "csv";
    }

    if (!this._debouncedSave) {
      this._debouncedSave = debounce((data) => {
        saveSettings(this._hass, data).catch((e) => {
          console.error("Failed to sync settings to HA backend", e);
        });
      }, 600);
    }

    // Grund-HTML: Standardmäßig wird der Header angezeigt, bis Daten da sind.
    this.innerHTML = renderBaseCard(title, texts);

    this.attachEventListeners();
    this.syncSensorPicker();
    this.updateSourceUI();
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
          const sensorLoadBtn = this.querySelector("#sensorLoadBtn");
          if (sensorLoadBtn) sensorLoadBtn.disabled = !value;
        });
      } else {
        sensorPicker.addEventListener("change", (event) => {
          const value = event.target && event.target.value ? event.target.value : null;
          this._selectedSensor = value;
          this.saveUiState();
          const sensorLoadBtn = this.querySelector("#sensorLoadBtn");
          if (sensorLoadBtn) sensorLoadBtn.disabled = !value;
        });
      }
    }
  }

  syncSensorPicker() {
    const picker = this.querySelector("#sensorPicker");
    if (!picker || !this._hass) return;

    const texts = this._texts || this.getTexts();
    const matches = Object.values(this._hass.states || {}).filter((state) => {
      const attrs = state.attributes || {};
      return attrs.device_class === "energy" && attrs.state_class === "total_increasing";
    });

    if (picker.tagName === "HA-ENTITY-PICKER") {
      picker.hass = this._hass;
      picker.label = texts.sensorPickerLabel;
      picker.placeholder = texts.sensorPickerPlaceholder;
      picker.value = this._selectedSensor || "";
      picker.includeDomains = ["sensor"];
    } else {
      picker.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = texts.sensorPickerPlaceholder;
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

      picker.value = this._selectedSensor || "";
      picker.disabled = matches.length === 0;
    }

    const infoMessage = texts.sensorNoneOption;
    const messageEl = this.querySelector("#sensorMessage");
    if (!this._selectedSensor && matches.length === 0) {
      this.showSensorMessage(infoMessage, "info");
    } else if (messageEl && messageEl.classList.contains("info")) {
      messageEl.style.display = "none";
      messageEl.textContent = "";
      messageEl.className = "sensor-message";
    }

    const sensorLoadBtn = this.querySelector("#sensorLoadBtn");
    if (sensorLoadBtn) {
      sensorLoadBtn.disabled = !this._selectedSensor;
    }
  }

  updateSourceUI() {
    const isSensor = this._activeSource === "sensor";
    const sourceSelector = this.querySelector("#sourceSelector");
    const sourceCsvSwitch = this.querySelector("#sourceCsvSwitch");
    const sourceSensorSwitch = this.querySelector("#sourceSensorSwitch");
    const csvSection = this.querySelector("#csvSection");
    const sensorSection = this.querySelector("#sensorSection");

    if (sourceSelector) sourceSelector.style.display = "flex";

    if (sourceCsvSwitch && sourceSensorSwitch) {
      sourceCsvSwitch.classList.toggle("active", !isSensor);
      sourceSensorSwitch.classList.toggle("active", isSensor);
    }

    if (csvSection) csvSection.style.display = isSensor ? "none" : "block";
    if (sensorSection) sensorSection.style.display = isSensor ? "block" : "none";
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
      this.renderDashboard(responseData);
      this.resetUI();
    } catch (error) {
      this.showErrorMessage(error.message);
      uploadBtn.disabled = false; cancelBtn.disabled = false; progressContainer.style.display = "none";
    }
  }

  async loadHeatmapsFromBackend() {
    try {
      const data = await loadHeatmaps(this._hass);
      if (data) {
        if (data.source && !this._storedSource) this._activeSource = data.source;
        if (data.sensor_entity_id) this._selectedSensor = data.sensor_entity_id;
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
    const rangeStartInput = this.querySelector("#rangeStart");
    const rangeEndInput = this.querySelector("#rangeEnd");
    if (!rangeStartInput || !rangeEndInput) return;

    const start = rangeStartInput.value;
    const end = rangeEndInput.value;

    if (!start || !end) {
      this.showRangeMessage(texts.dateRangeMissing, "error");
      return;
    }

    if (start > end) {
      this.showRangeMessage(texts.dateRangeInvalid, "error");
      return;
    }

    const clamped = this.clampDateRange(start, end);
    this._rangeStart = clamped.start;
    this._rangeEnd = clamped.end;
    if (clamped.changed) {
      this.showRangeMessage(texts.dateRangeClamped, "info");
      rangeStartInput.value = clamped.start;
      rangeEndInput.value = clamped.end;
    }
    this.saveUiState();
    await this.reloadRangeData();
  }

  async resetDateRange() {
    this._rangeStart = null;
    this._rangeEnd = null;
    this.saveUiState();
    await this.reloadRangeData();
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

    // 1. Wenn Daten da sind, Standard-Header entfernen und Upload-Feld unauffaelliger machen
    this.querySelector("#defaultHeader").style.display = "none";
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

    const start = response.start ? response.start.split('T')[0] : 'N/A';
    const end = response.end ? response.end.split('T')[0] : 'N/A';
    const availableStart = response.available_start
      ? response.available_start.split("T")[0]
      : start;
    const availableEnd = response.available_end
      ? response.available_end.split("T")[0]
      : end;
    
    this._tariffDefaults = {
      fixPrice: response.fixed_price_ct || 15.0,
      fixBase: response.fixed_base_fee_eur || 4.90,
      markup: response.spot_markup_ct || 1.5,
      spotBase: response.spot_base_fee_eur || 5.99,
      taxRate: response.tax_rate || 20.0,
      inputsAreNet: response.inputs_are_net === true
    };

    if (!this._tariffState) {
      this._tariffState = { ...this._tariffDefaults };
    }

    const initialFix = this._tariffState.fixPrice;
    const initialFixBase = this._tariffState.fixBase;
    const initialMarkup = this._tariffState.markup;
    const initialSpotBase = this._tariffState.spotBase;
    const initialTax = this._tariffState.taxRate;
    const initialTaxChecked = this._tariffState.inputsAreNet === true;

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

    container.innerHTML = renderDashboardHtml({
      filename: filenameStr,
      profileTitle: texts.profileTitle,
      profileMeta,
      heatmapsHtml,
      analysisGroups,
      initialFix,
      initialFixBase,
      initialMarkup,
      initialSpotBase,
      initialTax,
      initialTaxChecked,
      texts
    });

    const rangeStartInput = this.querySelector("#rangeStart");
    const rangeEndInput = this.querySelector("#rangeEnd");
    const applyRangeBtn = this.querySelector("#applyRangeBtn");
    const resetRangeBtn = this.querySelector("#resetRangeBtn");

    this._availableStart = availableStart !== "N/A" ? availableStart : null;
    this._availableEnd = availableEnd !== "N/A" ? availableEnd : null;

    const defaultRangeStart = this._rangeStart || (start !== "N/A" ? start : "");
    const defaultRangeEnd = this._rangeEnd || (end !== "N/A" ? end : "");

    if (rangeStartInput) {
      rangeStartInput.value = defaultRangeStart;
      if (this._availableStart) rangeStartInput.min = this._availableStart;
      if (this._availableEnd) rangeStartInput.max = this._availableEnd;
    }
    if (rangeEndInput) {
      rangeEndInput.value = defaultRangeEnd;
      if (this._availableStart) rangeEndInput.min = this._availableStart;
      if (this._availableEnd) rangeEndInput.max = this._availableEnd;
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

    const inputFix = this.querySelector("#inputFix");
    const inputFixBase = this.querySelector("#inputFixBase");
    const inputMarkup = this.querySelector("#inputMarkup");
    const inputSpotBase = this.querySelector("#inputSpotBase");
    const inputTaxRate = this.querySelector("#inputTaxRate");
    const chkTax = this.querySelector("#chkTax");
    const applyTariffBtn = this.querySelector("#applyTariffBtn");
    const resetTariffBtn = this.querySelector("#resetTariffBtn");

    if (chkTax) {
      chkTax.addEventListener("change", () => this.syncTaxInputState());
    }

    if (applyTariffBtn) {
      applyTariffBtn.addEventListener("click", () => {
        this.applyTariffs();
      });
    }

    if (resetTariffBtn) {
      resetTariffBtn.addEventListener("click", () => {
        if (!this._tariffDefaults) return;
        inputFix.value = this._tariffDefaults.fixPrice;
        inputFixBase.value = this._tariffDefaults.fixBase;
        inputMarkup.value = this._tariffDefaults.markup;
        inputSpotBase.value = this._tariffDefaults.spotBase;
        inputTaxRate.value = this._tariffDefaults.taxRate;
        chkTax.checked = this._tariffDefaults.inputsAreNet === true;
        this._tariffState = { ...this._tariffDefaults };
      });
    }

    this.syncTaxInputState();
    this.updateSavingsBanner(true);
  }

  syncTaxInputState() {
    const chkTax = this.querySelector("#chkTax");
    const taxGroup = this.querySelector(".tax-input-group");
    if (!chkTax || !taxGroup) return;
    taxGroup.style.opacity = chkTax.checked ? "1" : "0.4";
    taxGroup.style.pointerEvents = chkTax.checked ? "auto" : "none";
  }

  async applyTariffs() {
    const texts = this._texts || this.getTexts();
    const applyBtn = this.querySelector("#applyTariffBtn");
    if (applyBtn) applyBtn.disabled = true;

    const valFix = parseFloat(this.querySelector("#inputFix").value) || 0;
    const valFixBase = parseFloat(this.querySelector("#inputFixBase").value) || 0;
    const valMarkup = parseFloat(this.querySelector("#inputMarkup").value) || 0;
    const valSpotBase = parseFloat(this.querySelector("#inputSpotBase").value) || 0;
    const valTaxRate = parseFloat(this.querySelector("#inputTaxRate").value) || 0;
    const inputsAreNet = this.querySelector("#chkTax").checked;

    this._tariffState = {
      fixPrice: valFix,
      fixBase: valFixBase,
      markup: valMarkup,
      spotBase: valSpotBase,
      taxRate: valTaxRate,
      inputsAreNet
    };

    try {
      await saveSettings(this._hass, {
        fixed_price_ct: valFix,
        fixed_base_fee_eur: valFixBase,
        spot_markup_ct: valMarkup,
        spot_base_fee_eur: valSpotBase,
        tax_rate: valTaxRate,
        inputs_are_net: inputsAreNet
      });

      let data;
      if (this._activeSource === "sensor") {
        if (!this._selectedSensor) {
          this.showRangeMessage(texts.dateRangeSensorRequired, "error");
          return;
        }
        data = await loadSensorData(
          this._hass,
          this._selectedSensor,
          this._rangeStart,
          this._rangeEnd,
          { allowEmpty: false }
        );
        this._lastSensorData = data;
      } else {
        data = await loadHeatmaps(
          this._hass,
          this._rangeStart,
          this._rangeEnd,
          { allowEmpty: false }
        );
        this._lastCsvData = data;
      }

      this.renderDashboard(data);
    } catch (error) {
      console.error("Failed to apply tariffs", error);
      this.showRangeMessage(error.message || texts.dateRangeError, "error");
    } finally {
      if (applyBtn) applyBtn.disabled = false;
    }
  }

  updateSavingsBanner(isInitialLoad = false) {
    if (!this.latestData || this.latestData.matched_hours === 0) return;
    const texts = this._texts || this.getTexts();

    const valFix = parseFloat(this.querySelector("#inputFix").value) || 0;
    const valFixBase = parseFloat(this.querySelector("#inputFixBase").value) || 0;
    const valMarkup = parseFloat(this.querySelector("#inputMarkup").value) || 0;
    const valSpotBase = parseFloat(this.querySelector("#inputSpotBase").value) || 0;
    const valTaxRate = parseFloat(this.querySelector("#inputTaxRate").value) || 0;
    const inputsAreNet = this.querySelector("#chkTax").checked;

    if (!isInitialLoad) {
      this._tariffState = {
        fixPrice: valFix,
        fixBase: valFixBase,
        markup: valMarkup,
        spotBase: valSpotBase,
        taxRate: valTaxRate,
        inputsAreNet
      };
    }

    const savings = calculateSavings(this.latestData, {
      fixPrice: valFix,
      fixBase: valFixBase,
      markup: valMarkup,
      spotBase: valSpotBase,
      taxRate: valTaxRate,
      inputsAreNet
    });
    if (!savings) return;

    const { savingsEur, costFixEur, costSpotEur } = savings;

    const matchedHours = this.latestData.matched_hours || 0;
    const matchedDays = matchedHours > 0 ? matchedHours / 24 : 0;
    const matchedDaysRoundedUp = matchedDays > 0 ? Math.ceil(matchedDays) : 0;
    const dailySavings = matchedDays > 0 ? savingsEur / matchedDays : null;
    const monthlySavings = dailySavings !== null ? dailySavings * 30 : null;
    const yearlySavings = dailySavings !== null ? dailySavings * 365 : null;
    const fixPerDay = matchedDays > 0 ? costFixEur / matchedDays : null;
    const spotPerDay = matchedDays > 0 ? costSpotEur / matchedDays : null;
    const breakEvenFixed = this.calculateBreakEvenFixed({
      matchedConsumption: this.latestData.matched_consumption,
      durationMonths: this.latestData.duration_months,
      baseSpotCostEur: this.latestData.base_spot_cost_eur,
      fixBase: valFixBase,
      markup: valMarkup,
      spotBase: valSpotBase,
      taxRate: valTaxRate,
      inputsAreNet
    });
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
          ${extrapolatedNote ? `<div style="font-size: 11px; color: var(--secondary-text-color);">${extrapolatedNote} <span class="info-icon" title="${texts.savingsExtrapolatedHelp}">i</span></div>` : ""}
        </div>
      </div>
    `;
  }

  calculateBreakEvenFixed(inputs) {
    if (!inputs.matchedConsumption || !inputs.durationMonths || inputs.baseSpotCostEur === undefined) return null;
    const taxMultiplier = inputs.inputsAreNet ? 1.0 + inputs.taxRate / 100.0 : 1.0;
    const grossMarkup = inputs.inputsAreNet ? inputs.markup * taxMultiplier : inputs.markup;
    const grossSpotBase = inputs.inputsAreNet ? inputs.spotBase * taxMultiplier : inputs.spotBase;
    const grossFixBase = inputs.inputsAreNet ? inputs.fixBase * taxMultiplier : inputs.fixBase;

    const baseSpotCostEurAdjusted = inputs.inputsAreNet
      ? inputs.baseSpotCostEur
      : inputs.baseSpotCostEur * (1.0 + inputs.taxRate / 100.0);
    const avgSpotPrice = (baseSpotCostEurAdjusted * 100.0 / inputs.matchedConsumption);
    const breakEvenFixed = avgSpotPrice + grossMarkup + (inputs.durationMonths * (grossSpotBase - grossFixBase) * 100.0 / inputs.matchedConsumption);
    return Number.isFinite(breakEvenFixed) ? breakEvenFixed : null;
  }

  buildAnalysisGroups(summary) {
    const texts = this._texts || this.getTexts();
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
      this._rangeStart = parsed.rangeStart || null;
      this._rangeEnd = parsed.rangeEnd || null;
      this._selectedSensor = parsed.selectedSensor || this._selectedSensor;
    } catch (err) {
      console.warn("Failed to load UI state", err);
    }
  }

  saveUiState() {
    try {
      const payload = {
        activeSource: this._activeSource,
        rangeStart: this._rangeStart,
        rangeEnd: this._rangeEnd,
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
      .card-header { padding: 16px; border-bottom: 1px solid var(--divider-color); }
      .title { font-size: 18px; font-weight: 500; color: var(--primary-text-color); }
      .card-content { padding: 16px; }

      .source-chooser { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-bottom: 1px solid var(--divider-color); background: var(--card-background-color); }
      .source-chooser-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .source-chooser-title { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .source-chooser-desc { font-size: 12px; color: var(--secondary-text-color); }
      .source-selector-buttons { display: inline-flex; border: 1px solid var(--divider-color); border-radius: 999px; overflow: hidden; background: var(--secondary-background-color); }
      .source-switch { padding: 6px 14px; border: none; background: transparent; color: var(--primary-text-color); cursor: pointer; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
      .source-switch.active { background: var(--primary-color); color: white; }

      .upload-card { width: 100%; max-width: 1200px; margin: 0 auto; height: fit-content; }
      .source-section { padding: 16px; background: rgba(var(--rgb-primary-text-color), 0.02); border-bottom: 1px solid var(--divider-color); }
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
      .range-field input[type="date"] { padding: 6px 10px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 12px; }
      .range-actions { display: flex; gap: 8px; }
      .range-actions button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font-size: 12px; cursor: pointer; }
      .range-actions button:first-child { background: var(--primary-color); color: white; border-color: var(--primary-color); }
      .range-message { font-size: 12px; padding: 6px 10px; border-radius: 6px; background: rgba(var(--rgb-primary-text-color), 0.04); }
      .range-message.info { color: var(--secondary-text-color); background: rgba(var(--rgb-primary-text-color), 0.04); }
      .range-message.error { color: #f44336; background: rgba(244, 67, 54, 0.08); }
      .range-message.loading { color: var(--secondary-text-color); }

      /* Top Grid: Banner & Settings */
      .top-dashboard-grid { display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 24px; }
      @media(min-width: 1100px) { .top-dashboard-grid { grid-template-columns: 1fr 1fr; } }
      
      .interactive-settings { background-color: var(--secondary-background-color); padding: 24px; border-radius: 8px; border: 1px solid rgba(var(--rgb-divider-color), 0.5); }
      .interactive-settings h4 { margin: 0 0 20px 0; color: var(--primary-text-color); font-size: 16px; display: flex; align-items: center; gap: 8px; }
      
      .tax-toggle { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px dashed var(--divider-color); }
      .checkbox-container { display: flex; align-items: center; cursor: pointer; font-size: 13px; color: var(--primary-text-color); }
      .checkbox-container input { margin-right: 12px; width: 16px; height: 16px; accent-color: var(--primary-color); cursor: pointer; }
      .tax-input-group { display: flex; align-items: center; gap: 12px; transition: opacity 0.2s; background: var(--card-background-color); padding: 4px 12px; border-radius: 4px; border: 1px solid rgba(var(--rgb-divider-color), 0.5); }
      .tax-input-group label { font-size: 13px; color: var(--primary-text-color); white-space: nowrap; font-weight: 500; }
      .tax-input-group input[type="number"] { width: 60px; padding: 4px 8px; border: none; background: transparent; color: var(--primary-text-color); font-size: 14px; outline: none; }
      
      .inputs-container { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      @media(max-width: 600px) { .inputs-container { grid-template-columns: 1fr; } }
      .input-box { padding: 16px; background: rgba(var(--rgb-primary-text-color), 0.03); border-radius: 6px; }
      .input-box-title { font-weight: 600; margin-bottom: 16px; font-size: 14px; color: var(--primary-color); }
      .input-group { margin-bottom: 12px; }
      .input-group:last-child { margin-bottom: 0; }
      .input-group label { display: block; margin-bottom: 6px; color: var(--secondary-text-color); font-size: 12px; }
      .input-group input[type="number"] { width: 100%; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 4px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 14px; box-sizing: border-box; transition: all 0.2s; }
      .input-group input[type="number"]:focus { outline: none; border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color); }
      
      .disclaimer { margin-top: 20px; font-size: 11px; color: var(--secondary-text-color); opacity: 0.8; line-height: 1.4; text-align: center; }
      .tariff-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
      .tariff-actions { gap: 8px; }
      .primary-button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--primary-color); background: var(--primary-color); color: white; font-size: 12px; cursor: pointer; }
      .primary-button:hover:not(:disabled) { opacity: 0.9; }
      .primary-button:disabled { opacity: 0.6; cursor: not-allowed; }
      .secondary-button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font-size: 12px; cursor: pointer; }
      .secondary-button:hover { background: var(--secondary-background-color); }
      
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
  description: "Upload load profile CSV files & simulate tariffs",
});