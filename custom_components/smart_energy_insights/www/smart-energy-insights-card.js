/**
 * Smart Energy Insights - Load Profile CSV Upload Card
 */

import {
  loadDeviceAnalysis,
  loadHeatmaps,
  loadMonitoredDevices,
  loadSensorData,
  saveMonitoredDevices,
  setActiveSource,
  uploadCsv
} from "./smart-energy-insights-api.js?v=20260724a";
import { generateHeatmapHTML } from "./smart-energy-insights-heatmap.js?v=20260724a";
import { renderBaseCard, renderDashboardHtml } from "./smart-energy-insights-templates.js?v=20260724c";
import { formatNumber } from "./smart-energy-insights-utils.js";

// Below this share of expected hourly slots actually matched to a spot price,
// the tariff comparison is no longer representative of the full selected
// period (see docs/refactoring-recommendations.md R1) - surface a warning
// instead of presenting the headline numbers as a full-period verdict.
const LOW_DATA_COMPLETENESS_THRESHOLD = 0.9;

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
      this.loadMonitoredDevicesFromBackend();
    }
    if (this.contentAdded) {
      this.syncSensorPicker();
      this.syncDevicePicker();
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

  escapeAttribute(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  formatIsoDateEuropean(value) {
    const iso = String(value || "").split("T")[0];
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return iso || "-";
    return `${match[3]}.${match[2]}.${match[1]}`;
  }

  formatDateTimeEuropean(value) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return String(value);
    const day = String(parsed.getDate()).padStart(2, "0");
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const year = parsed.getFullYear();
    const hour = String(parsed.getHours()).padStart(2, "0");
    const minute = String(parsed.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year}, ${hour}:${minute}`;
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
      devicesTitle: this.localize("card.devices_title", "Monitored devices"),
      devicesDescription: this.localize(
        "card.devices_description",
        "Add optional energy sensors for individual household devices."
      ),
      devicesRequiresProfile: this.localize(
        "card.devices_requires_profile",
        "Load a main consumption profile before adding devices."
      ),
      devicesEmpty: this.localize("card.devices_empty", "No devices configured."),
      deviceAdd: this.localize("card.device_add", "Add device"),
      deviceSave: this.localize("card.device_save", "Save"),
      deviceRemove: this.localize("card.device_remove", "Remove device"),
      deviceNameLabel: this.localize("card.device_name_label", "Display name"),
      deviceSensorLabel: this.localize("card.device_sensor_label", "Energy sensor"),
      deviceSensorPlaceholder: this.localize("card.device_sensor_placeholder", "Choose a device sensor"),
      deviceSensorNoneOption: this.localize(
        "card.device_sensor_none_option",
        "No additional compatible energy sensor available. A sensor already used as the main profile source cannot be added as a device."
      ),
      deviceNameRequired: this.localize("card.device_name_required", "Enter a display name."),
      deviceSaveError: this.localize("card.device_save_error", "Could not save monitored devices."),
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
      lastImported: this.localize("card.last_imported", "Last imported"),
      profileTitle: this.localize("card.profile_title", "Current load profile:"),
      currentProfileLabel: this.localize("card.current_profile_label", "Current profile:"),
      switchSourceButton: this.localize("card.switch_source_button", "Switch source"),
      sourceClosedHint: this.localize("card.source_closed_hint", "Tap to open"),
      sourceOpenHint: this.localize("card.source_open_hint", "Tap to close"),
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
      analysisTitle: this.localize("card.analysis_title", "Load profile analysis"),
      analysisDetailedAnalysisClosedHint: this.localize("card.analysis_detailed_analysis_closed_hint", "Tap to open"),
      analysisDetailedAnalysisOpenHint: this.localize("card.analysis_detailed_analysis_open_hint", "Tap to close"),
      dashboardTabMonthly: this.localize("card.dashboard_tab_monthly", "Monthly comparison"),
      dashboardTabUsage: this.localize("card.dashboard_tab_usage", "Usage behavior"),
      dashboardTabRisk: this.localize("card.dashboard_tab_risk", "Risk & optimization"),
      dashboardTabTechnical: this.localize("card.dashboard_tab_technical", "Technical details"),
      analysisSummaryTitle: this.localize("card.analysis_summary_title", "Summary"),
      analysisGroupPeriodTitle: this.localize("card.analysis_group_period", "Period"),
      analysisGroupConsumptionTitle: this.localize("card.analysis_group_consumption", "Consumption"),
      analysisGroupPriceTitle: this.localize("card.analysis_group_price", "Price"),
      analysisPeriodLabel: this.localize("card.analysis_period_label", "Period"),
      analysisRangeLabel: this.localize("card.analysis_range_label", "Range"),
      analysisDaysLabel: this.localize("card.analysis_days_label", "Days"),
      analysisHoursLabel: this.localize("card.analysis_hours_label", "Hours"),
      analysisRangeHelp: this.localize("card.analysis_range_help", "Time window used for this analysis."),
      analysisDaysHelp: this.localize("card.analysis_days_help", "Matched hours converted to days, rounded to full days."),
      analysisHoursHelp: this.localize("card.analysis_hours_help", "Number of matched hourly points used in tariff comparison."),
      analysisDataCompletenessLabel: this.localize("card.analysis_data_completeness_label", "Data completeness"),
      analysisDataCompletenessHelp: this.localize("card.analysis_data_completeness_help", "Share of available measured hours versus expected hourly slots in the selected period."),
      analysisLowCompletenessWarning: ({ percent }) => this.localize(
        "card.analysis_low_completeness_warning",
        "Low data completeness ({percent}%): matched spot-price hours only cover part of the selected period, so this comparison may not be representative of the full period.",
        { percent }
      ),
      analysisTotalLabel: this.localize("card.analysis_total_label", "Total consumption"),
      analysisAvgHourLabel: this.localize("card.analysis_avg_hour_label", "Avg per hour"),
      analysisAvgDayLabel: this.localize("card.analysis_avg_day_label", "Avg per day"),
      analysisPeakHourLabel: this.localize("card.analysis_peak_hour_label", "Peak hour"),
      analysisWeekdayAvgLabel: this.localize("card.analysis_weekday_avg_label", "Weekday avg"),
      analysisWeekendAvgLabel: this.localize("card.analysis_weekend_avg_label", "Weekend avg"),
      analysisTotalHelp: this.localize("card.analysis_total_help", "Sum of all measured consumption values in the selected period."),
      analysisAvgDayHelp: this.localize("card.analysis_avg_day_help", "Average daily consumption based on measured days in the selected period."),
      analysisAvgHourHelp: this.localize("card.analysis_avg_hour_help", "Average consumption per measured hour in the selected period."),
      analysisWeekdayAvgHelp: this.localize("card.analysis_weekday_avg_help", "Average hourly consumption across weekdays (Mon-Fri)."),
      analysisWeekendAvgHelp: this.localize("card.analysis_weekend_avg_help", "Average hourly consumption across weekend days (Sat-Sun)."),
      analysisPeakHourHelp: this.localize("card.analysis_peak_hour_help", "Hour of day with the highest average consumption across the selected period."),
      analysisAvgSpotLabel: this.localize("card.analysis_avg_spot_label", "Avg spot price"),
      analysisAvgSpotHelp: this.localize("card.analysis_avg_spot_help", "Average spot market price (ct/kWh) over the imported price series."),
      analysisEffectiveSpotLabel: this.localize("card.analysis_effective_spot_label", "Effective spot price"),
      analysisEffectiveSpotHelp: this.localize("card.analysis_effective_spot_help", "Load-weighted average spot energy price (incl. markup and tax handling), excluding monthly base fee."),
      analysisNegativePriceHoursLabel: this.localize("card.analysis_negative_price_hours_label", "Negative price hours"),
      analysisNegativePriceHoursHelp: this.localize("card.analysis_negative_price_hours_help", "Hours where the market spot price was below 0 ct/kWh, shown as hours and share."),
      analysisMaxSpotPriceLabel: this.localize("card.analysis_max_spot_price_label", "Max spot price"),
      analysisMaxSpotPriceHelp: this.localize("card.analysis_max_spot_price_help", "Highest market spot price (ct/kWh) observed in the selected period."),
      analysisMinSpotPriceLabel: this.localize("card.analysis_min_spot_price_label", "Min spot price"),
      analysisMinSpotPriceHelp: this.localize("card.analysis_min_spot_price_help", "Lowest market spot price (ct/kWh) observed in the selected period."),
      analysisOccurredOnLabel: this.localize("card.analysis_occurred_on_label", "Occurred on"),
      analysisSectionRiskTitle: this.localize("card.analysis_section_risk_title", "RISK AND OPTIMIZATION"),
      analysisFlexibilityPotentialLabel: this.localize("card.analysis_flexibility_potential_label", "Flexibility potential"),
      analysisFlexibilityPotentialHelp: this.localize("card.analysis_flexibility_potential_help", "Percentage of your total consumption that is above your baseline and could theoretically be shifted to other hours."),
      analysisCurrentTariffBalanceTitle: this.localize("card.analysis_current_tariff_balance_title", "Projected Savings"),
      analysisBestCasePotentialTitle: this.localize("card.analysis_best_case_potential_title", "Best Case (Potential)"),
      analysisBestCasePotentialSubtitle: this.localize("card.analysis_best_case_potential_subtitle", "Achievable through active load shifting."),
      analysisWorstCaseRiskTitle: this.localize("card.analysis_worst_case_risk_title", "Worst Case (Risk)"),
      analysisWorstCaseRiskSubtitle: this.localize("card.analysis_worst_case_risk_subtitle", "Risk upon high peak-hour usage."),
      analysisStatusQuoFixedProjectionLabel: this.localize("card.analysis_status_quo_fixed_projection_label", "Fixed projection"),
      analysisStatusQuoSpotProjectionLabel: this.localize("card.analysis_status_quo_spot_projection_label", "Spot projection"),
      analysisStatusQuoSpotHigherLabel: this.localize("card.analysis_status_quo_spot_higher_label", "Spot higher"),
      analysisStatusQuoFixedHigherLabel: this.localize("card.analysis_status_quo_fixed_higher_label", "Fixed higher"),
      analysisStatusQuoSpotCheaperSubtitle: this.localize("card.analysis_status_quo_spot_cheaper_subtitle", "Spot tariff is currently cheaper than fixed tariff."),
      analysisStatusQuoBalancedLabel: this.localize("card.analysis_status_quo_balanced_label", "Balanced"),
      analysisCostProjectionTitle: this.localize("card.analysis_cost_projection_title", "Cost projection range"),
      analysisCostProjectionHelp: this.localize("card.analysis_cost_projection_help", "Projected spot-cost corridor from best to worst case compared against your fixed-tariff baseline."),
      analysisCostProjectionFixedLabel: this.localize("card.analysis_cost_projection_fixed_label", "Fixed baseline"),
      analysisCostProjectionSpotLabel: this.localize("card.analysis_cost_projection_spot_label", "Current spot"),
      analysisCostProjectionBestLabel: this.localize("card.analysis_cost_projection_best_label", "Best case spot"),
      analysisCostProjectionWorstLabel: this.localize("card.analysis_cost_projection_worst_label", "Worst case spot"),
      analysisCostProjectionCurrentLabel: this.localize("card.analysis_cost_projection_current_label", "Current Projection"),
      analysisCostProjectionMaxPotentialLabel: this.localize("card.analysis_cost_projection_max_potential_label", "Max potential"),
      analysisCostProjectionBaselineLabel: this.localize("card.analysis_cost_projection_baseline_label", "Fixed tariff"),
      analysisCostProjectionSavingsZone: this.localize("card.analysis_cost_projection_savings_zone", "Savings zone"),
      analysisCostProjectionRiskZone: this.localize("card.analysis_cost_projection_risk_zone", "Risk zone"),
      analysisTimingProfileTitle: this.localize("card.analysis_timing_profile_title", "Consumption timing profile"),
      analysisTimingProfileHelp: this.localize("card.analysis_timing_profile_help", "Distribution of your consumption between expensive, average and cheap market hours."),
      analysisTimingExpensiveLabel: this.localize("card.analysis_timing_expensive_label", "Expensive hours"),
      analysisTimingAverageLabel: this.localize("card.analysis_timing_average_label", "Average hours"),
      analysisTimingCheapLabel: this.localize("card.analysis_timing_cheap_label", "Cheap hours"),
      analysisSectionRangeTitle: this.localize("card.analysis_section_range_title", "Measurement window"),
      analysisSectionConsumptionTitle: this.localize("card.analysis_section_consumption_title", "Consumption analysis"),
      analysisSectionTariffTitle: this.localize("card.analysis_section_tariff_title", "Tariff and market analysis"),
      analysisSectionParametersTitle: this.localize("card.analysis_section_parameters_title", "Calculation parameters"),
      analysisFixedRateAssumedLabel: this.localize("card.analysis_fixed_rate_assumed_label", "Fixed rate assumed"),
      analysisFixedRateAssumedHelp: this.localize("card.analysis_fixed_rate_assumed_help", "Configured fixed energy rate used for tariff comparison."),
      analysisFixedBaseFeeLabel: this.localize("card.analysis_fixed_base_fee_label", "Fixed base fee"),
      analysisFixedBaseFeeHelp: this.localize("card.analysis_fixed_base_fee_help", "Configured monthly base fee for the fixed tariff."),
      analysisDynamicMarkupLabel: this.localize("card.analysis_dynamic_markup_label", "Dynamic markup"),
      analysisDynamicMarkupHelp: this.localize("card.analysis_dynamic_markup_help", "Provider surcharge added to market spot prices in the dynamic tariff."),
      analysisDynamicBaseFeeLabel: this.localize("card.analysis_dynamic_base_fee_label", "Dynamic base fee"),
      analysisDynamicBaseFeeHelp: this.localize("card.analysis_dynamic_base_fee_help", "Configured monthly base fee for the dynamic tariff."),
      analysisMaxPeakLabel: this.localize("card.analysis_max_peak_label", "Max peak"),
      analysisBaseLoadLabel: this.localize("card.analysis_base_load_label", "Base load (P05)"),
      analysisDailySpreadLabel: this.localize("card.analysis_daily_spread_label", "Avg daily price spread"),
      analysisSpotStdDevLabel: this.localize("card.analysis_spot_std_dev_label", "Break-even fixed"),
      analysisSpotCheaperLabel: this.localize("card.analysis_spot_cheaper_label", "Spot cheaper hours"),
      analysisSpotCheaperHelp: this.localize(
        "card.analysis_spot_cheaper_help",
        "Share of hours in which spot (incl. markup) was cheaper than the currently configured fixed price."
      ),
      analysisMaxPeakHelp: this.localize("card.analysis_max_peak_help", "Highest single-hour consumption value in the selected period."),
      analysisBaseLoadHelp: this.localize("card.analysis_base_load_help", "Estimated base load as the 5th percentile (P05) of positive hourly consumption values."),
      analysisDailySpreadHelp: this.localize("card.analysis_daily_spread_help", "Average daily difference between highest and lowest spot price."),
      analysisSpotStdDevHelp: this.localize("card.analysis_spot_std_dev_help", "Fixed price at which costs equal the spot tariff, based on current tariffs and market prices."),
      analysisPlaceholderValue: this.localize("card.analysis_placeholder_value", "-"),
      avgConsumptionLabel: this.localize("card.avg_consumption_label", "Avg consumption"),
      avgPriceLabel: this.localize("card.avg_price_label", "Avg spot price (net)"),
      heatmapLegendLow: this.localize("card.heatmap_legend_low", "Low"),
      heatmapLegendHigh: this.localize("card.heatmap_legend_high", "High"),
      heatmapConsumptionTitle: this.localize(
        "card.heatmap_consumption_title",
        "Consumption heatmap (kWh)"
      ),
      heatmapDeviceConsumptionTitle: (name) => this.localize(
        "card.heatmap_device_consumption_title",
        "{name} consumption (kWh)",
        { name }
      ),
      consumptionProfileLabel: this.localize("card.consumption_profile_label", "Consumption profile"),
      consumptionProfileTotal: this.localize("card.consumption_profile_total", "Total consumption"),
      consumptionProfileUnavailable: (name) => this.localize(
        "card.consumption_profile_unavailable",
        "{name} (no overlapping data)",
        { name }
      ),
      heatmapPriceTitle: this.localize(
        "card.heatmap_price_title",
        "Spot price heatmap (ct/kWh, net wholesale)"
      ),
      heatmapOptimizationSectionLabel: this.localize("card.heatmap_optimization_section_label", "OPTIMIZATION VIEW"),
      heatmapOptimizationTitle: this.localize("card.heatmap_optimization_title", "Load shift potential"),
      heatmapOptimizationModeLabel: this.localize("card.heatmap_optimization_mode_label", "Optimization view"),
      heatmapOptimizationModeScore: this.localize("card.heatmap_optimization_mode_score", "Shift score"),
      heatmapOptimizationModeCostGradient: this.localize("card.heatmap_optimization_mode_cost_gradient", "Cost gradient"),
      heatmapOptimizationCostGradientTitle: this.localize("card.heatmap_optimization_cost_gradient_title", "Cost gradient heatmap (ct/h)"),
      heatmapOptimizationInfo: this.localize(
        "card.heatmap_optimization_info",
        "Shift score compares each hour with the selected period average. Hours where consumption and price are both above average get negative values because they are expensive and hard to shift. Hours where both are below average get positive values because they are good shift opportunities. Values around 0 are neutral."
      ),
      heatmapOptimizationCostGradientInfo: this.localize(
        "card.heatmap_optimization_cost_gradient_info",
        "Shows hourly cost impact (consumption x gross retail spot price, incl. tax and markup). Higher values are more expensive."
      ),
      heatmapLegendShiftAway: this.localize("card.heatmap_legend_shift_away", "Shift load away"),
      heatmapLegendOptimized: this.localize("card.heatmap_legend_optimized", "Already optimized"),
      heatmapLegendShiftHere: this.localize("card.heatmap_legend_shift_here", "Shift load here"),
      heatmapConsumptionModeLabel: this.localize("card.heatmap_consumption_mode_label", "Consumption view"),
      heatmapConsumptionModeAbsolute: this.localize("card.heatmap_consumption_mode_absolute", "Absolute"),
      heatmapConsumptionModeRelativeMean: this.localize("card.heatmap_consumption_mode_relative_mean", "Relative to average"),
      heatmapConsumptionAbsoluteInfo: this.localize(
        "card.heatmap_consumption_absolute_info",
        "Ref: absolute consumption"
      ),
      heatmapConsumptionRefMean: (reference) => this.localize(
        "card.heatmap_consumption_ref_mean",
        "Ref: {reference} kWh (Average)",
        { reference }
      ),
      heatmapSpotModeLabel: this.localize("card.heatmap_spot_mode_label", "Spot view"),
      heatmapSpotModeAbsolute: this.localize("card.heatmap_spot_mode_absolute", "Absolute"),
      heatmapSpotModeFixed: this.localize("card.heatmap_spot_mode_fixed", "Relative to fixed"),
      heatmapPriceAbsoluteInfo: this.localize(
        "card.heatmap_price_absolute_info",
        "Ref: absolute spot price (net, excl. tax and markup)"
      ),
      heatmapPriceRefFixed: (reference) => this.localize(
        "card.heatmap_price_ref_fixed",
        "Ref: {reference} ct/kWh (Fixed)",
        { reference }
      ),
      heatmapSeasonWholeYear: this.localize("card.heatmap_season_whole_year", "Whole year"),
      heatmapSeasonSpring: this.localize("card.heatmap_season_spring", "Spring"),
      heatmapSeasonSummer: this.localize("card.heatmap_season_summer", "Summer"),
      heatmapSeasonAutumn: this.localize("card.heatmap_season_autumn", "Autumn"),
      heatmapSeasonWinter: this.localize("card.heatmap_season_winter", "Winter"),
      heatmapSeasonRangeWholeYear: this.localize("card.heatmap_season_range_whole_year", "Whole year (Jan-Dec)"),
      heatmapSeasonRangeSpring: this.localize("card.heatmap_season_range_spring", "Spring (Mar-May)"),
      heatmapSeasonRangeSummer: this.localize("card.heatmap_season_range_summer", "Summer (Jun-Aug)"),
      heatmapSeasonRangeAutumn: this.localize("card.heatmap_season_range_autumn", "Autumn (Sep-Nov)"),
      heatmapSeasonRangeWinter: this.localize("card.heatmap_season_range_winter", "Winter (Dec-Feb)"),
      heatmapSeasonScope: ({ range }) => this.localize(
        "card.heatmap_season_scope",
        "Scope: {range}",
        { range }
      ),
      heatmapDataCoverageSeason: ({ hours, days }) => this.localize(
        "card.heatmap_data_coverage_season",
        "Data available in this view: {hours} matched hours ({days} days).",
        { hours, days }
      ),
      heatmapCoverageWarningLow: ({ coverage }) => this.localize(
        "card.heatmap_coverage_warning_low",
        "Coverage warning: Less than 50% of this season is available ({coverage}% matched).",
        { coverage }
      ),
      heatmapLegendLower: this.localize("card.heatmap_legend_lower", "Lower"),
      heatmapLegendHigher: this.localize("card.heatmap_legend_higher", "Higher"),
      heatmapLegendCheaper: this.localize("card.heatmap_legend_cheaper", "Cheaper"),
      heatmapLegendExpensive: this.localize("card.heatmap_legend_expensive", "More expensive"),
      heatmapDayMonday: this.localize("card.heatmap_day_monday", "Mon"),
      heatmapDayTuesday: this.localize("card.heatmap_day_tuesday", "Tue"),
      heatmapDayWednesday: this.localize("card.heatmap_day_wednesday", "Wed"),
      heatmapDayThursday: this.localize("card.heatmap_day_thursday", "Thu"),
      heatmapDayFriday: this.localize("card.heatmap_day_friday", "Fri"),
      heatmapDaySaturday: this.localize("card.heatmap_day_saturday", "Sat"),
      heatmapDaySunday: this.localize("card.heatmap_day_sunday", "Sun"),
      monthlyTariffTitle: this.localize(
        "card.monthly_tariff_title",
        "Monthly tariff balance"
      ),
      monthlyTariffDataAvailabilityLabel: this.localize(
        "card.monthly_tariff_data_availability_label",
        "Data availability"
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
      kpiInfoLabel: this.localize("card.kpi_info_label", "More information"),
      kpiFixedCostHelp: this.localize(
        "card.kpi_fixed_cost_help",
        "Total cost of the fixed tariff for the selected period including base fee, markup, and tax."
      ),
      kpiSpotCostHelp: this.localize(
        "card.kpi_spot_cost_help",
        "Total cost of the spot tariff for the selected period based on hourly market prices including markup, base fee, and tax."
      ),
      kpiBreakEvenHelp: this.localize(
        "card.kpi_break_even_help",
        "Fixed price in ct/kWh at which fixed and spot tariff would cost the same for this profile."
      ),
      kpiSpotCheaperHelp: this.localize(
        "card.kpi_spot_cheaper_help",
        "Share of hours in which spot (incl. markup) was cheaper than the currently configured fixed price."
      ),
      kpiBreakEvenCompare: ({ fixed, delta }) => this.localize(
        "card.kpi_break_even_compare",
        "Current fixed: {fixed} (Delta to break-even: {delta})",
        { fixed, delta }
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
    const rate = Number.isFinite(taxRate) ? taxRate : 20.0;
    return this.localize(
      "card.card_tax_note",
      "All prices shown are gross and include {taxRate}% tax. Volumetric grid fees and static surcharges are excluded, as they cancel out in the tariff comparison.",
      { taxRate: rate.toFixed(1) }
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
    this.syncDevicePicker();
    this.renderMonitoredDevices();
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
    const addDeviceBtn = this.querySelector("#addDeviceBtn");
    const cancelDeviceBtn = this.querySelector("#cancelDeviceBtn");
    const saveDeviceBtn = this.querySelector("#saveDeviceBtn");
    const deviceSensorPicker = this.querySelector("#deviceSensorPicker");
    const monitoredDevicesList = this.querySelector("#monitoredDevicesList");

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

    sourceCsvSwitch.addEventListener("click", (event) => { event.stopPropagation(); this.selectSource("csv"); });
    sourceSensorSwitch.addEventListener("click", (event) => { event.stopPropagation(); this.selectSource("sensor"); });
    integrationSettingsBtn.addEventListener("click", (event) => { event.stopPropagation(); this.navigateToIntegrations(); });

    const sourceSelector = this.querySelector("#sourceSelector");
    const sourceCardSummary = this.querySelector("#sourceSelector > summary");
    if (sourceSelector && sourceCardSummary) {
      sourceCardSummary.addEventListener("click", (event) => {
        if (!this.hasLoadedData(this.latestData)) {
          event.preventDefault();
        }
      });
      sourceSelector.addEventListener("toggle", () => {
        this._sourcePanelOpen = sourceSelector.open;
        this.saveUiState();
      });
    }

    if (addDeviceBtn) addDeviceBtn.addEventListener("click", () => this.openDeviceEditor());
    if (cancelDeviceBtn) cancelDeviceBtn.addEventListener("click", () => this.closeDeviceEditor());
    if (saveDeviceBtn) saveDeviceBtn.addEventListener("click", () => this.addMonitoredDevice());
    if (deviceSensorPicker) {
      deviceSensorPicker.addEventListener("value-changed", (event) => {
        this.selectDeviceSensor(event.detail?.value || null);
      });
      deviceSensorPicker.addEventListener("change", (event) => {
        this.selectDeviceSensor(event.target?.value || null);
      });
    }
    if (monitoredDevicesList) {
      monitoredDevicesList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-device-action]");
        if (!button) return;
        const entityId = button.dataset.entityId;
        if (button.dataset.deviceAction === "remove") this.removeMonitoredDevice(entityId);
      });
    }

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
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          .forEach((sensor) => {
            const option = document.createElement("option");
            option.value = sensor.id;
            option.textContent = sensor.name === sensor.id ? sensor.name : `${sensor.name} (${sensor.id})`;
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

  getCompatibleEnergySensors() {
    return Object.values(this._hass?.states || {}).filter((state) => {
      const attrs = state.attributes || {};
      return attrs.device_class === "energy"
        && (attrs.state_class === "total_increasing" || attrs.state_class === "total")
        && (attrs.unit_of_measurement === "kWh" || attrs.unit_of_measurement === "Wh");
    });
  }

  async loadMonitoredDevicesFromBackend() {
    try {
      this._monitoredDevices = await loadMonitoredDevices(this._hass);
    } catch (error) {
      console.error("Failed to load monitored devices", error);
      this._monitoredDevices = [];
    }
    this.renderMonitoredDevices();
    this.syncDevicePicker();
    if (this.latestData) this.refreshDeviceAnalyses(this.latestData);
  }

  renderMonitoredDevices() {
    const list = this.querySelector("#monitoredDevicesList");
    const content = this.querySelector("#monitoredDevicesContent");
    const prerequisite = this.querySelector("#monitoredDevicesPrerequisite");
    if (!list || !content || !prerequisite) return;

    const texts = this._texts || this.getTexts();
    const hasProfile = this.hasLoadedData(this.latestData);
    content.hidden = !hasProfile;
    prerequisite.hidden = hasProfile;
    if (!hasProfile) return;

    const devices = Array.isArray(this._monitoredDevices) ? this._monitoredDevices : [];
    if (devices.length === 0) {
      list.innerHTML = `<div class="devices-empty">${texts.devicesEmpty}</div>`;
      return;
    }

    list.innerHTML = devices.map((device) => `
      <div class="monitored-device-row">
        <div class="monitored-device-fields">
          <input class="device-name-input" data-device-name="${this.escapeAttribute(device.entity_id)}" value="${this.escapeAttribute(device.name)}" maxlength="80" aria-label="${texts.deviceNameLabel}" />
          <span class="monitored-device-entity">${this.escapeAttribute(device.entity_id)}</span>
        </div>
        <div class="monitored-device-actions">
          <button class="device-icon-button danger" type="button" data-device-action="remove" data-entity-id="${this.escapeAttribute(device.entity_id)}" title="${texts.deviceRemove}" aria-label="${texts.deviceRemove}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        </div>
      </div>
    `).join("");
  }

  openDeviceEditor() {
    const editor = this.querySelector("#deviceEditor");
    if (editor) editor.hidden = false;
    this._deviceEditorEntityId = null;
    const nameInput = this.querySelector("#deviceNameInput");
    if (nameInput) nameInput.value = "";
    this.syncDevicePicker();
  }

  closeDeviceEditor() {
    const editor = this.querySelector("#deviceEditor");
    if (editor) editor.hidden = true;
    this._deviceEditorEntityId = null;
  }

  selectDeviceSensor(entityId) {
    this._deviceEditorEntityId = entityId;
    const state = entityId ? this._hass?.states?.[entityId] : null;
    const nameInput = this.querySelector("#deviceNameInput");
    if (nameInput && state && !nameInput.value.trim()) {
      nameInput.value = state.attributes?.friendly_name || entityId;
    }
  }

  syncDevicePicker() {
    let picker = this.querySelector("#deviceSensorPicker");
    if (!picker || !this._hass) return;
    const texts = this._texts || this.getTexts();
    const excluded = new Set((this._monitoredDevices || []).map((device) => device.entity_id));
    if (this._activeSource === "sensor" && this._loadedSensorEntityId) {
      excluded.add(this._loadedSensorEntityId);
    }
    const matches = this.getCompatibleEnergySensors().filter((state) => !excluded.has(state.entity_id));
    const entityIds = matches.map((state) => state.entity_id);

    if (picker.tagName === "HA-ENTITY-PICKER" && !customElements.get("ha-entity-picker")) {
      const select = document.createElement("select");
      select.id = "deviceSensorPicker";
      select.className = "sensor-select";
      select.addEventListener("change", (e) => {
        this.selectDeviceSensor(e.target.value || null);
      });
      picker.replaceWith(select);
      picker = select;
    }

    const targetValue = this._deviceEditorEntityId || "";
    const isDisabled = entityIds.length === 0;

    if (picker.tagName === "HA-ENTITY-PICKER") {
      picker.hass = this._hass;
      picker.label = texts.deviceSensorLabel;
      picker.placeholder = texts.deviceSensorPlaceholder;
      picker.includeDomains = ["sensor"];
      picker.includeEntities = entityIds;
      picker.excludeEntities = [...excluded];
      picker.disabled = isDisabled;
      if (picker.value !== targetValue) {
        picker.value = targetValue;
      }
    } else {
      const currentSensorsHash = entityIds.slice().sort().join(",");
      const shouldRebuild = picker.dataset.sensorsHash !== currentSensorsHash;
      if (shouldRebuild) {
        picker.dataset.sensorsHash = currentSensorsHash;
        picker.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = texts.deviceSensorPlaceholder;
        placeholder.disabled = true;
        picker.appendChild(placeholder);

        matches
          .map((state) => ({
            id: state.entity_id,
            name: state.attributes?.friendly_name || state.entity_id
          }))
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          .forEach((sensor) => {
            const option = document.createElement("option");
            option.value = sensor.id;
            option.textContent = sensor.name === sensor.id ? sensor.name : `${sensor.name} (${sensor.id})`;
            picker.appendChild(option);
          });
      }
      if (picker.value !== targetValue) {
        picker.value = targetValue;
      }
      picker.disabled = isDisabled;
    }

    const messageEl = this.querySelector("#deviceSensorMessage");
    if (messageEl) {
      if (entityIds.length === 0) {
        messageEl.style.display = "";
        messageEl.textContent = texts.deviceSensorNoneOption;
      } else {
        messageEl.style.display = "none";
        messageEl.textContent = "";
      }
    }
  }

  async persistMonitoredDevices(devices) {
    const texts = this._texts || this.getTexts();
    try {
      this._monitoredDevices = await saveMonitoredDevices(this._hass, devices);
      this._deviceAnalysisProfileKey = null;
      this.closeDeviceEditor();
      this.renderMonitoredDevices();
      this.syncDevicePicker();
      if (this.latestData) this.renderDashboard(this.latestData, { collapseSourcePanel: false });
    } catch (error) {
      const message = this.querySelector("#deviceMessage");
      if (message) {
        message.hidden = false;
        message.className = "sensor-message error";
        message.textContent = error.message || texts.deviceSaveError;
      }
    }
  }

  addMonitoredDevice() {
    const texts = this._texts || this.getTexts();
    const name = this.querySelector("#deviceNameInput")?.value.trim() || "";
    if (!this._deviceEditorEntityId || !name) {
      const message = this.querySelector("#deviceMessage");
      if (message) {
        message.hidden = false;
        message.className = "sensor-message error";
        message.textContent = texts.deviceNameRequired;
      }
      return;
    }
    this.persistMonitoredDevices([
      ...(this._monitoredDevices || []),
      { entity_id: this._deviceEditorEntityId, name }
    ]);
  }

  renameMonitoredDevice(entityId) {
    const input = this.querySelector(`[data-device-name="${CSS.escape(entityId)}"]`);
    const name = input?.value.trim() || "";
    if (!name) return;
    this.persistMonitoredDevices((this._monitoredDevices || []).map((device) => (
      device.entity_id === entityId ? { ...device, name } : device
    )));
  }

  removeMonitoredDevice(entityId) {
    if (this._selectedConsumptionProfile === entityId) {
      this._selectedConsumptionProfile = "total";
      this._selectedDeviceAnalysis = null;
    }
    this.persistMonitoredDevices(
      (this._monitoredDevices || []).filter((device) => device.entity_id !== entityId)
    );
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
    this.renderMonitoredDevices();

    if (sourceSelector) {
      sourceSelector.open = !hasData || this._sourcePanelOpen !== false;
    }
    if (dashboardContainer) {
      dashboardContainer.style.display = hasData ? "block" : "none";
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

  renderDashboard(response) {
    const container = this.querySelector("#dashboardContainer");
    if (!container) return;
    const texts = this._texts || this.getTexts();

    if (!this.hasLoadedData(response)) {
      this.clearDashboardForSourceSwitch();
      return;
    }

    this.latestData = response;
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
    
    const avgConsumptionStr = formatNumber(response.avg_consumption_kwh, 3);
    const avgPriceStr = formatNumber(response.avg_price_ct_kwh, 2);

    const analysisViews = this.buildAnalysisGroups({
      start,
      end,
      matchedHours: response.matched_hours,
      dataCompletenessRatio: response.data_completeness_ratio,
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
      effectiveSpotPrice: response.effective_spot_price_ct_kwh,
      flexibilityPotentialPercent: response.flexibility_potential_percent,
      priceSensitivityPercent: response.price_sensitivity_percent,
      maxExtraSavingsEur: response.max_extra_savings_eur,
      maxPenaltyRiskEur: response.max_penalty_risk_eur,
      fixedTariffCostEur: response.tariff_totals?.fixed_cost_eur,
      spotTariffCostEur: response.tariff_totals?.spot_cost_eur,
      peakExposurePercent: response.peak_exposure_percent,
      offPeakSharePercent: response.off_peak_share_percent,
      spotCheaperShare: response.spot_cheaper_share,
      negativePriceHours: response.negative_price_hours,
      negativePriceShare: response.negative_price_share,
      maxSpotPrice: response.max_spot_price_ct_kwh,
      minSpotPrice: response.min_spot_price_ct_kwh,
      maxSpotPriceAt: response.max_spot_price_at,
      minSpotPriceAt: response.min_spot_price_at,
      breakEvenFixedCtKwh: response.break_even_fixed_ct_kwh,
      fixedPriceCt: response.fixed_price_ct,
      fixedBaseFeeEur: response.fixed_base_fee_eur,
      spotMarkupCt: response.spot_markup_ct,
      spotBaseFeeEur: response.spot_base_fee_eur
    });

    if (!this._dashboardTab) this._dashboardTab = "monthly";
    if (typeof this._analysisOpen !== "boolean") this._analysisOpen = false;

    container.innerHTML = renderDashboardHtml({
      heatmapsHtml,
      monthlyTariffHtml,
      technicalAnalysisGroups: analysisViews.technical,
      riskOptimizationGroups: analysisViews.risk,
      taxNote: analysisViews.taxNote,
      texts,
      dashboardTab: this._dashboardTab,
      analysisOpen: this._analysisOpen
    });

    const analysisIsland = this.querySelector(".analysis-island");
    if (analysisIsland) {
      analysisIsland.addEventListener("toggle", () => {
        this._analysisOpen = analysisIsland.open;
        this.saveUiState();
      });
    }

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

    const consumptionProfileSelect = this.querySelector("#consumptionProfileSelect");
    if (consumptionProfileSelect) {
      consumptionProfileSelect.addEventListener("change", (event) => {
        this.selectConsumptionProfile(event.target.value || "total");
      });
    }

    this.querySelectorAll("[data-spot-price-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        this._spotPriceMode = button.dataset.spotPriceMode || "absolute";
        this.saveUiState();
        this.renderDashboard(this.latestData, { collapseSourcePanel: false });
      });
    });

    this.querySelectorAll("[data-optimization-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        this._optimizationMode = button.dataset.optimizationMode || "shift_score";
        this.saveUiState();
        this.renderDashboard(this.latestData, { collapseSourcePanel: false });
      });
    });

    const toggleSourcePanelBtn = this.querySelector("#toggleSourcePanelBtn");
    if (toggleSourcePanelBtn) {
      toggleSourcePanelBtn.addEventListener("click", () => {
        this._sourcePanelOpen = !(this._sourcePanelOpen !== false);
        this.saveUiState();
        this.updateLayoutVisibility();
        if (this._sourcePanelOpen) {
          requestAnimationFrame(() => {
            this.scrollViewToTop();
          });
        }
      });
    }

    this.updateSavingsBanner(true);
    this.refreshDeviceAnalyses(response);
  }

  getDeviceAnalysisKey(response) {
    const devices = (this._monitoredDevices || []).map((device) => device.entity_id).join(",");
    return `${response.source || ""}|${response.available_start || response.start || ""}|${response.available_end || response.end || ""}|${devices}`;
  }

  async refreshDeviceAnalyses(response) {
    const devices = this._monitoredDevices || [];
    const key = this.getDeviceAnalysisKey(response);
    if (this._deviceAnalysisProfileKey === key) return;
    this._deviceAnalysisProfileKey = key;
    this._deviceAnalysisCache = new Map();
    this._unavailableDevices = new Set();
    if (devices.length === 0) return;

    await Promise.all(devices.map(async (device) => {
      try {
        const analysis = await loadDeviceAnalysis(this._hass, device.entity_id);
        if (this._deviceAnalysisProfileKey === key) {
          this._deviceAnalysisCache.set(device.entity_id, analysis);
        }
      } catch (error) {
        if (this._deviceAnalysisProfileKey === key && error.code === "no_overlap") {
          this._unavailableDevices.add(device.entity_id);
        } else {
          console.error(`Failed to load device analysis for ${device.entity_id}`, error);
        }
      }
    }));

    if (this._deviceAnalysisProfileKey !== key || this.latestData !== response) return;
    if (this._selectedConsumptionProfile !== "total"
      && !this._deviceAnalysisCache.has(this._selectedConsumptionProfile)) {
      this._selectedConsumptionProfile = "total";
      this.saveUiState();
    }
    this.renderDashboard(response, { collapseSourcePanel: false });
  }

  async selectConsumptionProfile(entityId) {
    if (entityId === "total") {
      this._selectedConsumptionProfile = "total";
    } else if (this._deviceAnalysisCache?.has(entityId)) {
      this._selectedConsumptionProfile = entityId;
    } else {
      this._selectedConsumptionProfile = "total";
    }
    this.saveUiState();
    this.renderDashboard(this.latestData, { collapseSourcePanel: false });
  }

  buildSeasonalHeatmapsHtml(response) {
    const texts = this._texts || this.getTexts();
    const selectedProfile = this._selectedConsumptionProfile || "total";
    const deviceAnalysis = selectedProfile !== "total"
      ? this._deviceAnalysisCache?.get(selectedProfile)
      : null;
    const isDeviceProfile = Boolean(deviceAnalysis);
    const consumptionSource = deviceAnalysis || response;
    const monthly = Array.isArray(response.tariff_monthly)
      ? response.tariff_monthly
      : Array.isArray(response.monthly_tariff_comparison?.months)
        ? response.monthly_tariff_comparison.months
        : [];
    const monthHours = new Map();
    monthly.forEach((item) => {
      const monthNumber = Number(item.month || 0);
      if (monthNumber >= 1 && monthNumber <= 12) {
        monthHours.set(monthNumber, Number(item.matched_hours || 0));
      }
    });

    const seasonMonths = {
      whole_year: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      spring: [3, 4, 5],
      summer: [6, 7, 8],
      autumn: [9, 10, 11],
      winter: [12, 1, 2]
    };
    const seasonRanges = {
      whole_year: texts.heatmapSeasonRangeWholeYear,
      spring: texts.heatmapSeasonRangeSpring,
      summer: texts.heatmapSeasonRangeSummer,
      autumn: texts.heatmapSeasonRangeAutumn,
      winter: texts.heatmapSeasonRangeWinter
    };

    const totalMatchedHours = Number(consumptionSource.matched_hours || 0);
    const seasonMatchedHours = (seasonKey) => {
      if (seasonKey === "whole_year") {
        return totalMatchedHours;
      }
      if (isDeviceProfile) {
        return Number(consumptionSource.seasonal_heatmaps?.[seasonKey]?.matched_hours || 0);
      }
      const monthsForSeason = seasonMonths[seasonKey] || [];
      return monthsForSeason.reduce((sum, monthNumber) => sum + Number(monthHours.get(monthNumber) || 0), 0);
    };
    const seasons = [
      { key: "whole_year", label: texts.heatmapSeasonWholeYear },
      { key: "spring", label: texts.heatmapSeasonSpring },
      { key: "summer", label: texts.heatmapSeasonSummer },
      { key: "autumn", label: texts.heatmapSeasonAutumn },
      { key: "winter", label: texts.heatmapSeasonWinter },
    ];
    const selectedSeason = this._heatmapSeason || "whole_year";
    const selectedConsumptionMode = this._consumptionMode === "relative_mean" ? "relative_mean" : "absolute";
    const selectedSpotMode = this._spotPriceMode === "fixed" ? "fixed" : "absolute";
    const selectedOptimizationMode = this._optimizationMode || "shift_score";
    const heatmapDayLabels = [
      texts.heatmapDayMonday,
      texts.heatmapDayTuesday,
      texts.heatmapDayWednesday,
      texts.heatmapDayThursday,
      texts.heatmapDayFriday,
      texts.heatmapDaySaturday,
      texts.heatmapDaySunday,
    ];
    const wholeYearHeatmaps = {
      consumption_heatmap: consumptionSource.consumption_heatmap,
      price_heatmap: response.price_heatmap,
      retail_price_heatmap: response.retail_price_heatmap || response.price_heatmap,
    };
    const fixedPrice = Number(response.fixed_price_ct);
    const hasFixedPrice = Number.isFinite(fixedPrice);
    const resolvedSpotMode = selectedSpotMode === "fixed" && hasFixedPrice ? "fixed" : "absolute";
    const priceReference = resolvedSpotMode === "fixed" ? fixedPrice : null;
    const seasonalHeatmaps = response.seasonal_heatmaps || {};
    const consumptionSeasonalHeatmaps = consumptionSource.seasonal_heatmaps || {};

    const seasonHeatmaps = seasons.map((season) => (
      season.key === "whole_year"
        ? wholeYearHeatmaps
        : {
            consumption_heatmap: consumptionSeasonalHeatmaps[season.key]?.consumption_heatmap
              || wholeYearHeatmaps.consumption_heatmap,
            price_heatmap: seasonalHeatmaps[season.key]?.price_heatmap
              || wholeYearHeatmaps.price_heatmap,
            retail_price_heatmap: seasonalHeatmaps[season.key]?.retail_price_heatmap
              || wholeYearHeatmaps.retail_price_heatmap
          }
    ));

    const consumptionDisplayHeatmaps = seasonHeatmaps.map((heatmaps) =>
      this.computeConsumptionDisplayHeatmap(
        heatmaps.consumption_heatmap,
        heatmaps.price_heatmap,
        selectedConsumptionMode
      )
    );
    const consumptionScale = selectedConsumptionMode === "absolute"
      ? this.computeAbsoluteConsumptionScaleFromMany(consumptionDisplayHeatmaps)
      : this.computeSymmetricHeatmapScaleFromMany(consumptionDisplayHeatmaps);

    const priceDisplayHeatmaps = seasonHeatmaps.map((heatmaps) =>
      Number.isFinite(priceReference)
        ? this.computePriceDeltaHeatmap(heatmaps.retail_price_heatmap, priceReference)
        : heatmaps.price_heatmap
    );
    const priceScale = Number.isFinite(priceReference)
      ? this.computeSymmetricHeatmapScaleFromMany(priceDisplayHeatmaps)
      : this.computeRobustHeatmapScaleFromMany(priceDisplayHeatmaps);
    const optimizationDisplayHeatmaps = seasonHeatmaps.map((heatmaps) =>
      this.computeOptimizationDisplayHeatmap(
        heatmaps.consumption_heatmap,
        heatmaps.price_heatmap,
        heatmaps.retail_price_heatmap,
        selectedOptimizationMode
      )
    );
    const optimizationScale = selectedOptimizationMode === "cost_gradient"
      ? this.computeRobustHeatmapScaleFromMany(optimizationDisplayHeatmaps)
      : this.computeSymmetricHeatmapScaleFromMany(optimizationDisplayHeatmaps);

    const buttons = seasons
      .map((season) => `
        <button class="heatmap-season-button${season.key === selectedSeason ? " active" : ""}" data-heatmap-season="${season.key}" aria-pressed="${String(season.key === selectedSeason)}">${season.label}</button>
      `)
      .join("");

    const consumptionModeButtons = [
      { key: "absolute", label: texts.heatmapConsumptionModeAbsolute },
      { key: "relative_mean", label: texts.heatmapConsumptionModeRelativeMean },
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

    const optimizationModeButtons = [
      { key: "cost_gradient", label: texts.heatmapOptimizationModeCostGradient },
      { key: "shift_score", label: texts.heatmapOptimizationModeScore },
    ]
      .map((mode) => {
        const isActive = selectedOptimizationMode === mode.key;
        return `
          <button
            class="optimization-mode-button${isActive ? " active" : ""}"
            data-optimization-mode="${mode.key}"
            aria-pressed="${String(isActive)}"
          >${mode.label}</button>
        `;
      })
      .join("");

    const panels = seasons
      .map((season) => {
        const seasonHoursRaw = seasonMatchedHours(season.key);
        const seasonHours = formatNumber(seasonHoursRaw, 0);
        const seasonDays = formatNumber(seasonHoursRaw > 0 ? seasonHoursRaw / 24 : 0, 1);
        const potentialSeasonHours = this.getFullSeasonHours(season.key);
        const coverageRatio = potentialSeasonHours > 0 ? (seasonHoursRaw / potentialSeasonHours) : null;
        const showCoverageWarning = Number.isFinite(coverageRatio) && coverageRatio < 0.5;
        const coveragePct = Number.isFinite(coverageRatio) ? formatNumber(coverageRatio * 100, 1) : "0.0";
        const seasonScopeText = texts.heatmapSeasonScope({ range: seasonRanges[season.key] || season.label });
        const seasonCoverageText = texts.heatmapDataCoverageSeason({ hours: seasonHours, days: seasonDays });
        const seasonCoverageWarningText = showCoverageWarning
          ? texts.heatmapCoverageWarningLow({ coverage: coveragePct })
          : "";
        const seasonIndex = seasons.findIndex((item) => item.key === season.key);
        const data = seasonHeatmaps[seasonIndex] || wholeYearHeatmaps;
        const seasonPriceHeatmap = Number.isFinite(priceReference)
          ? this.computePriceDeltaHeatmap(data.retail_price_heatmap, priceReference)
          : data.price_heatmap;
        const seasonConsumptionHeatmap = this.computeConsumptionDisplayHeatmap(
          data.consumption_heatmap,
          data.price_heatmap,
          selectedConsumptionMode
        );
        const seasonOptimizationHeatmap = this.computeOptimizationDisplayHeatmap(
          data.consumption_heatmap,
          data.price_heatmap,
          data.retail_price_heatmap,
          selectedOptimizationMode
        );
        let consumptionInfoText = texts.heatmapConsumptionAbsoluteInfo;
        let consumptionTitle = isDeviceProfile
          ? texts.heatmapDeviceConsumptionTitle(deviceAnalysis.name)
          : texts.heatmapConsumptionTitle;
        let consumptionUnit = "kWh";
        let consumptionLegend = { low: texts.heatmapLegendLow, high: texts.heatmapLegendHigh };
        if (selectedConsumptionMode === "relative_mean") {
          const meanRef = this.computeHeatmapMean(data.consumption_heatmap);
          consumptionInfoText = texts.heatmapConsumptionRefMean(formatNumber(meanRef, 3));
          consumptionLegend = { low: texts.heatmapLegendLower, high: texts.heatmapLegendHigher };
        }

        const consumptionHtml = generateHeatmapHTML(
          seasonConsumptionHeatmap,
          consumptionTitle,
          consumptionUnit,
          false,
          formatNumber,
          consumptionLegend,
          consumptionScale,
          consumptionInfoText ? { infoText: consumptionInfoText, dayLabels: heatmapDayLabels } : { dayLabels: heatmapDayLabels }
        );
        const referenceFormatted = Number.isFinite(priceReference) ? formatNumber(priceReference, 2) : "-";
        let priceInfoText = texts.heatmapPriceAbsoluteInfo;
        if (resolvedSpotMode === "fixed") {
          priceInfoText = texts.heatmapPriceRefFixed(referenceFormatted);
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
          priceInfoText ? { infoText: priceInfoText, dayLabels: heatmapDayLabels } : { dayLabels: heatmapDayLabels }
        );
        const optimizationHtml = selectedOptimizationMode === "cost_gradient"
          ? generateHeatmapHTML(
              seasonOptimizationHeatmap,
              texts.heatmapOptimizationCostGradientTitle,
              "ct/h",
              false,
              formatNumber,
              {
                low: texts.heatmapLegendLow,
                high: texts.heatmapLegendHigh,
              },
              optimizationScale,
              {
                infoText: texts.heatmapOptimizationCostGradientInfo,
                dayLabels: heatmapDayLabels,
              }
            )
          : generateHeatmapHTML(
              seasonOptimizationHeatmap,
              texts.heatmapOptimizationTitle,
              "score",
              false,
              formatNumber,
              {
                low: texts.heatmapLegendShiftAway,
                high: texts.heatmapLegendShiftHere,
              },
              optimizationScale,
              {
                infoText: texts.heatmapOptimizationInfo,
                colorMode: "optimization",
                hideValueExtremes: true,
                legendBarStyle: "background: linear-gradient(90deg, hsla(6, 74%, 46%, 0.95) 0%, hsla(215, 10%, 24%, 0.95) 50%, hsla(135, 62%, 38%, 0.95) 100%);",
                dayLabels: heatmapDayLabels,
              }
            );

        return `
          <div class="heatmap-season-panel" data-heatmap-panel="${season.key}"${season.key === selectedSeason ? "" : " hidden"}>
            <div class="heatmap-context-card">
              <div class="heatmap-context-meta">
                <div class="heatmap-context-line">${seasonScopeText}</div>
                <div class="heatmap-context-line">${seasonCoverageText}</div>
                ${showCoverageWarning ? `<div class="heatmap-coverage-warning">${seasonCoverageWarningText}</div>` : ""}
              </div>
            </div>
            <section class="heatmap-subcard heatmap-subcard-consumption">
              <div class="heatmap-subcard-controls consumption-mode-navigation" role="group" aria-label="Consumption view">
                <span class="spot-mode-label">${texts.heatmapConsumptionModeLabel}</span>
                <div class="consumption-mode-buttons">${consumptionModeButtons}</div>
              </div>
              ${consumptionHtml}
            </section>
            <section class="heatmap-subcard heatmap-subcard-spot">
              <div class="heatmap-subcard-controls spot-mode-navigation" role="group" aria-label="Spot view">
                <span class="spot-mode-label">${texts.heatmapSpotModeLabel}</span>
                <div class="spot-mode-buttons">${spotModeButtons}</div>
              </div>
              ${priceHtml}
            </section>
            ${isDeviceProfile ? "" : `<section class="heatmap-subcard heatmap-subcard-optimization">
              <div class="heatmap-subcard-controls" role="group" aria-label="Optimization view">
                <span class="spot-mode-label">${texts.heatmapOptimizationModeLabel}</span>
                <div class="optimization-mode-buttons">${optimizationModeButtons}</div>
              </div>
              ${optimizationHtml}
            </section>`}
          </div>
        `;
      })
      .join("");

    return `
      <section class="seasonal-heatmaps">
        <div class="seasonal-heatmaps-card">
          <div class="consumption-profile-control">
            <label for="consumptionProfileSelect">${texts.consumptionProfileLabel}</label>
            <select id="consumptionProfileSelect" class="consumption-profile-select">
              <option value="total"${!isDeviceProfile ? " selected" : ""}>${texts.consumptionProfileTotal}</option>
              ${(this._monitoredDevices || []).map((device) => {
                const unavailable = this._unavailableDevices?.has(device.entity_id);
                const selected = isDeviceProfile && device.entity_id === selectedProfile;
                const label = unavailable ? texts.consumptionProfileUnavailable(device.name) : device.name;
                return `<option value="${this.escapeAttribute(device.entity_id)}"${selected ? " selected" : ""}${unavailable ? " disabled" : ""}>${this.escapeAttribute(label)}</option>`;
              }).join("")}
            </select>
          </div>
          <div class="heatmap-season-navigation" role="group" aria-label="Heatmap season">
            ${buttons}
          </div>
          ${panels}
        </div>
      </section>
    `;
  }

  computeConsumptionDisplayHeatmap(consumptionHeatmap, priceHeatmap, mode) {
    const base = (consumptionHeatmap || []).map((row) => (row || []).map((value) => Number(value) || 0));
    if (mode === "relative_mean") {
      const mean = this.computeHeatmapMean(base);
      return base.map((row) => row.map((value) => Number((value - mean).toFixed(4))));
    }
    return base;
  }

  computeCostImpactHeatmap(consumptionHeatmap, retailPriceHeatmap) {
    const prices = (retailPriceHeatmap || []).map((row) => (row || []).map((value) => Number(value) || 0));
    return (consumptionHeatmap || []).map((row, day) =>
      (row || []).map((value, hour) => {
        const numericValue = Number(value);
        const numericPrice = Number(prices[day]?.[hour]);
        if (!Number.isFinite(numericValue) || !Number.isFinite(numericPrice)) {
          return 0;
        }
        return Number((numericValue * numericPrice).toFixed(4));
      })
    );
  }

  computeOptimizationDisplayHeatmap(consumptionHeatmap, priceHeatmap, retailPriceHeatmap, mode) {
    if (mode === "cost_gradient") {
      return this.computeCostImpactHeatmap(consumptionHeatmap, retailPriceHeatmap || priceHeatmap);
    }
    return this.computeLoadShiftPotentialHeatmap(consumptionHeatmap, priceHeatmap);
  }

  computeLoadShiftPotentialHeatmap(consumptionHeatmap, priceHeatmap) {
    const consumption = (consumptionHeatmap || []).map((row) => (row || []).map((value) => Number(value)));
    const prices = (priceHeatmap || []).map((row) => (row || []).map((value) => Number(value)));

    const avgConsumption = this.computeHeatmapMean(consumption);
    const avgPrice = this.computeHeatmapMean(prices);
    const stdConsumption = this.computeHeatmapStdDev(consumption, avgConsumption);
    const stdPrice = this.computeHeatmapStdDev(prices, avgPrice);
    const consumptionScale = stdConsumption > 0 ? stdConsumption : Math.max(Math.abs(avgConsumption) * 0.15, 0.05);
    const priceScale = stdPrice > 0 ? stdPrice : Math.max(Math.abs(avgPrice) * 0.15, 0.05);

    return consumption.map((row, day) =>
      row.map((consumptionValue, hour) => {
        const priceValue = prices[day]?.[hour];
        if (!Number.isFinite(consumptionValue) || !Number.isFinite(priceValue)) {
          return 0;
        }

        if (consumptionValue > avgConsumption && priceValue > avgPrice) {
          const consumptionAbove = (consumptionValue - avgConsumption) / consumptionScale;
          const priceAbove = (priceValue - avgPrice) / priceScale;
          const severity = Math.min(4, (consumptionAbove + priceAbove) / 2);
          return Number((-severity).toFixed(4));
        }

        if (consumptionValue < avgConsumption && priceValue < avgPrice) {
          const consumptionBelow = (avgConsumption - consumptionValue) / consumptionScale;
          const priceBelow = (avgPrice - priceValue) / priceScale;
          const opportunity = Math.min(4, (consumptionBelow + priceBelow) / 2);
          return Number(opportunity.toFixed(4));
        }

        return 0;
      })
    );
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

  computeHeatmapStdDev(heatmapData, mean) {
    const values = (heatmapData || [])
      .flat()
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) return 0;
    const resolvedMean = Number.isFinite(mean)
      ? mean
      : values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => {
      const delta = value - resolvedMean;
      return sum + delta * delta;
    }, 0) / values.length;
    return Math.sqrt(variance);
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

  getFullSeasonHours(seasonKey) {
    const seasonDays = {
      whole_year: 365,
      spring: 92,
      summer: 92,
      autumn: 91,
      winter: 90,
    };
    const days = seasonDays[seasonKey] || 0;
    return days * 24;
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
    const currentDelta = costSpotEur - costFixEur;
    const currentDeltaLabel = `${formatNumber(Math.abs(currentDelta), 2)} €`;
    const currentDeltaDirection = currentDelta > 0 ? "risk" : currentDelta < 0 ? "savings" : "neutral";
    const currentDeltaVerdict = currentDeltaDirection === "risk"
      ? texts.analysisStatusQuoSpotHigherLabel
      : currentDeltaDirection === "savings"
        ? texts.analysisStatusQuoSpotCheaperSubtitle
        : texts.analysisStatusQuoBalancedLabel;
    const maxExtraSavings = Number(this.latestData.max_extra_savings_eur);
    const maxPenaltyRisk = Number(this.latestData.max_penalty_risk_eur);
    // max_extra_savings_eur / max_penalty_risk_eur are incremental load-shifting
    // effects on top of the status quo, not standalone totals - combine them with
    // currentDelta so Best Case is never worse and Worst Case never better than today.
    const bestCaseTotal = Number.isFinite(currentDelta) && Number.isFinite(maxExtraSavings)
      ? currentDelta - Math.abs(maxExtraSavings)
      : null;
    const worstCaseTotal = Number.isFinite(currentDelta) && Number.isFinite(maxPenaltyRisk)
      ? currentDelta + Math.abs(maxPenaltyRisk)
      : null;
    const bestCaseHeroValue = Number.isFinite(bestCaseTotal)
      ? `- ${formatNumber(Math.abs(bestCaseTotal), 2)} €`
      : texts.analysisPlaceholderValue;
    const worstCaseHeroValue = Number.isFinite(worstCaseTotal)
      ? `+ ${formatNumber(Math.abs(worstCaseTotal), 2)} €`
      : texts.analysisPlaceholderValue;
    const bestCaseDirection = Number.isFinite(bestCaseTotal) ? "positive" : "neutral";
    const worstCaseDirection = Number.isFinite(worstCaseTotal) ? "negative" : "neutral";
    const breakEvenFixed = this.latestData.break_even_fixed_ct_kwh;
    const breakEvenFixedCt = Number(breakEvenFixed);
    const fixedPriceCt = Number(this.latestData.fixed_price_ct);
    const fixedPriceLabel = Number.isFinite(fixedPriceCt)
      ? `${formatNumber(fixedPriceCt, 2)} ct/kWh`
      : "-";
    const breakEvenDeltaCt = Number.isFinite(breakEvenFixedCt) && Number.isFinite(fixedPriceCt)
      ? fixedPriceCt - breakEvenFixedCt
      : null;
    const breakEvenDeltaLabel = Number.isFinite(breakEvenDeltaCt)
      ? `${breakEvenDeltaCt >= 0 ? "+" : ""}${formatNumber(breakEvenDeltaCt, 2)} ct/kWh`
      : "-";
    const breakEvenCompareText = texts.kpiBreakEvenCompare({
      fixed: fixedPriceLabel,
      delta: breakEvenDeltaLabel,
    });
    const breakEvenHelpText = `${texts.kpiBreakEvenHelp} ${breakEvenCompareText}`;

    const completenessRatio = Number(this.latestData.data_completeness_ratio);
    const showLowCompletenessWarning = Number.isFinite(completenessRatio)
      && completenessRatio < LOW_DATA_COMPLETENESS_THRESHOLD;
    const lowCompletenessWarningHtml = showLowCompletenessWarning
      ? `<div class="hero-low-completeness-warning">${texts.analysisLowCompletenessWarning({
          percent: formatNumber(completenessRatio * 100, 0),
        })}</div>`
      : "";

    const bannerContainer = this.querySelector("#dynamicSavingsBanner");

    bannerContainer.innerHTML = `
      ${lowCompletenessWarningHtml}
      <div class="tariff-hero-grid" role="group" aria-label="${this.escapeAttribute(texts.analysisCurrentTariffBalanceTitle)}">
        <section class="tariff-hero-card tariff-hero-anchor ${currentDeltaDirection}" aria-label="${this.escapeAttribute(texts.analysisCurrentTariffBalanceTitle)}">
          <div class="tariff-hero-card-topline">
            <div class="tariff-hero-card-heading-wrap">
              <div class="tariff-hero-card-title">${texts.analysisCurrentTariffBalanceTitle}</div>
              <div class="tariff-hero-card-subtitle">${currentDeltaVerdict}</div>
            </div>
          </div>
          <div class="tariff-hero-anchor-main">
            <div class="tariff-hero-anchor-value ${currentDeltaDirection}">${currentDeltaLabel}</div>
          </div>
          <div class="tariff-hero-anchor-footer">
            <div class="tariff-hero-footer-item">
              <span>${texts.analysisStatusQuoFixedProjectionLabel}</span>
              <strong>${formatNumber(costFixEur, 2)} €</strong>
            </div>
            <div class="tariff-hero-footer-item">
              <span>${texts.analysisStatusQuoSpotProjectionLabel}</span>
              <strong>${formatNumber(costSpotEur, 2)} €</strong>
            </div>
          </div>
        </section>

        <section class="tariff-hero-card tariff-hero-potential">
          <div class="tariff-hero-card-topline">
            <div class="tariff-hero-card-heading-wrap">
              <div class="tariff-hero-card-title">${texts.analysisBestCasePotentialTitle}</div>
              <div class="tariff-hero-card-subtitle">${texts.analysisBestCasePotentialSubtitle}</div>
            </div>
          </div>
          <div class="tariff-hero-compact-value ${bestCaseDirection}">${bestCaseHeroValue}</div>
        </section>

        <section class="tariff-hero-card tariff-hero-risk">
          <div class="tariff-hero-card-topline">
            <div class="tariff-hero-card-heading-wrap">
              <div class="tariff-hero-card-title">${texts.analysisWorstCaseRiskTitle}</div>
              <div class="tariff-hero-card-subtitle">${texts.analysisWorstCaseRiskSubtitle}</div>
            </div>
          </div>
          <div class="tariff-hero-compact-value ${worstCaseDirection}">${worstCaseHeroValue}</div>
        </section>
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

    const renderedMonths = months
      .slice()
      .sort((a, b) => Number(a.month || 0) - Number(b.month || 0));

    if (renderedMonths.length === 0) {
      return `
        <div class="monthly-tariff-panel">
          <div class="monthly-tariff-title">${texts.monthlyTariffTitle}</div>
          <div class="monthly-tariff-info">${texts.monthlyTariffInfo}</div>
          <div class="monthly-tariff-empty">${texts.monthlyTariffNoData}</div>
        </div>
      `;
    }

    const thresholdEur = 0.15;
    const maxAbs = Math.max(0.01, ...renderedMonths.map((item) => Math.abs(Number(item.delta_eur || 0))));

    const cells = renderedMonths
      .map((item) => {
        const monthIndex = Math.max(1, Math.min(12, Number(item.month || 1))) - 1;
        const delta = Number(item.delta_eur || 0);
        const matchedHours = Number(item.matched_hours || 0);
        const monthDays = new Date(2026, monthIndex + 1, 0).getDate();
        const matchedDays = Math.max(0, Math.round(matchedHours / 24));
        const availabilityLabel = `${matchedDays}/${monthDays}`;
        const intensity = Math.min(1, Math.abs(delta) / maxAbs);
        const hasData = matchedDays > 0;
        const badgeClass = !hasData
          ? "none"
          : matchedDays >= monthDays
            ? "full"
            : "partial";
        const badgeIcon = !hasData
          ? "⚠"
          : matchedDays >= monthDays
            ? "✓"
            : "⚠";

        let cellClass = "neutral";
        if (!hasData) {
          cellClass = "nodata";
        } else if (delta > thresholdEur) {
          cellClass = "extra";
        } else if (delta < -thresholdEur) {
          cellClass = "savings";
        }

        const centerValue = !hasData
          ? `${formatNumber(0, 2)} €`
          : `${delta > 0 ? "+" : ""}${formatNumber(delta, 2)} €`;

        return `
          <div class="monthly-cell-card ${cellClass}" title="${monthLabels[monthIndex]} | ${texts.monthlyTariffTooltipHours}: ${formatNumber(matchedHours, 0)}" style="--intensity:${intensity.toFixed(3)}">
            <div class="monthly-cell-badge ${badgeClass}"><span class="monthly-cell-badge-icon" aria-hidden="true">${badgeIcon}</span><span>${availabilityLabel}</span></div>
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
    const buildCard = (label, value, help) => `
      <div class="technical-metric-card">
        <div class="technical-metric-label">${label}<span class="metric-info-marker" role="img" tabindex="0" aria-label="${this.escapeAttribute(texts.kpiInfoLabel)}" title="${this.escapeAttribute(help)}"><ha-icon icon="mdi:information-outline"></ha-icon></span></div>
        <div class="technical-metric-value">${value}</div>
      </div>
    `;
    const buildGrid = (cls, items) => `
      <div class="${cls}">
        ${items.map((item) => buildCard(item.label, item.value, item.help || "")).join("")}
      </div>
    `;
    // Splits a rendered metric into a prominent numeric value and a muted unit
    // suffix (e.g. "3182.64" + "kWh") so the grid can be scanned quickly.
    const metricValue = (numberText, unit) => (
      unit
        ? `<span class="technical-metric-number">${numberText}</span><span class="technical-metric-unit">${unit}</span>`
        : `<span class="technical-metric-number">${numberText}</span>`
    );

    const matchedHours = Number(summary.matchedHours || 0);
    const hasMatchedTariffData = matchedHours > 0;
    const matchedDays = matchedHours > 0 ? matchedHours / 24 : 0;
    const roundedMatchedDays = Math.round(matchedDays);
    const completenessRatio = Number(summary.dataCompletenessRatio);
    const startEu = this.formatIsoDateEuropean(summary.start);
    const endEu = this.formatIsoDateEuropean(summary.end);
    const peakHourLabel = summary.peakHour !== null && summary.peakHour !== undefined
      ? `${String(summary.peakHour).padStart(2, "0")}:00`
      : "-";

    const placeholderValue = texts.analysisPlaceholderValue;
    const maxPeakValue = summary.maxPeak !== null && summary.maxPeak !== undefined
      ? metricValue(formatNumber(summary.maxPeak, 3), "kWh")
      : metricValue(placeholderValue, "");
    const baseLoadValue = summary.baseLoadP05 !== null && summary.baseLoadP05 !== undefined
      ? metricValue(formatNumber(summary.baseLoadP05, 3), "kWh")
      : metricValue(placeholderValue, "");
    const dailySpreadValue = summary.dailyPriceSpread !== null && summary.dailyPriceSpread !== undefined
      ? metricValue(formatNumber(summary.dailyPriceSpread, 2), "ct/kWh")
      : metricValue(placeholderValue, "");
    const breakEvenFixedValue = summary.breakEvenFixedCtKwh !== null && summary.breakEvenFixedCtKwh !== undefined
      ? metricValue(formatNumber(summary.breakEvenFixedCtKwh, 2), "ct/kWh")
      : metricValue(placeholderValue, "");
    const spotCheaperShare = Number(summary.spotCheaperShare);
    const spotCheaperValue = hasMatchedTariffData && Number.isFinite(spotCheaperShare)
      ? metricValue(formatNumber(spotCheaperShare * 100, 1), "%")
      : metricValue(placeholderValue, "");
    const negativePriceHours = Number(summary.negativePriceHours);
    const negativePriceShare = Number(summary.negativePriceShare);
    const negativePriceValue = hasMatchedTariffData
      ? metricValue(formatNumber(Number.isFinite(negativePriceHours) ? negativePriceHours : 0, 0), "h")
        + (Number.isFinite(negativePriceShare) ? ` <span class="technical-metric-unit">(${formatNumber(negativePriceShare * 100, 1)} %)</span>` : "")
      : metricValue(placeholderValue, "");
    const completenessValue = Number.isFinite(completenessRatio)
      ? metricValue(formatNumber(completenessRatio * 100, completenessRatio >= 0.9995 ? 0 : 1), "%")
      : metricValue(placeholderValue, "");
    const effectiveSpotValue = summary.effectiveSpotPrice !== null && summary.effectiveSpotPrice !== undefined
      ? metricValue(formatNumber(summary.effectiveSpotPrice, 2), "ct/kWh")
      : metricValue(placeholderValue, "");
    const maxSpotValue = summary.maxSpotPrice !== null && summary.maxSpotPrice !== undefined
      ? metricValue(formatNumber(summary.maxSpotPrice, 2), "ct/kWh")
      : metricValue(placeholderValue, "");
    const minSpotValue = summary.minSpotPrice !== null && summary.minSpotPrice !== undefined
      ? metricValue(formatNumber(summary.minSpotPrice, 2), "ct/kWh")
      : metricValue(placeholderValue, "");
    const maxSpotHelp = summary.maxSpotPriceAt
      ? `${texts.analysisMaxSpotPriceHelp} ${texts.analysisOccurredOnLabel}: ${this.formatDateTimeEuropean(summary.maxSpotPriceAt)}`
      : texts.analysisMaxSpotPriceHelp;
    const minSpotHelp = summary.minSpotPriceAt
      ? `${texts.analysisMinSpotPriceHelp} ${texts.analysisOccurredOnLabel}: ${this.formatDateTimeEuropean(summary.minSpotPriceAt)}`
      : texts.analysisMinSpotPriceHelp;
    const flexibilityPotential = Number(summary.flexibilityPotentialPercent);
    const peakExposure = Number(summary.peakExposurePercent);
    const offPeakShare = Number(summary.offPeakSharePercent);
    const flexibilityPotentialValue = Number.isFinite(flexibilityPotential)
      ? metricValue(formatNumber(flexibilityPotential, 1), "%")
      : metricValue(placeholderValue, "");
    const fixedTariffCost = Number(summary.fixedTariffCostEur);
    const spotTariffCost = Number(summary.spotTariffCostEur);
    const hasCostProjection = Number.isFinite(fixedTariffCost)
      && Number.isFinite(spotTariffCost)
      && Number.isFinite(summary.maxExtraSavingsEur)
      && Number.isFinite(summary.maxPenaltyRiskEur);
    const currentDelta = hasCostProjection ? (spotTariffCost - fixedTariffCost) : null;
    // maxExtraSavingsEur / maxPenaltyRiskEur are incremental load-shifting effects
    // on top of the status quo, not standalone totals - combine them with
    // currentDelta so Best Case is never worse and Worst Case never better than today.
    const maxSavingsDelta = hasCostProjection
      ? currentDelta - Math.max(0, Number(summary.maxExtraSavingsEur))
      : null;
    const maxRiskDelta = hasCostProjection
      ? currentDelta + Math.max(0, Number(summary.maxPenaltyRiskEur))
      : null;
    const currentDeltaLabel = Number.isFinite(currentDelta)
      ? `${formatNumber(Math.abs(currentDelta), 2)} €`
      : placeholderValue;
    const currentDeltaDirection = Number.isFinite(currentDelta)
      ? (currentDelta > 0 ? "risk" : currentDelta < 0 ? "savings" : "neutral")
      : "neutral";
    const currentDeltaVerdict = currentDeltaDirection === "risk"
      ? texts.analysisStatusQuoSpotHigherLabel
      : currentDeltaDirection === "savings"
        ? texts.analysisStatusQuoFixedHigherLabel
        : texts.analysisStatusQuoBalancedLabel;

    let deltaExtent = 1;
    let maxSavingsPct = 0;
    let maxRiskPct = 100;
    let currentPct = 50;
    let currentLeftPct = 50;
    let currentWidthPct = 0;
    let currentLabelClass = "savings";
    const axisEdgePaddingPx = 6;
    let currentMarkerPct = 50;

    if (hasCostProjection) {
      deltaExtent = Math.max(
        Math.abs(maxSavingsDelta),
        Math.abs(maxRiskDelta),
        Math.abs(currentDelta),
        0.01
      );
      const deltaToPct = (value) => 50 + (value / deltaExtent) * 50;
      maxSavingsPct = Math.max(0, Math.min(100, deltaToPct(maxSavingsDelta)));
      maxRiskPct = Math.max(0, Math.min(100, deltaToPct(maxRiskDelta)));
      currentPct = Math.max(0, Math.min(100, deltaToPct(currentDelta)));
      currentMarkerPct = Math.max(0, Math.min(100, currentPct));
      currentLeftPct = Math.min(50, Math.max(0, currentMarkerPct));
      currentWidthPct = Math.abs(currentMarkerPct - 50);
      currentLabelClass = currentDelta <= 0 ? "savings" : "risk";
    }

    const hasTimingProfile = Number.isFinite(peakExposure) && Number.isFinite(offPeakShare);
    let expensiveShare = 0;
    let averageShare = 0;
    let cheapShare = 0;
    if (hasTimingProfile) {
      expensiveShare = Math.max(0, peakExposure);
      cheapShare = Math.max(0, offPeakShare);
      const edgeSum = expensiveShare + cheapShare;
      if (edgeSum > 100) {
        const scale = 100 / edgeSum;
        expensiveShare *= scale;
        cheapShare *= scale;
        averageShare = 0;
      } else {
        averageShare = 100 - edgeSum;
      }
    }

    const cheapShareValue = hasTimingProfile
      ? metricValue(formatNumber(cheapShare, 1), "%")
      : metricValue(placeholderValue, "");
    const expensiveShareValue = hasTimingProfile
      ? metricValue(formatNumber(expensiveShare, 1), "%")
      : metricValue(placeholderValue, "");
    const averageShareValue = hasTimingProfile
      ? metricValue(formatNumber(averageShare, 1), "%")
      : metricValue(placeholderValue, "");

    const periodItems = [
      { label: texts.analysisRangeLabel, value: metricValue(`${startEu} - ${endEu}`, ""), help: texts.analysisRangeHelp },
      { label: texts.analysisDaysLabel, value: metricValue(formatNumber(roundedMatchedDays, 0), ""), help: texts.analysisDaysHelp },
      { label: texts.analysisHoursLabel, value: metricValue(formatNumber(matchedHours, 0), ""), help: texts.analysisHoursHelp },
      { label: texts.analysisDataCompletenessLabel, value: completenessValue, help: texts.analysisDataCompletenessHelp }
    ];

    const consumptionItems = [
      { label: texts.analysisTotalLabel, value: metricValue(formatNumber(summary.totalConsumption || 0, 2), "kWh"), help: texts.analysisTotalHelp },
      { label: texts.analysisAvgDayLabel, value: metricValue(formatNumber(summary.avgPerDay || 0, 2), "kWh"), help: texts.analysisAvgDayHelp },
      { label: texts.analysisAvgHourLabel, value: metricValue(formatNumber(summary.avgPerHour || 0, 3), "kWh"), help: texts.analysisAvgHourHelp },
      { label: texts.analysisWeekdayAvgLabel, value: metricValue(formatNumber(summary.weekdayAvg || 0, 3), "kWh"), help: texts.analysisWeekdayAvgHelp },
      { label: texts.analysisWeekendAvgLabel, value: metricValue(formatNumber(summary.weekendAvg || 0, 3), "kWh"), help: texts.analysisWeekendAvgHelp },
      { label: texts.analysisPeakHourLabel, value: metricValue(peakHourLabel, ""), help: texts.analysisPeakHourHelp },
      { label: texts.analysisMaxPeakLabel, value: maxPeakValue, help: texts.analysisMaxPeakHelp },
      { label: texts.analysisBaseLoadLabel, value: baseLoadValue, help: texts.analysisBaseLoadHelp }
    ];

    const priceItems = [
      { label: texts.analysisAvgSpotLabel, value: metricValue(summary.avgPrice, "ct/kWh"), help: texts.analysisAvgSpotHelp },
      { label: texts.analysisEffectiveSpotLabel, value: effectiveSpotValue, help: texts.analysisEffectiveSpotHelp },
      { label: texts.analysisNegativePriceHoursLabel, value: negativePriceValue, help: texts.analysisNegativePriceHoursHelp },
      { label: texts.analysisSpotCheaperLabel, value: spotCheaperValue, help: texts.analysisSpotCheaperHelp },
      { label: texts.analysisMaxSpotPriceLabel, value: maxSpotValue, help: maxSpotHelp },
      { label: texts.analysisMinSpotPriceLabel, value: minSpotValue, help: minSpotHelp },
      { label: texts.analysisDailySpreadLabel, value: dailySpreadValue, help: texts.analysisDailySpreadHelp },
      { label: texts.analysisSpotStdDevLabel, value: breakEvenFixedValue, help: texts.analysisSpotStdDevHelp }
    ];

    const fixedRateAssumedValue = summary.fixedPriceCt !== null && summary.fixedPriceCt !== undefined
      ? metricValue(formatNumber(summary.fixedPriceCt, 2), "ct/kWh")
      : metricValue(placeholderValue, "");
    const fixedBaseFeeValue = summary.fixedBaseFeeEur !== null && summary.fixedBaseFeeEur !== undefined
      ? metricValue(formatNumber(summary.fixedBaseFeeEur, 2), "€ / month")
      : metricValue(placeholderValue, "");
    const dynamicMarkupValue = summary.spotMarkupCt !== null && summary.spotMarkupCt !== undefined
      ? metricValue(formatNumber(summary.spotMarkupCt, 2), "ct/kWh")
      : metricValue(placeholderValue, "");
    const dynamicBaseFeeValue = summary.spotBaseFeeEur !== null && summary.spotBaseFeeEur !== undefined
      ? metricValue(formatNumber(summary.spotBaseFeeEur, 2), "€ / month")
      : metricValue(placeholderValue, "");

    const parameterItems = [
      { label: texts.analysisFixedRateAssumedLabel, value: fixedRateAssumedValue, help: texts.analysisFixedRateAssumedHelp },
      { label: texts.analysisFixedBaseFeeLabel, value: fixedBaseFeeValue, help: texts.analysisFixedBaseFeeHelp },
      { label: texts.analysisDynamicMarkupLabel, value: dynamicMarkupValue, help: texts.analysisDynamicMarkupHelp },
      { label: texts.analysisDynamicBaseFeeLabel, value: dynamicBaseFeeValue, help: texts.analysisDynamicBaseFeeHelp }
    ];

    const profileItems = [
      { label: texts.analysisFlexibilityPotentialLabel, value: flexibilityPotentialValue, help: texts.analysisFlexibilityPotentialHelp },
      { label: texts.analysisTimingCheapLabel, value: cheapShareValue, help: texts.analysisTimingProfileHelp },
      { label: texts.analysisTimingExpensiveLabel, value: expensiveShareValue, help: texts.analysisTimingProfileHelp },
      { label: texts.analysisTimingAverageLabel, value: averageShareValue, help: texts.analysisTimingProfileHelp }
    ];

    return {
      technical: `
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

      <section class="technical-section">
        <div class="technical-section-title">${texts.analysisSectionParametersTitle}</div>
        ${buildGrid("technical-grid-main", parameterItems)}
      </section>
    `,
      risk: `
      <section class="technical-section risk-visual-section">
        <div class="technical-section-title">
          ${texts.analysisCostProjectionTitle}
          <span class="metric-info-marker" role="img" tabindex="0" aria-label="${this.escapeAttribute(texts.kpiInfoLabel)}" title="${this.escapeAttribute(texts.analysisCostProjectionHelp)}"><ha-icon icon="mdi:information-outline"></ha-icon></span>
        </div>
        <div class="risk-chart-card projection-chart-card" role="img" aria-label="${this.escapeAttribute(texts.analysisCostProjectionTitle)}">
          ${hasCostProjection ? `
            <div class="delta-axis">
              <div class="delta-bg savings" style="left:calc(${maxSavingsPct.toFixed(2)}% + ${axisEdgePaddingPx}px); width:calc(${Math.max(0, 50 - maxSavingsPct).toFixed(2)}% - ${axisEdgePaddingPx}px)"></div>
              <div class="delta-bg risk" style="left:50%; width:calc(${Math.max(0, maxRiskPct - 50).toFixed(2)}% - ${axisEdgePaddingPx}px)"></div>
              <div class="delta-baseline" title="${texts.analysisCostProjectionBaselineLabel}"></div>
              <div class="delta-current ${currentLabelClass}" style="left:${currentLeftPct.toFixed(2)}%; width:${currentWidthPct.toFixed(2)}%"></div>
              <div class="delta-marker ${currentLabelClass}" style="left:${currentMarkerPct.toFixed(2)}%">
                <div class="delta-marker-callout">
                  <span>${texts.analysisCostProjectionCurrentLabel}</span>
                  <strong>${currentDeltaLabel}</strong>
                </div>
                <div class="delta-marker-line" aria-hidden="true"></div>
                <div class="delta-marker-dot" aria-hidden="true"></div>
              </div>
            </div>
            <div class="delta-label-row">
              <div class="delta-end left">
                <span>${texts.analysisCostProjectionBestLabel}</span>
                <strong>${maxSavingsDelta <= 0 ? "-" : "+"}${formatNumber(Math.abs(maxSavingsDelta), 2)} €</strong>
              </div>
              <div class="delta-end right">
                <span>${texts.analysisCostProjectionWorstLabel}</span>
                <strong>${maxRiskDelta >= 0 ? "+" : "-"}${formatNumber(Math.abs(maxRiskDelta), 2)} €</strong>
              </div>
            </div>
            <div class="delta-baseline-caption">${texts.analysisCostProjectionBaselineLabel}</div>
          ` : `
            <div class="risk-empty">${placeholderValue}</div>
          `}
        </div>
      </section>

      <section class="technical-section">
        <div class="technical-section-title">${texts.analysisTimingProfileTitle}</div>
        ${buildGrid("technical-grid-risk", profileItems)}
      </section>
    `,
      taxNote,
    };
  }

  loadUiState() {
    this._uiStateLoaded = true;
    this._sourcePanelOpen = true;
    try {
      const raw = localStorage.getItem("sei_ui_state");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this._storedSource = parsed.activeSource || null;
      this._heatmapSeason = parsed.heatmapSeason || "whole_year";
      this._consumptionMode = parsed.consumptionMode || "absolute";
      if (this._consumptionMode !== "absolute" && this._consumptionMode !== "relative_mean") {
        this._consumptionMode = "absolute";
      }
      this._spotPriceMode = parsed.spotPriceMode || "absolute";
      if (this._spotPriceMode !== "absolute" && this._spotPriceMode !== "fixed") {
        this._spotPriceMode = "absolute";
      }
      this._optimizationMode = parsed.optimizationMode || "shift_score";
      this._dashboardTab = parsed.dashboardTab || "monthly";
      this._analysisOpen = Boolean(parsed.analysisOpen);
      this._sourcePanelOpen = parsed.sourcePanelOpen !== undefined ? Boolean(parsed.sourcePanelOpen) : true;
      this._selectedSensor = parsed.selectedSensor || this._selectedSensor;
      this._selectedConsumptionProfile = parsed.selectedConsumptionProfile || "total";
    } catch (err) {
      console.warn("Failed to load UI state", err);
    }
  }

  saveUiState() {
    try {
      const payload = {
        activeSource: this._activeSource,
        heatmapSeason: this._heatmapSeason || "whole_year",
        consumptionMode: (this._consumptionMode === "relative_mean" ? "relative_mean" : "absolute"),
        spotPriceMode: (this._spotPriceMode === "fixed" ? "fixed" : "absolute"),
        optimizationMode: this._optimizationMode || "shift_score",
        dashboardTab: this._dashboardTab || "monthly",
        analysisOpen: Boolean(this._analysisOpen),
        sourcePanelOpen: this._sourcePanelOpen !== false,
        selectedSensor: this._selectedSensor || null,
        selectedConsumptionProfile: this._selectedConsumptionProfile || "total"
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

      .source-card { margin: 24px 24px 0; border-radius: 12px; overflow: clip; background: color-mix(in srgb, var(--card-background-color) 90%, black 10%); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28); }
      .source-chooser-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 18px 20px; }
      .source-chooser-title { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .source-chooser-desc { font-size: 12px; color: var(--secondary-text-color); }
      .source-header-actions { display: inline-flex; align-items: center; gap: 10px; }
      .source-selector-buttons { display: inline-flex; border: 1px solid var(--divider-color); border-radius: 999px; overflow: hidden; background: var(--secondary-background-color); }
      .source-switch { padding: 6px 14px; border: none; background: transparent; color: var(--primary-text-color); cursor: pointer; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
      .source-switch.active { background: var(--primary-color); color: white; }
      .source-card-summary { cursor: pointer; list-style: none; user-select: none; }
      .source-card-summary::-webkit-details-marker { display: none; }
      .source-card-summary-hint { font-size: 11px; color: var(--secondary-text-color); letter-spacing: 0.2px; white-space: nowrap; }
      .source-card-summary-hint.open { display: none; }
      .source-card[open] .source-card-summary-hint.closed { display: none; }
      .source-card[open] .source-card-summary-hint.open { display: inline; }
      .source-card-summary-icon { position: relative; width: 14px; height: 14px; flex: 0 0 auto; color: var(--secondary-text-color); transition: transform 0.2s ease, color 0.2s ease; }
      .source-card-summary-icon::before { content: ""; position: absolute; inset: 0; margin: auto; width: 8px; height: 8px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); }
      .source-card[open] .source-card-summary-icon { transform: translateY(2px); color: var(--primary-color); }
      .source-card[open] .source-card-summary-icon::before { transform: rotate(225deg); }
      .source-card-summary:hover .source-chooser-title,
      .source-card-summary:focus-visible .source-chooser-title,
      .source-card-summary:hover .source-card-summary-hint,
      .source-card-summary:focus-visible .source-card-summary-hint { color: var(--primary-text-color); }
      .source-card-summary:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }

      .upload-card { width: 100%; max-width: 1200px; margin: 0 auto; height: fit-content; }
      .source-content { padding: 20px; display: grid; gap: 16px; }
      .source-section { background: rgba(var(--rgb-primary-text-color), 0.02); border-radius: 10px; padding: 16px 20px; }
      .source-section-header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
      .source-section-title { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .source-section-desc { font-size: 12px; color: var(--secondary-text-color); }
      .monitored-devices-section { margin-top: 0; }
      .device-prerequisite, .devices-empty { color: var(--secondary-text-color); font-size: 12px; padding: 8px 0; }
      .monitored-devices-list { display: grid; gap: 8px; }
      .monitored-device-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 14px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); }
      .monitored-device-fields { display: grid; gap: 3px; min-width: 0; }
      .monitored-device-entity { overflow: hidden; color: var(--secondary-text-color); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .monitored-device-actions { display: flex; gap: 4px; }
      .device-icon-button { width: 44px; height: 44px; padding: 10px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--divider-color); border-radius: 8px; background: transparent; color: var(--primary-text-color); cursor: pointer; box-sizing: border-box; transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
      .device-icon-button:hover { border-color: var(--primary-color); color: var(--primary-color); }
      .device-icon-button.danger:hover, .device-icon-button.danger:focus-visible { border-color: var(--error-color); color: var(--error-color); background: rgba(244, 67, 54, 0.12); }
      .device-icon-button ha-icon { --mdc-icon-size: 18px; }
      .device-editor { display: grid; gap: 8px; margin-top: 10px; padding: 14px; border: 1px solid var(--divider-color); border-radius: 6px; }
      .device-editor[hidden], #monitoredDevicesContent[hidden], #monitoredDevicesPrerequisite[hidden] { display: none; }
      .device-name-input { width: 100%; min-width: 0; box-sizing: border-box; padding: 10px 14px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 14px; }
      .section-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
      .sensor-picker { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
      .sensor-label { font-size: 13px; color: var(--secondary-text-color); }
      .sensor-select { width: 100%; padding: 10px 14px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 14px; box-sizing: border-box; }
      ha-entity-picker.sensor-select { --mdc-shape-small: 6px; --text-field-padding: 0 14px; }
      .sensor-select:disabled { opacity: 0.6; cursor: not-allowed; }
      .sensor-message { margin-top: 10px; font-size: 13px; padding: 8px 12px; border-radius: 6px; background: rgba(var(--rgb-primary-text-color), 0.04); }
      .sensor-message.loading { opacity: 0.8; }
      .sensor-message.info { color: var(--secondary-text-color); background: rgba(var(--rgb-primary-text-color), 0.04); }
      .sensor-message.error { color: #f44336; background: rgba(244, 67, 54, 0.08); }
      .sensor-message.success { color: #4caf50; background: rgba(76, 175, 80, 0.08); }
      
      /* Dashboard Wrapper */
      .dashboard-wrapper { padding: 24px; }
      .source-toggle-text-btn { border: none; background: transparent; color: var(--primary-color); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.45px; cursor: pointer; padding: 0; }
      .source-toggle-text-btn:hover { color: var(--primary-text-color); }

      .top-dashboard-grid { margin-bottom: 24px; }
      .banner-column { display: flex; flex-direction: column; gap: 16px; }
      .tariff-hero-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: stretch; }
      .tariff-hero-card { box-sizing: border-box; min-width: 0; border: 1px solid rgba(var(--rgb-divider-color), 0.5); border-radius: 16px; background: linear-gradient(180deg, rgba(var(--rgb-primary-text-color), 0.04), rgba(var(--rgb-primary-text-color), 0.02)); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16); padding: 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; height: 100%; overflow: hidden; }
      .tariff-hero-anchor { grid-row: 1 / span 2; background: linear-gradient(180deg, rgba(var(--rgb-primary-text-color), 0.05), rgba(var(--rgb-primary-text-color), 0.025)); }
      .tariff-hero-potential { border-color: rgba(76, 175, 80, 0.28); background: linear-gradient(180deg, rgba(76, 175, 80, 0.12), rgba(var(--rgb-primary-text-color), 0.03)); }
      .tariff-hero-risk { border-color: rgba(244, 67, 54, 0.28); background: linear-gradient(180deg, rgba(244, 67, 54, 0.12), rgba(var(--rgb-primary-text-color), 0.03)); }
      .tariff-hero-card-topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .tariff-hero-card-heading-wrap { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .tariff-hero-card-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.9px; color: var(--secondary-text-color); font-weight: 700; }
      .tariff-hero-card-subtitle { font-size: 13px; line-height: 1.35; color: var(--secondary-text-color); max-width: 28ch; }
      .tariff-hero-card-badge { flex: 0 0 auto; align-self: flex-start; padding: 5px 9px; border-radius: 999px; border: 1px solid rgba(var(--rgb-divider-color), 0.55); background: rgba(var(--rgb-primary-text-color), 0.06); color: var(--secondary-text-color); font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; }
      .tariff-hero-card-badge.positive { color: #63c07b; border-color: rgba(99, 192, 123, 0.34); background: rgba(99, 192, 123, 0.12); }
      .tariff-hero-card-badge.negative { color: #e08a78; border-color: rgba(224, 138, 120, 0.34); background: rgba(224, 138, 120, 0.12); }
      .tariff-hero-card-badge.risk { color: #e08a78; }
      .tariff-hero-card-badge.savings { color: #63c07b; }
      .tariff-hero-anchor-main { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
      .tariff-hero-anchor-value { font-size: clamp(30px, 3.6vw, 44px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; color: var(--primary-text-color); }
      .tariff-hero-anchor-value.risk { color: #f1a08b; }
      .tariff-hero-anchor-value.savings { color: #73d19a; }
      .tariff-hero-anchor-value.neutral { color: var(--primary-text-color); }
      .tariff-hero-anchor-unit { font-size: 12px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--secondary-text-color); font-weight: 700; }
      .tariff-hero-anchor-footer { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .tariff-hero-footer-item { border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 12px; background: rgba(var(--rgb-primary-text-color), 0.04); padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .tariff-hero-footer-item span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.45px; color: var(--secondary-text-color); font-weight: 700; }
      .tariff-hero-footer-item strong { font-size: 16px; line-height: 1.2; color: var(--primary-text-color); font-weight: 800; }
      .tariff-hero-compact-value { font-size: clamp(26px, 3vw, 38px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; }
      .tariff-hero-compact-value.positive { color: #73d19a; }
      .tariff-hero-compact-value.negative { color: #f1a08b; }
      .tariff-hero-compact-value.neutral { color: var(--primary-text-color); }
      .savings-hero-card { border: 1px solid rgba(var(--rgb-divider-color), 0.25); border-left: 4px solid; border-radius: 0 8px 8px 0; padding: 20px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; }
      .savings-hero-head { display: flex; align-items: center; gap: 18px; }
      .savings-hero-icon { font-size: 42px; line-height: 1; }
      .savings-hero-main { display: flex; flex-direction: column; gap: 4px; }
      .savings-hero-title { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: var(--secondary-text-color); font-weight: 700; }
      .savings-hero-value { font-size: 32px; font-weight: 700; color: var(--primary-text-color); line-height: 1.1; }
      .savings-hero-message { font-size: 14px; color: var(--secondary-text-color); line-height: 1.5; }
      .kpi-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 4px; }
      .kpi-card { background: rgba(var(--rgb-primary-text-color), 0.04); border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; justify-content: center; gap: 10px; min-height: 88px; }
      .kpi-simple-title { font-size: 11px; letter-spacing: 0.45px; text-transform: uppercase; color: var(--secondary-text-color); font-weight: 700; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .kpi-simple-value { font-size: 18px; line-height: 1.2; color: var(--primary-text-color); font-weight: 700; }
      .kpi-info-marker { width: 16px; height: 16px; min-width: 16px; border-radius: 50%; color: var(--secondary-text-color); display: inline-flex; align-items: center; justify-content: center; cursor: help; opacity: 0.82; }
      .kpi-info-marker ha-icon { --mdc-icon-size: 14px; }
      .kpi-info-marker:hover, .kpi-info-marker:focus-visible { color: var(--primary-color); opacity: 1; outline: none; }
      .analysis-island { margin-top: 0; padding: 0; border-radius: 12px; background: color-mix(in srgb, var(--card-background-color) 90%, black 10%); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.26); overflow: clip; }
      .analysis-island[open] { padding-bottom: 4px; }
      .analysis-island-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; cursor: pointer; list-style: none; user-select: none; }
      .analysis-island-summary::-webkit-details-marker { display: none; }
      .analysis-island-summary-text { font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; }
      .analysis-island-summary-hint { margin-left: auto; font-size: 11px; color: var(--secondary-text-color); letter-spacing: 0.2px; white-space: nowrap; }
      .analysis-island-summary-hint.open { display: none; }
      .analysis-island[open] .analysis-island-summary-hint.closed { display: none; }
      .analysis-island[open] .analysis-island-summary-hint.open { display: inline; }
      .analysis-island-summary-icon { position: relative; width: 14px; height: 14px; flex: 0 0 auto; color: var(--secondary-text-color); transition: transform 0.2s ease, color 0.2s ease; }
      .analysis-island-summary-icon::before { content: ""; position: absolute; inset: 0; margin: auto; width: 8px; height: 8px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); }
      .analysis-island[open] .analysis-island-summary-icon { transform: translateY(2px); color: var(--primary-color); }
      .analysis-island[open] .analysis-island-summary-icon::before { transform: rotate(225deg); }
      .analysis-island-summary:hover .analysis-island-summary-text,
      .analysis-island-summary:hover .analysis-island-summary-text,
      .analysis-island-summary:focus-visible .analysis-island-summary-text,
      .analysis-island-summary:hover .analysis-island-summary-hint,
      .analysis-island-summary:focus-visible .analysis-island-summary-hint { color: var(--primary-text-color); }
      .analysis-island-summary:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
      .analysis-island > .dashboard-tabs { padding: 0 16px 16px; }
      .dashboard-tabs { margin-top: 0; }
      .dashboard-tab-navigation { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
      .dashboard-tab-button { min-height: 40px; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 8px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 13px; font-weight: 600; cursor: pointer; }
      .dashboard-tab-button:hover { border-color: var(--primary-color); }
      .dashboard-tab-button.active { background: var(--primary-color); border-color: var(--primary-color); color: white; }
      .dashboard-tab-panel[hidden] { display: none; }
      .technical-cockpit-wrap { border: 1px solid rgba(var(--rgb-divider-color), 0.6); border-radius: 10px; background: rgba(var(--rgb-primary-text-color), 0.02); padding: 14px; }
      .technical-cockpit-wrap h3 { margin: 0 0 12px 0; color: var(--primary-text-color); font-size: 15px; font-weight: 600; }
      .analysis-groups { display: flex; flex-direction: column; gap: 12px; }
      .technical-section { border: 1px solid rgba(var(--rgb-divider-color), 0.5); border-radius: 10px; background: rgba(var(--rgb-primary-text-color), 0.02); padding: 12px; }
      .technical-section-title { margin-bottom: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: var(--secondary-text-color); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .technical-grid-range { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .technical-grid-risk { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .technical-grid-main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .technical-metric-card { border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 8px; background: rgba(var(--rgb-primary-text-color), 0.03); padding: 9px 10px; min-height: 60px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
      .technical-metric-label { font-size: 11px; color: var(--secondary-text-color); letter-spacing: 0.25px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .technical-metric-value { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px; line-height: 1.2; }
      .technical-metric-number { font-size: 18px; font-weight: 700; color: var(--primary-text-color); }
      .technical-metric-unit { font-size: 12px; font-weight: 400; color: var(--secondary-text-color); }
      .metric-info-marker { width: 16px; height: 16px; min-width: 16px; border-radius: 50%; color: var(--secondary-text-color); display: inline-flex; align-items: center; justify-content: center; cursor: help; opacity: 0.82; }
      .metric-info-marker ha-icon { --mdc-icon-size: 14px; }
      .metric-info-marker:hover, .metric-info-marker:focus-visible { color: var(--primary-color); opacity: 1; outline: none; }
      .risk-chart-card { border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 8px; background: rgba(var(--rgb-primary-text-color), 0.03); padding: 10px; }
      .projection-chart-card { position: relative; padding-top: 56px; padding-bottom: 14px; overflow: visible; }
      .projection-chart-card .delta-axis { margin-top: 0; }
      .projection-chart-card .delta-label-row { margin-top: 8px; }
      .delta-baseline-caption { font-size: 11px; color: var(--secondary-text-color); text-align: center; margin-top: 8px; }
      .risk-empty { font-size: 16px; color: var(--secondary-text-color); min-height: 42px; display: flex; align-items: center; }

      .delta-axis { position: relative; height: 30px; border-radius: 999px; background: rgba(var(--rgb-primary-text-color), 0.08); overflow: visible; margin-top: 2px; }
      .delta-bg { position: absolute; top: 6px; bottom: 6px; border-radius: 999px; opacity: 0.5; }
      .delta-bg.savings { background: linear-gradient(90deg, rgba(78, 168, 112, 0.8), rgba(101, 195, 136, 0.9)); border-top-right-radius: 0; border-bottom-right-radius: 0; }
      .delta-bg.risk { background: linear-gradient(90deg, rgba(197, 112, 80, 0.9), rgba(160, 74, 52, 0.9)); border-top-left-radius: 0; border-bottom-left-radius: 0; }
      .delta-baseline { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; transform: translateX(-1px); background: rgba(255, 255, 255, 0.9); z-index: 3; }
      .delta-current { position: absolute; top: 8px; bottom: 8px; border-radius: 0; z-index: 4; }
      .delta-current.savings { background: linear-gradient(90deg, rgba(43, 139, 83, 0.95), rgba(84, 188, 126, 0.98)); }
      .delta-current.risk { background: linear-gradient(90deg, rgba(207, 102, 71, 0.95), rgba(170, 70, 50, 0.98)); }
      .delta-marker { position: absolute; top: 0; bottom: 0; width: 0; transform: translateX(-50%); z-index: 8; pointer-events: none; }
      .delta-marker-line { position: absolute; left: 50%; top: 4px; bottom: 4px; width: 2px; background: #f8fbff; transform: translateX(-1px); box-shadow: 0 0 0 1px rgba(18, 26, 34, 0.26); }
      .delta-marker-dot { position: absolute; left: 50%; top: -4px; width: 10px; height: 10px; background: #f8fbff; border: 2px solid #2a3640; transform: translateX(-50%) rotate(45deg); border-radius: 2px; }
      .delta-marker-callout { position: absolute; left: 50%; top: -8px; transform: translate(-50%, -100%); display: grid; gap: 1px; padding: 4px 8px; border-radius: 7px; background: rgba(18, 24, 32, 0.92); border: 1px solid rgba(var(--rgb-divider-color), 0.5); box-shadow: 0 6px 14px rgba(0, 0, 0, 0.28); z-index: 9; }
      .delta-marker-callout span { font-size: 10px; letter-spacing: 0.2px; color: var(--secondary-text-color); white-space: nowrap; }
      .delta-marker-callout strong { font-size: 12px; font-weight: 700; white-space: nowrap; }
      .delta-marker.savings .delta-marker-callout strong { color: #74d19a; }
      .delta-marker.risk .delta-marker-callout strong { color: #ea9b7f; }
      .delta-label-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 6px; }
      .delta-end { font-size: 11px; color: var(--secondary-text-color); }
      .delta-end strong { display: block; margin-top: 1px; color: var(--primary-text-color); font-size: 12px; }
      .delta-end.left { text-align: left; }
      .delta-end.right { text-align: right; }

      .tariff-fit-card { border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 10px; padding: 14px; background: rgba(var(--rgb-primary-text-color), 0.03); display: grid; gap: 12px; }
      .tariff-fit-verdict { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: center; }
      .tariff-fit-icon { width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
      .tariff-fit-icon ha-icon { --mdc-icon-size: 24px; }
      .tariff-fit-card.high .tariff-fit-icon { color: #66c68f; background: rgba(72, 167, 113, 0.18); }
      .tariff-fit-card.medium .tariff-fit-icon { color: #d4a356; background: rgba(212, 163, 86, 0.18); }
      .tariff-fit-card.low .tariff-fit-icon { color: #d07a5e; background: rgba(208, 122, 94, 0.18); }
      .tariff-fit-headline { font-size: 17px; font-weight: 700; color: var(--primary-text-color); line-height: 1.2; }
      .tariff-fit-level { font-size: 19px; margin-left: 6px; }
      .tariff-fit-level.high { color: #72d39a; }
      .tariff-fit-level.medium { color: #dfb46b; }
      .tariff-fit-level.low { color: #e19074; }
      .tariff-fit-summary { margin-top: 6px; font-size: 13px; color: var(--secondary-text-color); line-height: 1.45; }
      .tariff-fit-divider { border-top: 1px solid rgba(var(--rgb-divider-color), 0.5); margin-top: 2px; }
      .tariff-fit-factors-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--secondary-text-color); margin-bottom: 8px; }
      .tariff-fit-factors-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .tariff-fit-factor { border: 1px solid rgba(var(--rgb-divider-color), 0.4); border-radius: 8px; padding: 10px; background: rgba(var(--rgb-primary-text-color), 0.025); }
      .tariff-fit-factor-indicator { width: 22px; height: 22px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 8px; }
      .tariff-fit-factor-indicator ha-icon { --mdc-icon-size: 14px; }
      .tariff-fit-factor.positive .tariff-fit-factor-indicator { color: #66c68f; background: rgba(73, 165, 112, 0.2); }
      .tariff-fit-factor.negative .tariff-fit-factor-indicator { color: #de8a6f; background: rgba(192, 98, 70, 0.2); }
      .tariff-fit-factor.neutral .tariff-fit-factor-indicator { color: var(--secondary-text-color); background: rgba(var(--rgb-primary-text-color), 0.12); }
      .tariff-fit-factor-value { font-size: 20px; font-weight: 700; color: var(--primary-text-color); line-height: 1.1; }
      .tariff-fit-factor-label { font-size: 12px; color: var(--secondary-text-color); margin-top: 4px; line-height: 1.35; }
      
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
      .seasonal-heatmaps-card { background: rgba(var(--rgb-primary-text-color), 0.025); border: 1px solid rgba(var(--rgb-divider-color), 0.5); border-radius: 12px; padding: 12px; display: grid; gap: 18px; }
      .heatmap-context-card { background: rgba(var(--rgb-primary-text-color), 0.025); border: 1px solid rgba(var(--rgb-divider-color), 0.5); border-radius: 12px; padding: 12px; margin-bottom: 18px; }
      .heatmap-context-meta { display: grid; gap: 6px; }
      .heatmap-context-line { font-size: 12px; color: var(--secondary-text-color); line-height: 1.4; }
      .heatmap-coverage-warning { font-size: 12px; line-height: 1.4; color: #8f4a00; background: rgba(255, 171, 64, 0.16); border: 1px solid rgba(255, 171, 64, 0.32); border-radius: 8px; padding: 6px 8px; }
      .hero-low-completeness-warning { font-size: 13px; line-height: 1.4; color: #8f4a00; background: rgba(255, 171, 64, 0.16); border: 1px solid rgba(255, 171, 64, 0.32); border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
      .heatmap-season-navigation { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
      .consumption-profile-control { display: grid; grid-template-columns: auto minmax(180px, 320px); justify-content: end; align-items: center; gap: 10px; margin-bottom: 12px; }
      .consumption-profile-control label { color: var(--secondary-text-color); font-size: 12px; font-weight: 600; }
      .consumption-profile-select { width: 100%; padding: 8px 10px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 13px; }
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
      .spot-mode-buttons,
      .optimization-mode-buttons { display: inline-flex; border: 1px solid var(--divider-color); border-radius: 999px; overflow: hidden; background: var(--secondary-background-color); }
      .consumption-mode-button,
      .spot-mode-button,
      .optimization-mode-button { min-height: 34px; padding: 6px 12px; border: none; background: transparent; color: var(--primary-text-color); font-size: 12px; cursor: pointer; }
      .consumption-mode-button.active,
      .spot-mode-button.active,
      .optimization-mode-button.active { background: var(--primary-color); color: white; }
      .spot-mode-button:disabled { opacity: 0.45; cursor: not-allowed; }
      .heatmaps-grid { display: grid; grid-template-columns: 1fr; gap: 32px; }
      @media(min-width: 1300px) { .heatmaps-grid { grid-template-columns: 1fr 1fr; } }
      
      .heatmap-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .heatmap-title-row { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
      .heatmap-title { font-size: 15px; font-weight: 600; text-align: left; color: var(--primary-text-color); }
      .heatmap-info-marker { flex: 0 0 auto; margin-top: 1px; }
      .heatmap-season-card { background: rgba(var(--rgb-primary-text-color), 0.025); border: 1px solid rgba(var(--rgb-divider-color), 0.5); border-radius: 12px; padding: 12px; display: grid; gap: 18px; }
      .heatmap-legend { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 11px; color: var(--secondary-text-color); margin: 10px 0 0; flex-wrap: wrap; text-align: center; }
      .heatmap-legend-bar { width: 120px; height: 8px; border-radius: 999px; background: linear-gradient(90deg, hsl(120, 85%, 55%), hsl(0, 85%, 55%)); }
      .heatmap-legend-value { font-size: 11px; color: var(--secondary-text-color); }
      .heatmap-grid { display: grid; grid-template-columns: minmax(0, auto) repeat(24, minmax(0, 1fr)); gap: 2px; font-size: 10px; min-width: 0; }
      .heatmap-header-y { display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; color: var(--secondary-text-color); font-weight: 500; min-width: 0; overflow: hidden; }
      .heatmap-header-x { min-width: 0; overflow: hidden; text-align: center; color: var(--secondary-text-color); padding-bottom: 4px; }
      .heatmap-cell { min-width: 0; aspect-ratio: 1; border-radius: 2px; cursor: crosshair; transition: transform 0.1s; }
      .heatmap-cell:hover { transform: scale(1.2); box-shadow: 0 0 4px rgba(0,0,0,0.3); z-index: 2; position: relative; }
      .monthly-tariff-panel { background: linear-gradient(160deg, rgba(var(--rgb-primary-text-color), 0.02), rgba(var(--rgb-primary-text-color), 0.04)); border: 1px solid rgba(var(--rgb-divider-color), 0.6); border-radius: 10px; padding: 14px; }
      .monthly-tariff-title { font-size: 15px; font-weight: 600; color: var(--primary-text-color); margin-bottom: 10px; }
      .monthly-tariff-info { font-size: 12px; color: var(--secondary-text-color); line-height: 1.45; margin: -2px 0 12px; background: rgba(var(--rgb-primary-text-color), 0.03); border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 8px; padding: 8px 10px; }
      .monthly-tariff-empty { font-size: 13px; color: var(--secondary-text-color); padding: 8px 4px; }
      .monthly-tariff-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      @media(min-width: 900px) { .monthly-tariff-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media(min-width: 1300px) { .monthly-tariff-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      .monthly-cell-card { position: relative; border: 1px solid rgba(var(--rgb-divider-color), 0.45); border-radius: 10px; padding: 16px 10px 10px; min-height: 84px; display: grid; grid-template-rows: auto 1fr; align-items: center; justify-items: center; text-align: center; gap: 8px; }
      .monthly-cell-card.savings { background: color-mix(in srgb, #c9ebd9 calc(78% + var(--intensity) * 20%), rgba(var(--rgb-card-background-color), 0.9)); border-color: rgba(49, 122, 78, 0.35); }
      .monthly-cell-card.neutral { background: color-mix(in srgb, #ece0b8 calc(78% + var(--intensity) * 20%), rgba(var(--rgb-card-background-color), 0.9)); border-color: rgba(143, 122, 38, 0.35); }
      .monthly-cell-card.extra { background: color-mix(in srgb, #efcbc8 calc(78% + var(--intensity) * 20%), rgba(var(--rgb-card-background-color), 0.9)); border-color: rgba(155, 59, 59, 0.35); }
      .monthly-cell-card.nodata { background: color-mix(in srgb, #ece0b8 78%, rgba(var(--rgb-card-background-color), 0.9)); border-color: rgba(155, 122, 31, 0.35); }
      .monthly-cell-badge { position: absolute; top: 8px; right: 8px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border-radius: 999px; font-size: 10px; line-height: 1; font-weight: 700; letter-spacing: 0.15px; background: rgba(var(--rgb-primary-text-color), 0.08); color: var(--secondary-text-color); }
      .monthly-cell-badge-icon { font-size: 11px; line-height: 1; }
      .monthly-cell-badge.full { color: #2f7a4d; background: rgba(47, 122, 77, 0.14); }
      .monthly-cell-badge.partial { color: #9b7a1f; background: rgba(155, 122, 31, 0.16); }
      .monthly-cell-badge.none { color: #9b7a1f; background: rgba(155, 122, 31, 0.16); }
      .monthly-cell-head { font-size: 12px; font-weight: 800; letter-spacing: 0.45px; text-transform: uppercase; color: #2d3640; padding: 2px 8px; border-radius: 999px; background: rgba(45, 54, 64, 0.12); }
      .monthly-cell-center { font-size: 15px; font-weight: 700; text-align: center; color: var(--primary-text-color); letter-spacing: 0.1px; display: flex; align-items: center; justify-content: center; min-height: 28px; }
      .monthly-cell-card.savings .monthly-cell-head { color: #225a3d; background: rgba(34, 90, 61, 0.12); }
      .monthly-cell-card.neutral .monthly-cell-head { color: #7f6721; background: rgba(127, 103, 33, 0.14); }
      .monthly-cell-card.extra .monthly-cell-head { color: #893737; background: rgba(137, 55, 55, 0.12); }
      .monthly-cell-card.nodata .monthly-cell-head { color: #7f6721; background: rgba(127, 103, 33, 0.14); }
      .monthly-cell-card.savings .monthly-cell-center { color: #317a4e; }
      .monthly-cell-card.neutral .monthly-cell-center { color: #8f7a26; }
      .monthly-cell-card.extra .monthly-cell-center { color: #9b3b3b; }
      .monthly-cell-card.nodata .monthly-cell-center { color: #8f7a26; }
      .card-tax-note { margin: 0 0 20px; padding: 12px 4px 0; border-top: 1px solid var(--divider-color); color: var(--secondary-text-color); text-align: center; font-size: 12px; opacity: 0.9; }

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
        .source-chooser-header { align-items: flex-start; flex-direction: column; }
        .source-header-actions { width: 100%; justify-content: space-between; }
        .tariff-hero-grid { grid-template-columns: 1fr; grid-template-rows: auto; }
        .tariff-hero-anchor { grid-row: auto; }
        .tariff-hero-card { padding: 14px; gap: 10px; }
        .tariff-hero-card-topline { gap: 8px; }
        .tariff-hero-card-title { font-size: 12px; letter-spacing: 0.7px; }
        .tariff-hero-card-subtitle { max-width: none; font-size: 12px; }
        .tariff-hero-anchor-value { font-size: 30px; }
        .tariff-hero-compact-value { font-size: 24px; }
        .tariff-hero-anchor-footer { grid-template-columns: 1fr; }
        .tariff-hero-card-badge { align-self: flex-start; }
        .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .dashboard-tab-navigation { grid-template-columns: 1fr; }
        .analysis-island-summary { padding: 14px; }
        .analysis-island-summary-hint { font-size: 10px; }
        .analysis-island > .dashboard-tabs { padding: 0 14px 14px; }
        .technical-grid-range { grid-template-columns: 1fr; }
        .technical-grid-risk { grid-template-columns: 1fr; }
        .technical-grid-main { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .delta-label-row { flex-direction: column; gap: 4px; }
        .delta-end.right { text-align: left; }
        .delta-marker-callout { transform: translate(-50%, -112%); }
        .projection-chart-card { padding-top: 60px; padding-bottom: 12px; }
        .projection-chart-card .delta-label-row { margin-top: 8px; }
        .tariff-fit-verdict { grid-template-columns: 1fr; }
        .tariff-fit-factors-grid { grid-template-columns: 1fr; }
        .heatmap-season-navigation { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .consumption-profile-control { grid-template-columns: 1fr; justify-content: stretch; }
        .heatmap-season-button:last-child { grid-column: span 2; }
        .heatmap-subcard { padding: 12px; }
        .consumption-mode-buttons,
        .spot-mode-buttons,
        .optimization-mode-buttons { width: 100%; display: grid; grid-template-columns: 1fr; border-radius: 8px; }
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