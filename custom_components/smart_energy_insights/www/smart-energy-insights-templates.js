export function renderBaseCard(texts) {
  return `
    <ha-card id="mainCard" class="upload-card">
      <div class="source-card" id="sourceSelector">
        <div class="source-chooser-header">
          <div>
            <div class="source-chooser-title">${texts.sourceTitle}</div>
            <div class="source-chooser-desc">${texts.sourceDescription}</div>
          </div>
          <div class="source-header-actions">
            <div class="source-selector-buttons" role="tablist">
              <button id="sourceSensorSwitch" class="source-switch" data-source="sensor" role="tab" aria-controls="sensorSection" aria-selected="false">${texts.sourceSensor}</button>
              <button id="sourceCsvSwitch" class="source-switch" data-source="csv" role="tab" aria-controls="csvSection" aria-selected="true">${texts.sourceCsv}</button>
            </div>
            <button id="integrationSettingsBtn" class="integration-settings-chip" title="${texts.integrationSettingsLabel}" aria-label="${texts.integrationSettingsLabel}">
              <ha-icon icon="mdi:cog"></ha-icon>
            </button>
          </div>
        </div>

        <div class="source-profile-summary" id="sourceProfileSummary">
          <div class="source-profile-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div class="source-profile-content">
            <div class="source-profile-label">${texts.profileTitle}</div>
            <div class="source-profile-name" id="profileSummaryName">-</div>
            <div class="source-profile-meta" id="profileSummaryMeta"></div>
            <div class="source-profile-state" id="sourceState">${texts.sourceStateLoading}</div>
          </div>
        </div>

        <div class="source-content" id="sourceContent">
        <div class="source-section" id="csvSection" role="tabpanel" aria-labelledby="sourceCsvSwitch">
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

        <div class="source-section" id="sensorSection" role="tabpanel" aria-labelledby="sourceSensorSwitch">
          <div class="source-section-header">
            <div class="source-section-title">${texts.sourceSensorTitle}</div>
            <div class="source-section-desc">${texts.sourceSensorDescription}</div>
          </div>
          <div class="sensor-picker">
            <label class="sensor-label" for="sensorPicker">${texts.sensorPickerLabel}</label>
            <ha-entity-picker id="sensorPicker" class="sensor-select"></ha-entity-picker>
          </div>
          <div class="section-actions">
            <button id="sensorLoadBtn" class="upload-button">${texts.sensorLoadButton}</button>
          </div>
          <div class="sensor-message" id="sensorMessage" style="display: none;"></div>
        </div>
        </div>
      </div>

      <div id="dashboardContainer"></div>
    </ha-card>
  `;
}

export function renderDashboardHtml({
  heatmapsHtml,
  monthlyTariffHtml,
  analysisGroups,
  texts,
  dashboardTab
}) {
  return `
    <div class="dashboard-wrapper">
      <div class="top-dashboard-grid">
        <div class="banner-column" id="dynamicSavingsBanner"></div>
      </div>

      <section class="dashboard-tabs" aria-label="Dashboard sections">
        <div class="dashboard-tab-navigation" role="tablist">
          <button class="dashboard-tab-button${dashboardTab === "monthly" ? " active" : ""}" data-dashboard-tab="monthly" role="tab" aria-selected="${String(dashboardTab === "monthly")}" aria-controls="dashboardTabMonthly">${texts.dashboardTabMonthly}</button>
          <button class="dashboard-tab-button${dashboardTab === "usage" ? " active" : ""}" data-dashboard-tab="usage" role="tab" aria-selected="${String(dashboardTab === "usage")}" aria-controls="dashboardTabUsage">${texts.dashboardTabUsage}</button>
          <button class="dashboard-tab-button${dashboardTab === "technical" ? " active" : ""}" data-dashboard-tab="technical" role="tab" aria-selected="${String(dashboardTab === "technical")}" aria-controls="dashboardTabTechnical">${texts.dashboardTabTechnical}</button>
        </div>

        <div id="dashboardTabMonthly" class="dashboard-tab-panel" data-dashboard-tab-panel="monthly" role="tabpanel"${dashboardTab === "monthly" ? "" : " hidden"}>
          ${monthlyTariffHtml}
        </div>

        <div id="dashboardTabUsage" class="dashboard-tab-panel" data-dashboard-tab-panel="usage" role="tabpanel"${dashboardTab === "usage" ? "" : " hidden"}>
          <div class="heatmap-area">
            ${heatmapsHtml}
          </div>
        </div>

        <div id="dashboardTabTechnical" class="dashboard-tab-panel" data-dashboard-tab-panel="technical" role="tabpanel"${dashboardTab === "technical" ? "" : " hidden"}>
          <div class="technical-cockpit-wrap">
            <h3>${texts.analysisTitle}</h3>
            <div class="analysis-groups">
              ${analysisGroups}
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}
