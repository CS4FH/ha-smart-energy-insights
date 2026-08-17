export function renderBaseCard(texts) {
  return `
    <ha-card id="mainCard" class="upload-card">
      <details class="source-card" id="sourceSelector" open>
        <summary class="source-chooser-header source-card-summary" aria-label="${texts.sourceTitle}">
          <div>
            <div class="source-chooser-title">${texts.sourceTitle}</div>
            <div class="source-chooser-desc">${texts.sourceDescription}</div>
          </div>
          <div class="source-header-actions">
            <div class="source-selector-buttons" role="tablist">
              <button id="sourceSensorSwitch" class="source-switch" data-source="sensor" role="tab" aria-controls="sensorSection" aria-selected="false" type="button">${texts.sourceSensor}</button>
              <button id="sourceCsvSwitch" class="source-switch" data-source="csv" role="tab" aria-controls="csvSection" aria-selected="true" type="button">${texts.sourceCsv}</button>
            </div>
            <button id="integrationSettingsBtn" class="integration-settings-chip" title="${texts.integrationSettingsLabel}" aria-label="${texts.integrationSettingsLabel}" type="button">
              <ha-icon icon="mdi:cog"></ha-icon>
            </button>
            <span class="source-card-summary-hint closed">${texts.sourceClosedHint}</span>
            <span class="source-card-summary-hint open">${texts.sourceOpenHint}</span>
            <span class="source-card-summary-icon" aria-hidden="true"></span>
          </div>
        </summary>

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
            <div class="source-section-title">${texts.consumptionSourcesTitle}</div>
            <div class="source-section-desc">${texts.consumptionSourcesDescription}</div>
          </div>
          <div id="consumptionSourcesList" class="monitored-devices-list"></div>
          <div id="consumptionSourceEditor" class="device-editor" hidden>
            <ha-entity-picker id="consumptionSourceSensorPicker" class="sensor-select"></ha-entity-picker>
            <div class="sensor-message info" id="consumptionSourceSensorMessage" style="display: none;"></div>
            <label class="sensor-label" for="consumptionSourceNameInput">${texts.consumptionSourceNameLabel}</label>
            <input id="consumptionSourceNameInput" class="device-name-input" type="text" maxlength="80" />
            <label class="consumption-source-cost-relevant" for="consumptionSourceCostRelevantInput">
              <input type="checkbox" id="consumptionSourceCostRelevantInput" />
              ${texts.consumptionSourceCostRelevantLabel}
            </label>
            <div class="sensor-hint">${texts.consumptionSourceCostRelevantHelp}</div>
            <div class="section-actions">
              <button id="cancelConsumptionSourceBtn" class="cancel-button" type="button">${texts.cancelButton}</button>
              <button id="saveConsumptionSourceBtn" class="upload-button" type="button">${texts.consumptionSourceSave}</button>
            </div>
          </div>
          <div id="consumptionSourceMessage" class="sensor-message" hidden></div>
          <div class="section-actions">
            <button id="addConsumptionSourceBtn" class="upload-button" type="button">${texts.consumptionSourceAdd}</button>
            <button id="consumptionSourcesRefreshBtn" class="cancel-button" type="button">${texts.consumptionSourcesRefresh}</button>
          </div>
          <div class="sensor-message" id="sensorMessage" style="display: none;"></div>
        </div>

        <div class="source-section monitored-devices-section" id="monitoredDevicesSection">
          <div class="source-section-header">
            <div class="source-section-title">${texts.devicesTitle}</div>
            <div class="source-section-desc">${texts.devicesDescription}</div>
          </div>
          <div id="monitoredDevicesPrerequisite" class="device-prerequisite">${texts.devicesRequiresProfile}</div>
          <div id="monitoredDevicesContent" hidden>
            <div id="monitoredDevicesList" class="monitored-devices-list"></div>
            <div id="deviceEditor" class="device-editor" hidden>
              <ha-entity-picker id="deviceSensorPicker" class="sensor-select"></ha-entity-picker>
              <div class="sensor-message info" id="deviceSensorMessage" style="display: none;"></div>
              <label class="sensor-label" for="deviceNameInput">${texts.deviceNameLabel}</label>
              <input id="deviceNameInput" class="device-name-input" type="text" maxlength="80" />
              <div class="section-actions">
                <button id="cancelDeviceBtn" class="cancel-button" type="button">${texts.cancelButton}</button>
                <button id="saveDeviceBtn" class="upload-button" type="button">${texts.deviceSave}</button>
              </div>
            </div>
            <div id="deviceMessage" class="sensor-message" hidden></div>
            <div class="section-actions">
              <button id="addDeviceBtn" class="upload-button" type="button">${texts.deviceAdd}</button>
            </div>
          </div>
        </div>
        </div>
      </details>

      <div id="dashboardContainer"></div>
    </ha-card>
  `;
}

export function renderDashboardHtml({
  heatmapsHtml,
  monthlyTariffHtml,
  technicalAnalysisGroups,
  riskOptimizationGroups,
  taxNote,
  texts,
  dashboardTab,
  analysisOpen
}) {
  return `
    <div class="dashboard-wrapper">
      <div class="top-dashboard-grid">
        <div class="banner-column" id="dynamicSavingsBanner"></div>
      </div>

      <div class="card-tax-note">${taxNote}</div>

      <details class="analysis-island"${analysisOpen ? " open" : ""}>
        <summary class="analysis-island-summary" aria-label="${texts.detailedAnalysisTitle}">
          <span class="analysis-island-summary-text">${texts.detailedAnalysisTitle}</span>
          <span class="analysis-island-summary-hint closed">${texts.analysisDetailedAnalysisClosedHint}</span>
          <span class="analysis-island-summary-hint open">${texts.analysisDetailedAnalysisOpenHint}</span>
          <span class="analysis-island-summary-icon" aria-hidden="true"></span>
        </summary>

        <section class="dashboard-tabs" aria-label="Dashboard sections">
          <div class="dashboard-tab-navigation" role="tablist">
            <button class="dashboard-tab-button${dashboardTab === "monthly" ? " active" : ""}" data-dashboard-tab="monthly" role="tab" aria-selected="${String(dashboardTab === "monthly")}" aria-controls="dashboardTabMonthly">${texts.dashboardTabMonthly}</button>
            <button class="dashboard-tab-button${dashboardTab === "usage" ? " active" : ""}" data-dashboard-tab="usage" role="tab" aria-selected="${String(dashboardTab === "usage")}" aria-controls="dashboardTabUsage">${texts.dashboardTabUsage}</button>
            <button class="dashboard-tab-button${dashboardTab === "risk" ? " active" : ""}" data-dashboard-tab="risk" role="tab" aria-selected="${String(dashboardTab === "risk")}" aria-controls="dashboardTabRisk">${texts.dashboardTabRisk}</button>
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

          <div id="dashboardTabRisk" class="dashboard-tab-panel" data-dashboard-tab-panel="risk" role="tabpanel"${dashboardTab === "risk" ? "" : " hidden"}>
            <div class="analysis-groups">
              ${riskOptimizationGroups}
            </div>
          </div>

          <div id="dashboardTabTechnical" class="dashboard-tab-panel" data-dashboard-tab-panel="technical" role="tabpanel"${dashboardTab === "technical" ? "" : " hidden"}>
            <div class="analysis-groups">
              ${technicalAnalysisGroups}
            </div>
          </div>
        </section>
      </details>
    </div>
  `;
}
