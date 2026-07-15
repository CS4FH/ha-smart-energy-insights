/**
 * Smart Energy Insights - Load Profile CSV Upload Card
 */

import {
  loadHeatmaps,
  loadSensorData,
  setActiveSource,
  uploadCsv
} from "./smart-energy-insights-api.js";
import { generateHeatmapHTML } from "./smart-energy-insights-heatmap.js?v=20260715a";
import { renderBaseCard, renderDashboardHtml } from "./smart-energy-insights-templates.js";
import { formatNumber } from "./smart-energy-insights-utils.js";

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
      currentProfileLabel: this.localize("card.current_profile_label", "Current profile:"),
      switchSourceButton: this.localize("card.switch_source_button", "Switch source"),
      detailedAnalysisTitle: this.localize("card.detailed_analysis_title", "Detailed analysis"),
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
      dashboardTabMonthly: this.localize("card.dashboard_tab_monthly", "Monthly comparison"),
      dashboardTabUsage: this.localize("card.dashboard_tab_usage", "Usage behavior"),
      dashboardTabTechnical: this.localize("card.dashboard_tab_technical", "Technical details"),
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
      analysisSectionRangeTitle: this.localize("card.analysis_section_range_title", "Measurement window"),
      analysisSectionConsumptionTitle: this.localize("card.analysis_section_consumption_title", "Consumption analysis"),
      analysisSectionTariffTitle: this.localize("card.analysis_section_tariff_title", "Tariff and market analysis"),
      analysisMaxPeakLabel: this.localize("card.analysis_max_peak_label", "Max peak"),
      analysisBaseLoadLabel: this.localize("card.analysis_base_load_label", "Base load (P05)"),
      analysisDailySpreadLabel: this.localize("card.analysis_daily_spread_label", "Avg daily price spread"),
      analysisSpotStdDevLabel: this.localize("card.analysis_spot_std_dev_label", "Spot price std. dev."),
      analysisPlaceholderValue: this.localize("card.analysis_placeholder_value", "-"),
      avgConsumptionLabel: this.localize("card.avg_consumption_label", "Avg consumption"),
      avgPriceLabel: this.localize("card.avg_price_label", "Avg spot price (net)"),
      heatmapLegendLow: this.localize("card.heatmap_legend_low", "Low"),
      heatmapLegendHigh: this.localize("card.heatmap_legend_high", "High"),
      heatmapConsumptionTitle: this.localize(
        "card.heatmap_consumption_title",
        "Consumption heatmap (kWh)"
      ),
      heatmapPriceTitle: this.localize(
        "card.heatmap_price_title",
        "Spot price heatmap (ct/kWh)"
      ),
      heatmapConsumptionModeLabel: this.localize("card.heatmap_consumption_mode_label", "Consumption view"),
      heatmapConsumptionModeAbsolute: this.localize("card.heatmap_consumption_mode_absolute", "Absolute"),
      heatmapConsumptionModeRelativeMean: this.localize("card.heatmap_consumption_mode_relative_mean", "Relative to average"),
      heatmapConsumptionModeRelativeWeekday: this.localize("card.heatmap_consumption_mode_relative_weekday", "Relative to weekday profile"),
      heatmapConsumptionAbsoluteInfo: this.localize(
        "card.heatmap_consumption_absolute_info",
        "Ref: absolute consumption"
      ),
      heatmapConsumptionRefMean: (reference) => this.localize(
        "card.heatmap_consumption_ref_mean",
        "Ref: {reference} kWh (Average)",
        { reference }
      ),
      heatmapConsumptionRefWeekday: this.localize(
        "card.heatmap_consumption_ref_weekday",
        "Ref: 0 kWh (Weekday profile)"
      ),
      heatmapSpotModeLabel: this.localize("card.heatmap_spot_mode_label", "Spot view"),
      heatmapSpotModeAbsolute: this.localize("card.heatmap_spot_mode_absolute", "Absolute"),
      heatmapSpotModeFixed: this.localize("card.heatmap_spot_mode_fixed", "Relative to fixed"),
      heatmapSpotModeBreakEven: this.localize("card.heatmap_spot_mode_break_even", "Relative to break-even"),
      heatmapPriceAbsoluteInfo: this.localize(
        "card.heatmap_price_absolute_info",
        "Ref: absolute spot price"
      ),
      heatmapPriceRefFixed: (reference) => this.localize(
        "card.heatmap_price_ref_fixed",
        "Ref: {reference} ct/kWh (Fixed)",
        { reference }
      ),
      heatmapPriceRefBreakEven: (reference) => this.localize(
        "card.heatmap_price_ref_break_even",
        "Ref: {reference} ct/kWh (Break-even)",
        { reference }
      ),
      heatmapSeasonWholeYear: this.localize("card.heatmap_season_whole_year", "Whole year"),
      heatmapSeasonSpring: this.localize("card.heatmap_season_spring", "Spring"),
      heatmapSeasonSummer: this.localize("card.heatmap_season_summer", "Summer"),
      heatmapSeasonAutumn: this.localize("card.heatmap_season_autumn", "Autumn"),
      heatmapSeasonWinter: this.localize("card.heatmap_season_winter", "Winter"),
      heatmapLegendLower: this.localize("card.heatmap_legend_lower", "Lower"),
      heatmapLegendHigher: this.localize("card.heatmap_legend_higher", "Higher"),
      heatmapLegendCheaper: this.localize("card.heatmap_legend_cheaper", "Cheaper"),
      heatmapLegendExpensive: this.localize("card.heatmap_legend_expensive", "More expensive"),
      monthlyTariffTitle: this.localize(
        "card.monthly_tariff_title",
        "Monthly tariff balance"
      ),
      monthlyTariffInfo: this.localize(
        "card.monthly_tariff_info",
        "Each month shows the cost difference of dynamic tariff versus fixed tariff. Negative means savings with dynamic, positive means extra cost."
      ),
      monthlyTariffSavingsLabel: this.localize("card.monthly_tariff_savings_label", "Savings vs fixed"),
      monthlyTariffExtraLabel: this.localize("card.monthly_tariff_extra_label", "Extra costs vs fixed"),
      monthlyTariffTotalLabel: this.localize("card.monthly_tariff_total_label", "Total"),
      monthlyTariffNoData: this.localize("card.monthly_tariff_no_data", "No matched tariff data in this period."),
      monthlyTariffTooltipDelta: this.localize("card.monthly_tariff_tooltip_delta", "Delta"),
      monthlyTariffTooltipHours: this.localize("card.monthly_tariff_tooltip_hours", "Hours"),
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
    this.updateLayoutVisibility();
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
    const sourceCsvSwitch = this.querySelector("#sourceCsvSwitch");
    const sourceSensorSwitch = this.querySelector("#sourceSensorSwitch");
    const csvSection = this.querySelector("#csvSection");
    const sensorSection = this.querySelector("#sensorSection");

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
  }

  hasLoadedData(data) {
    if (!data || typeof data !== "object") return false;
    const count = Number(data.count || data.matched_hours || 0);
    return Number.isFinite(count) && count > 0;
  }

  updateLayoutVisibility() {
    const sourceSelector = this.querySelector("#sourceSelector");
    const dashboardContainer = this.querySelector("#dashboardContainer");
    const hasData = this.hasLoadedData(this.latestData);

    if (!hasData) {
      if (sourceSelector) sourceSelector.style.display = "block";
      if (dashboardContainer) dashboardContainer.style.display = "none";
      return;
    }

    if (sourceSelector) {
      sourceSelector.style.display = this._sourcePanelOpen ? "block" : "none";
    }
    if (dashboardContainer) {
      dashboardContainer.style.display = "block";
    }
  }

  scrollViewToTop() {
    const scrollers = [];
    const seen = new Set();

    const addScroller = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      scrollers.push(el);
    };

    let node = this.parentElement;
    while (node) {
      const canScroll = node.scrollHeight - node.clientHeight > 8;
      if (canScroll) addScroller(node);
      node = node.parentElement;
    }

    addScroller(document.scrollingElement);
    addScroller(document.documentElement);
    addScroller(document.body);

    scrollers.forEach((el) => {
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        el.scrollTop = 0;
      }
    });

    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  clearDashboardForSourceSwitch() {
    const container = this.querySelector("#dashboardContainer");
    this.latestData = null;
    this._sourcePanelOpen = true;
    if (container) {
      container.innerHTML = "";
    }
    this.updateLayoutVisibility();
  }

  navigateToIntegrations() {
    window.history.pushState(null, "", "/config/integrations");
    window.dispatchEvent(new Event("location-changed"));
  }

  async selectSource(source) {
    if (this._activeSource === source) return;
    this._activeSource = source;
    this._sourcePanelOpen = true;
    this.saveUiState();
    this.updateSourceUI();
    this.updateLayoutVisibility();

    try {
      await setActiveSource(this._hass, source);
    } catch (err) {
      console.error("Failed to persist source", err);
    }

    if (source === "csv" && this._lastCsvData) {
      this.showSensorMessage("", "");
      this.renderDashboard(this._lastCsvData, { collapseSourcePanel: false });
      return;
    }

    if (source === "csv") {
      this.showSensorMessage("", "");
      this.clearDashboardForSourceSwitch();
      return;
    }

    if (source === "sensor") {
      if (this._lastSensorData) {
        this.renderDashboard(this._lastSensorData, { collapseSourcePanel: false });
      } else {
        this.clearDashboardForSourceSwitch();
        this.showSensorMessage("", "");
      }
    }
  }

  showSensorMessage(message, type) {
    const el = this.querySelector("#sensorMessage");
    if (!el) return;
    if (!message) {
      el.style.display = "none";
      el.className = "sensor-message";
      el.textContent = "";
      return;
    }
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
      this.renderDashboard(data, { collapseSourcePanel: true });
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
      this.renderDashboard(responseData, { collapseSourcePanel: true });
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
          this.renderDashboard(data, { collapseSourcePanel: true });
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

  renderDashboard(response, options = {}) {
    const container = this.querySelector("#dashboardContainer");
    if (!container) return;
    const texts = this._texts || this.getTexts();
    const collapseSourcePanel = options.collapseSourcePanel === true;

    if (!this.hasLoadedData(response)) {
      this.clearDashboardForSourceSwitch();
      return;
    }

    this.latestData = response;
    if (collapseSourcePanel) {
      this._sourcePanelOpen = false;
    }
    this.updateLayoutVisibility();
    if (response.source === "sensor" && response.sensor_entity_id) {
      this._loadedSensorEntityId = response.sensor_entity_id;
    }

    if (this._activeSource !== "sensor") {
      this.querySelector("#uploadContent").classList.add("data-loaded");
      this.querySelector("#uploadTitle").textContent = texts.uploadAnotherTitle;
    }

    const heatmapsHtml = this.buildSeasonalHeatmapsHtml(response);
    const monthlyTariffHtml = this.buildMonthlyTariffComparisonHtml(response);

    const start = response.start ? response.start.split('T')[0] : 'N/A';
    const end = response.end ? response.end.split('T')[0] : 'N/A';
    
    const filenameStr = response.filename || texts.profileDefaultFilename;
    const avgConsumptionStr = formatNumber(response.avg_consumption_kwh, 3);
    const avgPriceStr = formatNumber(response.avg_price_ct_kwh, 2);

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
      maxPeak: response.max_peak_kwh,
      baseLoadP05: response.base_load_p05_kwh,
      dailyPriceSpread: response.avg_daily_price_spread_ct_kwh,
      spotPriceStdDev: response.spot_price_stddev_ct_kwh,
      breakEvenSpot: response.break_even_fixed_ct_kwh,
      spotCheaperShare: response.spot_cheaper_share
    });

    if (!this._dashboardTab) this._dashboardTab = "monthly";

    container.innerHTML = renderDashboardHtml({
      filename: filenameStr,
      heatmapsHtml,
      monthlyTariffHtml,
      analysisGroups,
      texts,
      dashboardTab: this._dashboardTab
    });

    this.querySelectorAll("[data-dashboard-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.dashboardTab || "monthly";
        this._dashboardTab = tab;
        this.saveUiState();
        this.querySelectorAll("[data-dashboard-tab]").forEach((tabButton) => {
          const isActive = tabButton.dataset.dashboardTab === tab;
          tabButton.classList.toggle("active", isActive);
          tabButton.setAttribute("aria-selected", String(isActive));
        });
        this.querySelectorAll("[data-dashboard-tab-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.dashboardTabPanel !== tab;
        });
      });
    });

    this.querySelectorAll("[data-heatmap-season]").forEach((button) => {
      button.addEventListener("click", () => {
        this._heatmapSeason = button.dataset.heatmapSeason || "whole_year";
        this.saveUiState();
        this.renderDashboard(this.latestData, { collapseSourcePanel: false });
      });
    });

    this.querySelectorAll("[data-consumption-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        this._consumptionMode = button.dataset.consumptionMode || "absolute";
        this.saveUiState();
        this.renderDashboard(this.latestData, { collapseSourcePanel: false });
      });
    });

    this.querySelectorAll("[data-spot-price-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        this._spotPriceMode = button.dataset.spotPriceMode || "break_even";
        this.saveUiState();
        this.renderDashboard(this.latestData, { collapseSourcePanel: false });
      });
    });

    const toggleSourcePanelBtn = this.querySelector("#toggleSourcePanelBtn");
    if (toggleSourcePanelBtn) {
      toggleSourcePanelBtn.addEventListener("click", () => {
        this._sourcePanelOpen = !this._sourcePanelOpen;
        this.updateLayoutVisibility();
        if (this._sourcePanelOpen) {
          requestAnimationFrame(() => {
            this.scrollViewToTop();
          });
        }
      });
    }

    this.updateSavingsBanner(true);
  }

  buildSeasonalHeatmapsHtml(response) {
    const texts = this._texts || this.getTexts();
    const seasons = [
      { key: "whole_year", label: texts.heatmapSeasonWholeYear },
      { key: "spring", label: texts.heatmapSeasonSpring },
      { key: "summer", label: texts.heatmapSeasonSummer },
      { key: "autumn", label: texts.heatmapSeasonAutumn },
      { key: "winter", label: texts.heatmapSeasonWinter },
    ];
    const selectedSeason = this._heatmapSeason || "whole_year";
    const selectedConsumptionMode = this._consumptionMode || "absolute";
    const selectedSpotMode = this._spotPriceMode || "break_even";
    const wholeYearHeatmaps = {
      consumption_heatmap: response.consumption_heatmap,
      price_heatmap: response.price_heatmap,
    };
    const fixedPrice = Number(response.fixed_price_ct);
    const breakEvenFixed = Number(response.break_even_fixed_ct_kwh);
    const hasFixedPrice = Number.isFinite(fixedPrice);
    const hasBreakEven = Number.isFinite(breakEvenFixed);

    const resolvedSpotMode = this.resolveSpotPriceMode(selectedSpotMode, hasFixedPrice, hasBreakEven);
    const priceReference = resolvedSpotMode === "break_even"
      ? breakEvenFixed
      : resolvedSpotMode === "fixed"
        ? fixedPrice
        : null;

    const wholeYearPriceDisplayHeatmap = Number.isFinite(priceReference)
      ? this.computePriceDeltaHeatmap(wholeYearHeatmaps.price_heatmap, priceReference)
      : wholeYearHeatmaps.price_heatmap;
    const seasonalHeatmaps = response.seasonal_heatmaps || {};

    const seasonHeatmaps = seasons.map((season) => (
      season.key === "whole_year"
        ? wholeYearHeatmaps
        : seasonalHeatmaps[season.key] || wholeYearHeatmaps
    ));

    const consumptionDisplayHeatmaps = seasonHeatmaps.map((heatmaps) =>
      this.computeConsumptionDisplayHeatmap(
        heatmaps.consumption_heatmap,
        selectedConsumptionMode
      )
    );
    const consumptionScale = selectedConsumptionMode === "absolute"
      ? this.computeAbsoluteConsumptionScaleFromMany(consumptionDisplayHeatmaps)
      : this.computeSymmetricHeatmapScaleFromMany(consumptionDisplayHeatmaps);

    const priceDisplayHeatmaps = seasonHeatmaps.map((heatmaps) =>
      Number.isFinite(priceReference)
        ? this.computePriceDeltaHeatmap(heatmaps.price_heatmap, priceReference)
        : heatmaps.price_heatmap
    );
    const priceScale = Number.isFinite(priceReference)
      ? this.computeSymmetricHeatmapScaleFromMany(priceDisplayHeatmaps)
      : this.computeRobustHeatmapScaleFromMany(priceDisplayHeatmaps);

    const buttons = seasons
      .map((season) => `
        <button class="heatmap-season-button${season.key === selectedSeason ? " active" : ""}" data-heatmap-season="${season.key}" aria-pressed="${String(season.key === selectedSeason)}">${season.label}</button>
      `)
      .join("");

    const consumptionModeButtons = [
      { key: "absolute", label: texts.heatmapConsumptionModeAbsolute },
      { key: "relative_mean", label: texts.heatmapConsumptionModeRelativeMean },
      { key: "relative_weekday", label: texts.heatmapConsumptionModeRelativeWeekday },
    ]
      .map((mode) => {
        const isActive = selectedConsumptionMode === mode.key;
        return `
          <button
            class="consumption-mode-button${isActive ? " active" : ""}"
            data-consumption-mode="${mode.key}"
            aria-pressed="${String(isActive)}"
          >${mode.label}</button>
        `;
      })
      .join("");

    const spotModeButtons = [
      { key: "absolute", label: texts.heatmapSpotModeAbsolute },
      { key: "fixed", label: texts.heatmapSpotModeFixed, disabled: !hasFixedPrice },
      { key: "break_even", label: texts.heatmapSpotModeBreakEven, disabled: !hasBreakEven },
    ]
      .map((mode) => {
        const isActive = resolvedSpotMode === mode.key;
        return `
          <button
            class="spot-mode-button${isActive ? " active" : ""}"
            data-spot-price-mode="${mode.key}"
            aria-pressed="${String(isActive)}"
            ${mode.disabled ? "disabled" : ""}
          >${mode.label}</button>
        `;
      })
      .join("");

    const panels = seasons
      .map((season) => {
        const data = season.key === "whole_year"
          ? wholeYearHeatmaps
          : seasonalHeatmaps[season.key] || wholeYearHeatmaps;
        const seasonPriceHeatmap = Number.isFinite(priceReference)
          ? this.computePriceDeltaHeatmap(data.price_heatmap, priceReference)
          : data.price_heatmap;
        const seasonConsumptionHeatmap = this.computeConsumptionDisplayHeatmap(
          data.consumption_heatmap,
          selectedConsumptionMode
        );
        let consumptionInfoText = texts.heatmapConsumptionAbsoluteInfo;
        if (selectedConsumptionMode === "relative_mean") {
          const meanRef = this.computeHeatmapMean(data.consumption_heatmap);
          consumptionInfoText = texts.heatmapConsumptionRefMean(formatNumber(meanRef, 3));
        } else if (selectedConsumptionMode === "relative_weekday") {
          consumptionInfoText = texts.heatmapConsumptionRefWeekday;
        }

        const consumptionHtml = generateHeatmapHTML(
          seasonConsumptionHeatmap,
          texts.heatmapConsumptionTitle,
          "kWh",
          false,
          formatNumber,
          selectedConsumptionMode === "absolute"
            ? { low: texts.heatmapLegendLow, high: texts.heatmapLegendHigh }
            : { low: texts.heatmapLegendLower, high: texts.heatmapLegendHigher },
          consumptionScale,
          consumptionInfoText ? { infoText: consumptionInfoText } : null
        );
        const referenceFormatted = Number.isFinite(priceReference) ? formatNumber(priceReference, 2) : "-";
        let priceInfoText = texts.heatmapPriceAbsoluteInfo;
        if (resolvedSpotMode === "fixed") {
          priceInfoText = texts.heatmapPriceRefFixed(referenceFormatted);
        } else if (resolvedSpotMode === "break_even") {
          priceInfoText = texts.heatmapPriceRefBreakEven(referenceFormatted);
        }

        const priceHtml = generateHeatmapHTML(
          seasonPriceHeatmap,
          texts.heatmapPriceTitle,
          "ct/kWh",
          false,
          formatNumber,
          Number.isFinite(priceReference)
            ? { low: texts.heatmapLegendCheaper, high: texts.heatmapLegendExpensive }
            : { low: texts.heatmapLegendLow, high: texts.heatmapLegendHigh },
          priceScale,
          priceInfoText ? { infoText: priceInfoText } : null
        );

        return `
          <div class="heatmap-season-panel" data-heatmap-panel="${season.key}"${season.key === selectedSeason ? "" : " hidden"}>
            <section class="heatmap-subcard heatmap-subcard-consumption">
              <div class="heatmap-subcard-controls consumption-mode-navigation" role="group" aria-label="Consumption mode">
                <span class="spot-mode-label">${texts.heatmapConsumptionModeLabel}</span>
                <div class="consumption-mode-buttons">${consumptionModeButtons}</div>
              </div>
              ${consumptionHtml}
            </section>
            <section class="heatmap-subcard heatmap-subcard-spot">
              <div class="heatmap-subcard-controls spot-mode-navigation" role="group" aria-label="Spot mode">
                <span class="spot-mode-label">${texts.heatmapSpotModeLabel}</span>
                <div class="spot-mode-buttons">${spotModeButtons}</div>
              </div>
              ${priceHtml}
            </section>
          </div>
        `;
      })
      .join("");

    return `
      <section class="seasonal-heatmaps">
        <div class="heatmap-season-navigation" role="group" aria-label="Heatmap season">
          ${buttons}
        </div>
        ${panels}
      </section>
    `;
  }

  resolveSpotPriceMode(requestedMode, hasFixedPrice, hasBreakEven) {
    if (requestedMode === "fixed") {
      return hasFixedPrice ? "fixed" : (hasBreakEven ? "break_even" : "absolute");
    }
    if (requestedMode === "break_even") {
      return hasBreakEven ? "break_even" : (hasFixedPrice ? "fixed" : "absolute");
    }
    return "absolute";
  }

  computeConsumptionDisplayHeatmap(consumptionHeatmap, mode) {
    const base = (consumptionHeatmap || []).map((row) => (row || []).map((value) => Number(value) || 0));
    if (mode === "relative_mean") {
      const mean = this.computeHeatmapMean(base);
      return base.map((row) => row.map((value) => Number((value - mean).toFixed(4))));
    }
    if (mode === "relative_weekday") {
      return this.computeHourProfileDeltaHeatmap(base);
    }
    return base;
  }

  computeHourProfileDeltaHeatmap(heatmapData) {
    const columnMeans = Array.from({ length: 24 }, (_, hour) => {
      let sum = 0;
      let count = 0;
      for (let day = 0; day < heatmapData.length; day += 1) {
        const value = heatmapData[day]?.[hour];
        if (Number.isFinite(value)) {
          sum += value;
          count += 1;
        }
      }
      return count > 0 ? sum / count : 0;
    });

    return heatmapData.map((row) =>
      row.map((value, hour) => Number((value - columnMeans[hour]).toFixed(4)))
    );
  }

  computeHeatmapMean(heatmapData) {
    const values = (heatmapData || [])
      .flat()
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  computeRobustHeatmapScale(heatmapData) {
    const flatValues = this.flattenHeatmapValues(heatmapData);
    if (flatValues.length === 0) {
      return { min: 0, max: 1 };
    }

    const sorted = flatValues.slice().sort((a, b) => a - b);
    const percentile = (p) => {
      const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
      return sorted[idx];
    };

    let min = percentile(0.05);
    let max = percentile(0.95);
    if (!(Number.isFinite(min) && Number.isFinite(max)) || max <= min) {
      min = sorted[0];
      max = sorted[sorted.length - 1];
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 1 };
    }

    if (max <= min) {
      max = min + 1;
    }

    return { min, max };
  }

  computeRobustHeatmapScaleFromMany(heatmapDataList) {
    return this.computeRobustHeatmapScale(
      this.flattenHeatmapValues(heatmapDataList)
    );
  }

  computeAbsoluteConsumptionScaleFromMany(heatmapDataList) {
    const observedValues = this.flattenHeatmapValues(heatmapDataList, { excludeZero: true });
    if (observedValues.length === 0) {
      return this.computeRobustHeatmapScaleFromMany(heatmapDataList);
    }

    const sorted = observedValues.slice().sort((a, b) => a - b);
    const maxIdx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.98)));
    const min = sorted[0];
    let max = sorted[maxIdx];

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return this.computeRobustHeatmapScaleFromMany(heatmapDataList);
    }

    if (max <= min) {
      max = min + 1;
    }

    return { min, max };
  }

  computePriceDeltaHeatmap(priceHeatmap, breakEvenFixed) {
    return (priceHeatmap || []).map((row) =>
      (row || []).map((value) => {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          return 0;
        }
        return Number((numericValue - breakEvenFixed).toFixed(4));
      })
    );
  }

  computeSymmetricHeatmapScale(heatmapData) {
    const values = this.flattenHeatmapValues(heatmapData);
    if (values.length === 0) {
      return { min: -1, max: 1, center: 0 };
    }

    const absValues = values.map((value) => Math.abs(value)).sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(absValues.length - 1, Math.floor((absValues.length - 1) * 0.95)));
    const limit = absValues[idx] > 0 ? absValues[idx] : (absValues[absValues.length - 1] || 1);

    return {
      min: -limit,
      max: limit,
      center: 0,
    };
  }

  computeSymmetricHeatmapScaleFromMany(heatmapDataList) {
    return this.computeSymmetricHeatmapScale(
      this.flattenHeatmapValues(heatmapDataList)
    );
  }

  flattenHeatmapValues(heatmapData, options = {}) {
    const excludeZero = options.excludeZero === true;
    return (heatmapData || [])
      .flat(Infinity)
      .filter((value) => Number.isFinite(value))
      .filter((value) => !excludeZero || value !== 0);
  }

  updateSavingsBanner() {
    if (!this.latestData || this.latestData.matched_hours === 0) return;
    const texts = this._texts || this.getTexts();
    const totals = this.latestData.tariff_totals;
    if (!totals) return;

    const costFixEur = Number(totals.fixed_cost_eur || 0);
    const costSpotEur = Number(totals.spot_cost_eur || 0);
    const savingsEur = costFixEur - costSpotEur;
    const breakEvenFixed = this.latestData.break_even_fixed_ct_kwh;
    const spotCheaperShare = this.latestData.spot_cheaper_share;

    const bannerContainer = this.querySelector("#dynamicSavingsBanner");
    const isPositive = savingsEur >= 0;
    const savColor = isPositive ? "#4caf50" : "#f44336";
    const savBg = isPositive ? "rgba(76, 175, 80, 0.1)" : "rgba(244, 67, 54, 0.1)";
    const savIcon = isPositive ? "💰" : "⚠️";
    const savTitle = isPositive ? texts.savingsTitlePositive : texts.savingsTitleNegative;
    const savMessage = isPositive ? texts.savingsMessagePositive : texts.savingsMessageNegative;

    bannerContainer.innerHTML = `
      <div class="savings-hero-card" style="background-color: ${savBg}; border-left-color: ${savColor};">
        <div class="savings-hero-head">
          <div class="savings-hero-icon">${savIcon}</div>
          <div class="savings-hero-main">
            <div class="savings-hero-title">
              ${savTitle}
            </div>
            <div class="savings-hero-value">
              ${formatNumber(Math.abs(savingsEur), 2)} €
            </div>
          </div>
        </div>
        <div class="savings-hero-message">
          ${savMessage}
        </div>
      </div>

      <div class="kpi-grid" role="list" aria-label="Tariff KPIs">
        <div class="kpi-card" role="listitem">
          <div class="kpi-simple-title">FIXED TARIFF COST</div>
          <div class="kpi-simple-value">${formatNumber(costFixEur, 2)} €</div>
        </div>

        <div class="kpi-card" role="listitem">
          <div class="kpi-simple-title">SPOT TARIFF COST</div>
          <div class="kpi-simple-value">${formatNumber(costSpotEur, 2)} €</div>
        </div>

        <div class="kpi-card" role="listitem">
          <div class="kpi-simple-title">BREAK-EVEN FIXED</div>
          <div class="kpi-simple-value">${breakEvenFixed !== null && breakEvenFixed !== undefined ? formatNumber(breakEvenFixed, 2) : "-"} ct/kWh</div>
        </div>

        <div class="kpi-card" role="listitem">
          <div class="kpi-simple-title">SPOT CHEAPER HOURS</div>
          <div class="kpi-simple-value">${spotCheaperShare !== null && spotCheaperShare !== undefined ? formatNumber(spotCheaperShare * 100, 1) : "-"} %</div>
        </div>
      </div>
    `;
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
          <div class="monthly-tariff-info">${texts.monthlyTariffInfo}</div>
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
          : `${delta > 0 ? "+" : ""}${formatNumber(delta, 2)} €`;

        return `
          <div class="monthly-cell-card ${cellClass}" title="${monthLabels[monthIndex]} | ${texts.monthlyTariffTooltipDelta}: ${delta > 0 ? "+" : ""}${formatNumber(delta, 2)} € | ${texts.monthlyTariffTooltipHours}: ${formatNumber(matchedHours, 0)}" style="--intensity:${intensity.toFixed(3)}">
            <div class="monthly-cell-head">${monthLabels[monthIndex]}</div>
            <div class="monthly-cell-center">${centerValue}</div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="monthly-tariff-panel">
        <div class="monthly-tariff-title">${texts.monthlyTariffTitle}</div>
        <div class="monthly-tariff-info">${texts.monthlyTariffInfo}</div>
        <div class="monthly-tariff-grid">${cells}</div>
      </div>
    `;
  }

  buildAnalysisGroups(summary) {
    const texts = this._texts || this.getTexts();
    const taxRate = this.latestData?.tax_rate ?? 20.0;
    const taxNote = this.getTaxNote(taxRate);
    const buildCard = (label, value) => `
      <div class="technical-metric-card">
        <div class="technical-metric-label">${label}</div>
        <div class="technical-metric-value">${value}</div>
      </div>
    `;
    const buildGrid = (cls, items) => `
      <div class="${cls}">
        ${items.map((item) => buildCard(item.label, item.value)).join("")}
      </div>
    `;

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

    const placeholderValue = texts.analysisPlaceholderValue;
    const maxPeakValue = summary.maxPeak !== null && summary.maxPeak !== undefined
      ? `${formatNumber(summary.maxPeak, 3)} kWh`
      : placeholderValue;
    const baseLoadValue = summary.baseLoadP05 !== null && summary.baseLoadP05 !== undefined
      ? `${formatNumber(summary.baseLoadP05, 3)} kWh`
      : placeholderValue;
    const dailySpreadValue = summary.dailyPriceSpread !== null && summary.dailyPriceSpread !== undefined
      ? `${formatNumber(summary.dailyPriceSpread, 2)} ct/kWh`
      : placeholderValue;
    const stdDevValue = summary.spotPriceStdDev !== null && summary.spotPriceStdDev !== undefined
      ? `${formatNumber(summary.spotPriceStdDev, 2)} ct/kWh`
      : placeholderValue;

    const periodItems = [
      { label: texts.analysisRangeLabel, value: `${summary.start} - ${summary.end}` },
      { label: texts.analysisDaysLabel, value: `${formatNumber(matchedDays, 1)}` },
      { label: texts.analysisHoursLabel, value: `${formatNumber(matchedHours, 0)}` }
    ];

    const consumptionItems = [
      { label: texts.analysisTotalLabel, value: `${formatNumber(summary.totalConsumption || 0, 2)} kWh` },
      { label: texts.analysisAvgDayLabel, value: `${formatNumber(summary.avgPerDay || 0, 2)} kWh` },
      { label: texts.analysisAvgHourLabel, value: `${formatNumber(summary.avgPerHour || 0, 3)} kWh` },
      { label: texts.analysisWeekdayAvgLabel, value: `${formatNumber(summary.weekdayAvg || 0, 3)} kWh` },
      { label: texts.analysisWeekendAvgLabel, value: `${formatNumber(summary.weekendAvg || 0, 3)} kWh` },
      { label: texts.analysisPeakHourLabel, value: peakHourLabel },
      { label: texts.analysisMaxPeakLabel, value: maxPeakValue },
      { label: texts.analysisBaseLoadLabel, value: baseLoadValue }
    ];

    const priceItems = [
      { label: texts.analysisAvgSpotLabel, value: `${summary.avgPrice} ct/kWh` },
      { label: texts.analysisBreakEvenLabel, value: breakEvenFixed },
      { label: texts.analysisSpotCheaperLabel, value: spotCheaperShare },
      { label: texts.analysisDailySpreadLabel, value: dailySpreadValue },
      { label: texts.analysisSpotStdDevLabel, value: stdDevValue }
    ];

    return `
      <section class="technical-section">
        <div class="technical-section-title">${texts.analysisSectionRangeTitle}</div>
        ${buildGrid("technical-grid-range", periodItems)}
      </section>

      <section class="technical-section">
        <div class="technical-section-title">${texts.analysisSectionConsumptionTitle}</div>
        ${buildGrid("technical-grid-main", consumptionItems)}
      </section>

      <section class="technical-section">
        <div class="technical-section-title">${texts.analysisSectionTariffTitle}</div>
        ${buildGrid("technical-grid-main", priceItems)}
      </section>

      <section class="technical-section technical-tax-section">
        <div class="card-tax-note">${taxNote}</div>
      </section>
    `;
  }

  loadUiState() {
    this._uiStateLoaded = true;
    try {
      const raw = localStorage.getItem("sei_ui_state");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this._storedSource = parsed.activeSource || null;
      this._heatmapSeason = parsed.heatmapSeason || "whole_year";
      this._consumptionMode = parsed.consumptionMode || "absolute";
      this._spotPriceMode = parsed.spotPriceMode || "break_even";
      this._dashboardTab = parsed.dashboardTab || "monthly";
      this._selectedSensor = parsed.selectedSensor || this._selectedSensor;
    } catch (err) {
      console.warn("Failed to load UI state", err);
    }
  }

  saveUiState() {
    try {
      const payload = {
        activeSource: this._activeSource,
        heatmapSeason: this._heatmapSeason || "whole_year",
        consumptionMode: this._consumptionMode || "absolute",
        spotPriceMode: this._spotPriceMode || "break_even",
        dashboardTab: this._dashboardTab || "monthly",
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
      ha-card { box-shadow: none; border-radius: 14px; overflow: hidden; background: transparent; }
      .integration-settings-chip { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; padding: 0; border: 1px solid var(--divider-color); border-radius: 999px; background: transparent; color: var(--secondary-text-color); cursor: pointer; }
      .integration-settings-chip:hover { color: var(--primary-color); border-color: var(--primary-color); background: rgba(var(--rgb-primary-color), 0.08); }
      .integration-settings-chip ha-icon { --mdc-icon-size: 20px; }

      .source-card { margin: 16px; border-radius: 12px; overflow: hidden; background: color-mix(in srgb, var(--card-background-color) 90%, black 10%); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28); }
      .source-chooser-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 16px; }
      .source-chooser-title { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .source-chooser-desc { font-size: 12px; color: var(--secondary-text-color); }
      .source-header-actions { display: inline-flex; align-items: center; gap: 10px; }
      .source-selector-buttons { display: inline-flex; border: 1px solid var(--divider-color); border-radius: 999px; overflow: hidden; background: var(--secondary-background-color); }
      .source-switch { padding: 6px 14px; border: none; background: transparent; color: var(--primary-text-color); cursor: pointer; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
      .source-switch.active { background: var(--primary-color); color: white; }

      .upload-card { width: 100%; max-width: 1200px; margin: 0 auto; height: fit-content; }
      .source-content { padding: 16px; }
      .source-section { background: rgba(var(--rgb-primary-text-color), 0.02); }
      .source-section-header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
      .source-section-title { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .source-section-desc { font-size: 12px; color: var(--secondary-text-color); }
      .section-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
      .sensor-picker { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
      .sensor-label { font-size: 13px; color: var(--secondary-text-color); }
      .sensor-select { width: 100%; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 14px; box-sizing: border-box; }
      .sensor-select:disabled { opacity: 0.6; cursor: not-allowed; }
      .sensor-message { margin-top: 10px; font-size: 13px; padding: 8px 12px; border-radius: 6px; background: rgba(var(--rgb-primary-text-color), 0.04); }
      .sensor-message.loading { opacity: 0.8; }
      .sensor-message.info { color: var(--secondary-text-color); background: rgba(var(--rgb-primary-text-color), 0.04); }
      .sensor-message.error { color: #f44336; background: rgba(244, 67, 54, 0.08); }
      .sensor-message.success { color: #4caf50; background: rgba(76, 175, 80, 0.08); }
      
      /* Dashboard Wrapper */
      .dashboard-wrapper { padding: 24px; }
      .dashboard-minimal-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
      .dashboard-current-profile { font-size: 13px; color: var(--secondary-text-color); letter-spacing: 0.2px; }
      .dashboard-current-profile span { color: var(--primary-text-color); font-weight: 600; }
      .source-toggle-text-btn { border: none; background: transparent; color: var(--primary-color); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.45px; cursor: pointer; padding: 0; }
      .source-toggle-text-btn:hover { color: var(--primary-text-color); }

      .top-dashboard-grid { margin-bottom: 24px; }
      .savings-hero-card { border: 1px solid rgba(var(--rgb-divider-color), 0.25); border-left: 4px solid; border-radius: 0 8px 8px 0; padding: 20px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; }
      .savings-hero-head { display: flex; align-items: center; gap: 18px; }
      .savings-hero-icon { font-size: 42px; line-height: 1; }
      .savings-hero-main { display: flex; flex-direction: column; gap: 4px; }
      .savings-hero-title { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: var(--secondary-text-color); font-weight: 700; }
      .savings-hero-value { font-size: 32px; font-weight: 700; color: var(--primary-text-color); line-height: 1.1; }
      .savings-hero-message { font-size: 14px; color: var(--secondary-text-color); line-height: 1.5; }
      .kpi-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 4px; }
      .kpi-card { background: rgba(var(--rgb-primary-text-color), 0.04); border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; justify-content: center; gap: 10px; min-height: 88px; }
      .kpi-simple-title { font-size: 11px; letter-spacing: 0.45px; text-transform: uppercase; color: var(--secondary-text-color); font-weight: 700; }
      .kpi-simple-value { font-size: 18px; line-height: 1.2; color: var(--primary-text-color); font-weight: 700; }
      .analysis-island { margin-top: 26px; padding: 16px; border-radius: 12px; background: color-mix(in srgb, var(--card-background-color) 90%, black 10%); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.26); }
      .analysis-island-title { font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin-bottom: 12px; }
      .dashboard-tabs { margin-top: 0; }
      .dashboard-tab-navigation { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
      .dashboard-tab-button { min-height: 40px; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 8px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 13px; font-weight: 600; cursor: pointer; }
      .dashboard-tab-button:hover { border-color: var(--primary-color); }
      .dashboard-tab-button.active { background: var(--primary-color); border-color: var(--primary-color); color: white; }
      .dashboard-tab-panel[hidden] { display: none; }
      .technical-cockpit-wrap { border: 1px solid rgba(var(--rgb-divider-color), 0.6); border-radius: 10px; background: rgba(var(--rgb-primary-text-color), 0.02); padding: 14px; }
      .technical-cockpit-wrap h3 { margin: 0 0 12px 0; color: var(--primary-text-color); font-size: 15px; font-weight: 600; }
      .analysis-groups { display: flex; flex-direction: column; gap: 12px; }
      .technical-section { border: 1px solid rgba(var(--rgb-divider-color), 0.5); border-radius: 10px; background: rgba(var(--rgb-primary-text-color), 0.02); padding: 12px; }
      .technical-section-title { margin-bottom: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: var(--secondary-text-color); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .technical-grid-range { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .technical-grid-main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .technical-metric-card { border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 8px; background: rgba(var(--rgb-primary-text-color), 0.03); padding: 9px 10px; min-height: 60px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
      .technical-metric-label { font-size: 11px; color: var(--secondary-text-color); letter-spacing: 0.25px; }
      .technical-metric-value { font-size: 16px; font-weight: 700; color: var(--primary-text-color); line-height: 1.2; }
      .technical-tax-section { padding-top: 4px; }
      
      .info-box { background-color: rgba(var(--rgb-primary-color), 0.05); border-left: 4px solid var(--primary-color); padding: 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0; }
      .info-box h3 { margin: 0 0 8px 0; font-size: 16px; color: var(--primary-text-color); }
      .info-box p { margin: 0; font-size: 14px; color: var(--primary-text-color); }
      .analysis-groups-legacy { display: flex; flex-direction: column; gap: 16px; }
      .analysis-group-title { font-size: 12px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; margin-bottom: 8px; }
      .analysis-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      @media(max-width: 600px) { .analysis-summary-grid { grid-template-columns: 1fr; } }
      .summary-item { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; background: rgba(var(--rgb-primary-text-color), 0.03); padding: 8px 10px; border-radius: 6px; }
      .summary-item span { color: var(--secondary-text-color); }
      .info-icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 999px; background: rgba(var(--rgb-primary-text-color), 0.08); color: var(--secondary-text-color); font-size: 11px; margin-left: 6px; cursor: help; }

      /* Seasonal Heatmaps */
      .seasonal-heatmaps { margin-top: 24px; }
      .heatmap-season-navigation { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
      .heatmap-season-button { min-height: 36px; padding: 8px 10px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 13px; cursor: pointer; }
      .heatmap-season-button:hover { border-color: var(--primary-color); }
      .heatmap-season-button.active { background: var(--primary-color); border-color: var(--primary-color); color: white; }
      .heatmap-subcard { background: rgba(var(--rgb-primary-text-color), 0.025); border: 1px solid rgba(var(--rgb-divider-color), 0.5); border-radius: 12px; padding: 14px 14px 16px; }
      .heatmap-subcard + .heatmap-subcard { margin-top: 18px; }
      .heatmap-subcard-controls,
      .consumption-mode-navigation,
      .spot-mode-navigation { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 16px 0; flex-wrap: wrap; }
      .spot-mode-label { color: var(--secondary-text-color); font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
      .consumption-mode-buttons,
      .spot-mode-buttons { display: inline-flex; border: 1px solid var(--divider-color); border-radius: 999px; overflow: hidden; background: var(--secondary-background-color); }
      .consumption-mode-button,
      .spot-mode-button { min-height: 34px; padding: 6px 12px; border: none; background: transparent; color: var(--primary-text-color); font-size: 12px; cursor: pointer; }
      .consumption-mode-button.active,
      .spot-mode-button.active { background: var(--primary-color); color: white; }
      .spot-mode-button:disabled { opacity: 0.45; cursor: not-allowed; }
      .heatmaps-grid { display: grid; grid-template-columns: 1fr; gap: 32px; }
      @media(min-width: 1300px) { .heatmaps-grid { grid-template-columns: 1fr 1fr; } }
      
      .heatmap-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; text-align: left; color: var(--primary-text-color); }
      .heatmap-legend { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--secondary-text-color); margin-bottom: 10px; flex-wrap: wrap; }
      .heatmap-info-note { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--secondary-text-color); margin: -2px 0 10px; min-height: 18px; }
      .heatmap-info-note.is-empty { opacity: 0; }
      .heatmap-info-badge { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 999px; background: rgba(var(--rgb-primary-text-color), 0.12); color: var(--secondary-text-color); font-size: 10px; }
      .heatmap-legend-bar { width: 120px; height: 8px; border-radius: 999px; background: linear-gradient(90deg, hsl(120, 85%, 55%), hsl(0, 85%, 55%)); }
      .heatmap-legend-value { font-size: 11px; color: var(--secondary-text-color); }
      .heatmap-info-note { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 10px; font-size: 11px; color: var(--secondary-text-color); line-height: 1.4; }
      .heatmap-info-badge { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 999px; background: rgba(var(--rgb-primary-text-color), 0.08); color: var(--secondary-text-color); font-size: 11px; flex: 0 0 auto; }
      .heatmap-grid { display: grid; grid-template-columns: auto repeat(24, 1fr); gap: 2px; font-size: 10px; }
      .heatmap-header-y { display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; color: var(--secondary-text-color); font-weight: 500; }
      .heatmap-header-x { text-align: center; color: var(--secondary-text-color); padding-bottom: 4px; }
      .heatmap-cell { aspect-ratio: 1; border-radius: 2px; cursor: crosshair; transition: transform 0.1s; }
      .heatmap-cell:hover { transform: scale(1.2); box-shadow: 0 0 4px rgba(0,0,0,0.3); z-index: 2; position: relative; }
      .monthly-tariff-panel { background: linear-gradient(160deg, rgba(var(--rgb-primary-text-color), 0.02), rgba(var(--rgb-primary-text-color), 0.04)); border: 1px solid rgba(var(--rgb-divider-color), 0.6); border-radius: 10px; padding: 14px; }
      .monthly-tariff-title { font-size: 15px; font-weight: 600; color: var(--primary-text-color); margin-bottom: 10px; }
      .monthly-tariff-info { font-size: 12px; color: var(--secondary-text-color); line-height: 1.45; margin: -2px 0 12px; background: rgba(var(--rgb-primary-text-color), 0.03); border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 8px; padding: 8px 10px; }
      .monthly-tariff-empty { font-size: 13px; color: var(--secondary-text-color); padding: 8px 4px; }
      .monthly-tariff-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      @media(min-width: 900px) { .monthly-tariff-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media(min-width: 1300px) { .monthly-tariff-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      .monthly-cell-card { border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 10px; padding: 10px; min-height: 84px; display: grid; grid-template-rows: auto 1fr; align-items: center; justify-items: center; text-align: center; gap: 8px; }
      .monthly-cell-card.savings { background: color-mix(in srgb, #c9ebd9 calc(78% + var(--intensity) * 20%), rgba(var(--rgb-card-background-color), 0.9)); border-color: rgba(49, 122, 78, 0.35); }
      .monthly-cell-card.neutral { background: color-mix(in srgb, #ece0b8 calc(78% + var(--intensity) * 20%), rgba(var(--rgb-card-background-color), 0.9)); border-color: rgba(143, 122, 38, 0.35); }
      .monthly-cell-card.extra { background: color-mix(in srgb, #efcbc8 calc(78% + var(--intensity) * 20%), rgba(var(--rgb-card-background-color), 0.9)); border-color: rgba(155, 59, 59, 0.35); }
      .monthly-cell-card.nodata { background: rgba(var(--rgb-primary-text-color), 0.04); opacity: 0.72; }
      .monthly-cell-head { font-size: 12px; font-weight: 800; letter-spacing: 0.45px; text-transform: uppercase; color: #2d3640; padding: 2px 8px; border-radius: 999px; background: rgba(45, 54, 64, 0.12); }
      .monthly-cell-center { font-size: 15px; font-weight: 700; text-align: center; color: var(--primary-text-color); letter-spacing: 0.1px; display: flex; align-items: center; justify-content: center; min-height: 28px; }
      .monthly-cell-card.savings .monthly-cell-head { color: #225a3d; background: rgba(34, 90, 61, 0.12); }
      .monthly-cell-card.neutral .monthly-cell-head { color: #7f6721; background: rgba(127, 103, 33, 0.14); }
      .monthly-cell-card.extra .monthly-cell-head { color: #893737; background: rgba(137, 55, 55, 0.12); }
      .monthly-cell-card.nodata .monthly-cell-head { color: var(--secondary-text-color); background: rgba(var(--rgb-primary-text-color), 0.12); }
      .monthly-cell-card.savings .monthly-cell-center { color: #317a4e; }
      .monthly-cell-card.neutral .monthly-cell-center { color: #8f7a26; }
      .monthly-cell-card.extra .monthly-cell-center { color: #9b3b3b; }
      .monthly-cell-card.nodata .monthly-cell-center { color: var(--secondary-text-color); }
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
        .source-card { margin: 12px; }
        .source-chooser-header { align-items: flex-start; flex-direction: column; }
        .source-header-actions { width: 100%; justify-content: space-between; }
        .dashboard-minimal-header { align-items: flex-start; flex-direction: column; }
        .savings-hero-card { padding: 16px; }
        .savings-hero-head { gap: 12px; }
        .savings-hero-icon { font-size: 36px; }
        .savings-hero-value { font-size: 28px; }
        .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .dashboard-tab-navigation { grid-template-columns: 1fr; }
        .technical-grid-range { grid-template-columns: 1fr; }
        .technical-grid-main { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .heatmap-season-navigation { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .heatmap-season-button:last-child { grid-column: span 2; }
        .heatmap-subcard { padding: 12px; }
        .consumption-mode-buttons,
        .spot-mode-buttons { width: 100%; display: grid; grid-template-columns: 1fr; border-radius: 8px; }
      }
      @media(min-width: 900px) {
        .kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .technical-grid-main { grid-template-columns: repeat(4, minmax(0, 1fr)); }
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