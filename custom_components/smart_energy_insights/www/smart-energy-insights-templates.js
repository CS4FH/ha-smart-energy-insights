export function renderBaseCard(title, texts) {
  return `
    <ha-card id="mainCard" class="upload-card">
      <div class="card-header" id="defaultHeader">
        <div class="title">${title}</div>
      </div>

      <div class="source-chooser" id="sourceSelector">
        <div class="source-chooser-header">
          <div class="source-chooser-title">${texts.sourceTitle}</div>
          <div class="source-selector-buttons">
            <button id="sourceCsvSwitch" class="source-switch" data-source="csv">${texts.sourceCsv}</button>
            <button id="sourceSensorSwitch" class="source-switch" data-source="sensor">${texts.sourceSensor}</button>
          </div>
        </div>
        <div class="source-chooser-desc">${texts.sourceDescription}</div>
      </div>

      <div class="card-content" id="sourceContent">
        <div class="source-section" id="csvSection">
          <div class="source-section-header">
            <div class="source-section-title">${texts.sourceCsvTitle}</div>
            <div class="source-section-desc">${texts.sourceCsvDescription}</div>
          </div>
          <div class="upload-container" id="uploadContent">
            <div class="dropzone" id="dropzone">
              <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v16M7 7l5-5 5 5M2 20h20"/>
              </svg>
              <h3 id="uploadTitle">${texts.uploadTitle}</h3>
              <p>${texts.uploadPrompt} <button class="file-picker-btn" id="filePickerBtn">${texts.uploadFileSelect}</button></p>
              <input type="file" id="fileInput" accept=".csv" style="display: none;" />
            </div>
            <div class="file-info" id="fileInfo" style="display: none;">
              <p><strong>${texts.fileLabel}</strong> <span id="fileName"></span></p>
            </div>
            <div class="progress-container" id="progressContainer" style="display: none;">
              <div class="progress-bar" id="progressBar"></div>
              <p id="progressText">${texts.uploadingLabel}</p>
            </div>
            <div class="response-message" id="responseMessage" style="display: none;"></div>
            <div class="section-actions">
              <button id="uploadBtn" class="upload-button" style="display: none;">${texts.uploadButton}</button>
              <button id="cancelBtn" class="cancel-button" style="display: none;">${texts.cancelButton}</button>
            </div>
          </div>
        </div>

        <div class="source-section" id="sensorSection">
          <div class="source-section-header">
            <div class="source-section-title">${texts.sourceSensorTitle}</div>
            <div class="source-section-desc">${texts.sourceSensorDescription}</div>
          </div>
          <div class="sensor-picker">
            <label class="sensor-label" for="sensorPicker">${texts.sensorPickerLabel}</label>
            <ha-entity-picker id="sensorPicker" class="sensor-select"></ha-entity-picker>
          </div>
          <div class="sensor-hint" id="sensorHint">${texts.sensorHint}</div>
          <div class="section-actions">
            <button id="sensorLoadBtn" class="upload-button">${texts.sensorLoadButton}</button>
          </div>
          <div class="sensor-message" id="sensorMessage" style="display: none;"></div>
        </div>
      </div>

      <div id="dashboardContainer"></div>
    </ha-card>
  `;
}

export function renderDashboardHtml({
  filename,
  profileTitle,
  profileMeta,
  heatmapsHtml,
  analysisGroups,
  initialFix,
  initialFixBase,
  initialMarkup,
  initialSpotBase,
  initialTax,
  initialTaxChecked,
  texts,
  rangePreset,
  rangeFrom,
  rangeTo,
  rangeWeek,
  rangeMonth,
  rangeQuarter,
  rangeQuarterYear,
  availableStart,
  availableEnd
}) {
  const showCustom = rangePreset === "custom";
  const showWeek = rangePreset === "week";
  const showMonth = rangePreset === "month";
  const showQuarter = rangePreset === "quarter";

  return `
    <div class="dashboard-wrapper">
      <div class="profile-header">
        <div class="profile-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <div class="profile-info">
          <h2>${profileTitle} <span>${filename}</span></h2>
          <p>${profileMeta}</p>
        </div>
        <div class="profile-range">
          <div class="range-title">${texts.dateRangeLabel}</div>
          <div class="range-field">
            <label for="rangePreset">${texts.dateRangeModeLabel}</label>
            <select id="rangePreset">
              <option value="total" ${rangePreset === "total" ? "selected" : ""}>${texts.dateRangeModeTotal}</option>
              <option value="custom" ${showCustom ? "selected" : ""}>${texts.dateRangeModeCustom}</option>
              <option value="quarter" ${showQuarter ? "selected" : ""}>${texts.dateRangeModeQuarter}</option>
              <option value="month" ${showMonth ? "selected" : ""}>${texts.dateRangeModeMonth}</option>
              <option value="week" ${showWeek ? "selected" : ""}>${texts.dateRangeModeWeek}</option>
            </select>
          </div>
          <div class="range-fields">
            <div class="range-field range-picker" id="rangeCustomPicker" style="display: ${showCustom ? "grid" : "none"};">
              <label for="rangeFrom">${texts.dateRangeFrom}</label>
              <input type="date" id="rangeFrom" value="${rangeFrom || ""}" min="${availableStart || ""}" max="${availableEnd || ""}">
              <label for="rangeTo">${texts.dateRangeTo}</label>
              <input type="date" id="rangeTo" value="${rangeTo || ""}" min="${availableStart || ""}" max="${availableEnd || ""}">
            </div>
            <div class="range-field range-picker" id="rangeWeekPicker" style="display: ${showWeek ? "flex" : "none"};">
              <label for="rangeWeek">${texts.dateRangeWeekLabel}</label>
              <input type="week" id="rangeWeek" value="${rangeWeek || ""}">
            </div>
            <div class="range-field range-picker" id="rangeMonthPicker" style="display: ${showMonth ? "flex" : "none"};">
              <label for="rangeMonth">${texts.dateRangeMonthLabel}</label>
              <input type="month" id="rangeMonth" value="${rangeMonth || ""}">
            </div>
            <div class="range-field range-picker" id="rangeQuarterPicker" style="display: ${showQuarter ? "flex" : "none"};">
              <label>${texts.dateRangeQuarterLabel}</label>
              <div class="range-quarter-fields">
                <input type="number" id="rangeQuarterYear" min="1970" max="2100" step="1" placeholder="YYYY" value="${rangeQuarterYear ? String(rangeQuarterYear) : ""}">
                <select id="rangeQuarter">
                  <option value="1" ${String(rangeQuarter || "1") === "1" ? "selected" : ""}>${texts.dateRangeQuarterQ1}</option>
                  <option value="2" ${String(rangeQuarter || "1") === "2" ? "selected" : ""}>${texts.dateRangeQuarterQ2}</option>
                  <option value="3" ${String(rangeQuarter || "1") === "3" ? "selected" : ""}>${texts.dateRangeQuarterQ3}</option>
                  <option value="4" ${String(rangeQuarter || "1") === "4" ? "selected" : ""}>${texts.dateRangeQuarterQ4}</option>
                </select>
              </div>
            </div>
          </div>
          <div class="range-actions">
            <button id="applyRangeBtn">${texts.dateRangeApply}</button>
            <button id="resetRangeBtn">${texts.dateRangeReset}</button>
          </div>
          <div class="range-message" id="rangeMessage" style="display: none;"></div>
        </div>
      </div>

      <div class="top-dashboard-grid">
        <div class="banner-column" id="dynamicSavingsBanner"></div>

        <div class="interactive-settings">
          <h4>⚙️ ${texts.tariffSimTitle}</h4>

          <div class="tax-toggle">
            <label class="checkbox-container">
              <input type="checkbox" id="chkTax" ${initialTaxChecked ? "checked" : ""}>
              <span class="checkmark"></span>
              <span><strong>${texts.taxNetLabel}</strong> ${texts.taxNetHint}</span>
            </label>
            <div class="tax-input-group">
              <label>${texts.taxLabel}</label>
              <input type="number" id="inputTaxRate" min="0" max="100" step="0.1" value="${initialTax}">
            </div>
          </div>

          <div class="inputs-container">
            <div class="input-box">
              <div class="input-box-title">${texts.fixedTariffTitle}</div>
              <div class="input-group">
                <label>${texts.fixedPriceLabel}</label>
                <input type="number" id="inputFix" min="0" step="0.1" value="${initialFix}">
              </div>
              <div class="input-group">
                <label>${texts.fixedBaseLabel}</label>
                <input type="number" id="inputFixBase" min="0" step="0.01" value="${initialFixBase}">
              </div>
            </div>

            <div class="input-box">
              <div class="input-box-title">${texts.spotTariffTitle}</div>
              <div class="input-group">
                <label>${texts.spotMarkupLabel}</label>
                <input type="number" id="inputMarkup" min="0" step="0.1" value="${initialMarkup}">
              </div>
              <div class="input-group">
                <label>${texts.spotBaseLabel}</label>
                <input type="number" id="inputSpotBase" min="0" step="0.01" value="${initialSpotBase}">
              </div>
            </div>
          </div>
          <div class="disclaimer">
            <em>${texts.disclaimer}</em>
          </div>
          <div class="tariff-actions">
            <button id="applyTariffBtn" class="primary-button">${texts.tariffApplyButton}</button>
            <button id="resetTariffBtn" class="secondary-button">${texts.tariffResetButton}</button>
          </div>
        </div>
      </div>

      <div class="info-box">
        <h3>📊 ${texts.analysisTitle}</h3>
        <div class="analysis-groups">
          ${analysisGroups}
        </div>
      </div>

      <div class="heatmaps-grid">
        ${heatmapsHtml}
      </div>
    </div>
  `;
}
