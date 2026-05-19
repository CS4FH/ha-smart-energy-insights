/**
 * Smart Energy Insights - Load Profile CSV Upload Card
 * 
 * Provides a Lovelace custom card for uploading historical load profile CSV data
 * to the Smart Energy Insights integration.
 * 
 * Usage in Lovelace configuration.yaml:
 * 
 * resources:
 *   - url: /smart_energy_insights/smart-energy-insights-card.js
 *     type: module
 * 
 * cards:
 *   - type: custom:smart-energy-insights-upload-card
 *     title: Upload Load Profiles
 *     obis_code: "1.8.0"
 */

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
  this._hass = hass;
  }

  render() {
    const title = this.config?.title || "Load Profile Upload";
    const obisCode = this.config?.obis_code || "1.8.0";

    this.innerHTML = `
      <ha-card>
        <div class="card-header">
          <div class="title">${title}</div>
        </div>
        <div class="card-content">
          <div class="upload-container">
            <div class="dropzone" id="dropzone">
              <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v16M7 7l5-5 5 5M2 20h20"/>
              </svg>
              <h3>Drag CSV files here</h3>
              <p>or <button class="file-picker-btn" id="filePickerBtn">select files</button></p>
              <input type="file" id="fileInput" accept=".csv" style="display: none;" />
            </div>

            <div class="file-info" id="fileInfo" style="display: none;">
              <p><strong>File:</strong> <span id="fileName"></span></p>
              <p><strong>OBIS Code:</strong> ${obisCode}</p>
            </div>

            <div class="progress-container" id="progressContainer" style="display: none;">
              <div class="progress-bar" id="progressBar"></div>
              <p id="progressText">Uploading: 0%</p>
            </div>

            <div class="response-message" id="responseMessage"></div>
          </div>
        </div>
        <div class="card-actions">
          <button id="uploadBtn" class="upload-button" style="display: none;">Upload</button>
          <button id="cancelBtn" class="cancel-button" style="display: none;">Cancel</button>
        </div>
      </ha-card>
    `;

    this.attachEventListeners(obisCode);
    this.applyStyles();
  }

  attachEventListeners(obisCode) {
    const dropzone = this.querySelector("#dropzone");
    const fileInput = this.querySelector("#fileInput");
    const filePickerBtn = this.querySelector("#filePickerBtn");
    const uploadBtn = this.querySelector("#uploadBtn");
    const cancelBtn = this.querySelector("#cancelBtn");

    // File picker button
    filePickerBtn.addEventListener("click", () => fileInput.click());

    // File input change
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        this.handleFileSelected(e.target.files[0], obisCode);
      }
    });

    // Drag and drop
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("drag-over");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) {
        this.handleFileSelected(e.dataTransfer.files[0], obisCode);
      }
    });

    // Upload button
    uploadBtn.addEventListener("click", () => {
      this.uploadFile(obisCode);
    });

    // Cancel button
    cancelBtn.addEventListener("click", () => {
      this.resetUI();
    });
  }

  handleFileSelected(file, obisCode) {
    if (!file.name.endsWith(".csv")) {
      this.showErrorMessage("Please select a CSV file");
      return;
    }

    this.selectedFile = file;
    const fileInfo = this.querySelector("#fileInfo");
    this.querySelector("#fileName").textContent = file.name;
    fileInfo.style.display = "block";

    this.querySelector("#uploadBtn").style.display = "inline-block";
    this.querySelector("#cancelBtn").style.display = "inline-block";
    this.querySelector("#responseMessage").textContent = "";
  }

  async uploadFile(obisCode) {
    if (!this.selectedFile) {
      return;
    }

    const uploadBtn = this.querySelector("#uploadBtn");
    const cancelBtn = this.querySelector("#cancelBtn");
    const progressContainer = this.querySelector("#progressContainer");

    uploadBtn.disabled = true;
    cancelBtn.disabled = true;
    progressContainer.style.display = "block";

    const formData = new FormData();
    formData.append("file", this.selectedFile);
    formData.append("obis_code", obisCode);

    try {
      if (!this._hass) {
        throw new Error("Home Assistant instance not found");
      }

      // Wir nutzen natives fetch() anstatt hass.callApi, um den multipart/form-data Header nicht zu zerstören
      const response = await fetch("/api/smart_energy_insights/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this._hass.auth.data.access_token}`
          // WICHTIG: Setze hier NIEMALS manuell den "Content-Type"! 
          // Der Browser generiert bei FormData automatisch den richtigen "multipart/form-data" Header inkl. Boundary.
        },
        body: formData
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
      }

      this.showSuccessMessage(responseData);
      this.resetUI();
    } catch (error) {
      this.showErrorMessage(`Error: ${error.message}`);
      uploadBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  }

  async getAuthToken() {
    return "";
  }

  updateProgress(percent) {
    const progressBar = this.querySelector("#progressBar");
    const progressText = this.querySelector("#progressText");
    progressBar.style.width = percent + "%";
    progressText.textContent = `Uploading: ${Math.round(percent)}%`;
  }

  showSuccessMessage(response) {
    const message = this.querySelector("#responseMessage");
    const count = response.count || 0;
    const start = response.start || "N/A";
    const end = response.end || "N/A";
    const avgConsumption = this.formatNumber(response.avg_consumption_kwh, 3);
    const avgPrice = this.formatNumber(response.avg_price_ct_kwh, 3);
    const priceImported = response.price_imported_count ?? 0;
    message.className = "response-message success";
    message.innerHTML = `
      <div class="success-icon">✓</div>
      <p><strong>Upload Successful!</strong></p>
      <p>${count} consumption records imported</p>
      <p>Average consumption: ${avgConsumption} kWh</p>
      <p>Average spot price: ${avgPrice} ct/kWh</p>
      <p>${priceImported} spot price records imported</p>
      <p><small>Period: ${start} to ${end}</small></p>
    `;
  }

  showErrorMessage(error) {
    const message = this.querySelector("#responseMessage");
    message.className = "response-message error";
    message.innerHTML = `
      <div class="error-icon">✗</div>
      <p><strong>Upload Failed</strong></p>
      <p>${error}</p>
    `;
  }

  resetUI() {
    this.querySelector("#uploadBtn").style.display = "none";
    this.querySelector("#cancelBtn").style.display = "none";
    this.querySelector("#fileInfo").style.display = "none";
    this.querySelector("#progressContainer").style.display = "none";
    this.querySelector("#fileInput").value = "";
    this.selectedFile = null;
    this.updateProgress(0);
  }

  formatNumber(value, decimals) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return "N/A";
    }
    return num.toFixed(decimals);
  }

  applyStyles() {
    const style = document.createElement("style");
    style.textContent = `
      ha-card {
        box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1));
        border-radius: var(--ha-card-border-radius, 8px);
      }

      .card-header {
        padding: 16px;
        border-bottom: 1px solid var(--divider-color);
      }

      .title {
        font-size: 18px;
        font-weight: 500;
        color: var(--primary-text-color);
      }

      .card-content {
        padding: 16px;
      }

      .upload-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .dropzone {
        border: 2px dashed var(--divider-color);
        border-radius: 8px;
        padding: 32px 16px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        background-color: var(--secondary-background-color);
      }

      .dropzone:hover,
      .dropzone.drag-over {
        border-color: var(--primary-color);
        background-color: rgba(var(--rgb-primary-color), 0.05);
      }

      .upload-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 16px;
        color: var(--primary-color);
        opacity: 0.6;
      }

      .dropzone h3 {
        margin: 0 0 8px;
        color: var(--primary-text-color);
      }

      .dropzone p {
        margin: 0;
        color: var(--secondary-text-color);
        font-size: 14px;
      }

      .file-picker-btn {
        background: none;
        border: none;
        color: var(--primary-color);
        cursor: pointer;
        text-decoration: underline;
        font-size: inherit;
        padding: 0;
      }

      .file-picker-btn:hover {
        opacity: 0.8;
      }

      .file-info {
        padding: 12px;
        background-color: var(--secondary-background-color);
        border-radius: 4px;
        border-left: 3px solid var(--primary-color);
      }

      .file-info p {
        margin: 4px 0;
        font-size: 14px;
      }

      .progress-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .progress-bar {
        width: 0%;
        height: 4px;
        background-color: var(--primary-color);
        border-radius: 2px;
        transition: width 0.2s ease;
      }

      #progressText {
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .response-message {
        padding: 16px;
        border-radius: 4px;
        text-align: center;
      }

      .response-message p {
        margin: 4px 0;
      }

      .response-message.success {
        background-color: rgba(76, 175, 80, 0.1);
        border-left: 3px solid #4caf50;
      }

      .response-message.error {
        background-color: rgba(244, 67, 54, 0.1);
        border-left: 3px solid #f44336;
      }

      .success-icon {
        font-size: 24px;
        color: #4caf50;
        margin-bottom: 8px;
      }

      .error-icon {
        font-size: 24px;
        color: #f44336;
        margin-bottom: 8px;
      }

      .card-actions {
        padding: 8px 16px 16px;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .upload-button,
      .cancel-button {
        padding: 8px 16px;
        border-radius: 4px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .upload-button {
        background-color: var(--primary-color);
        color: white;
      }

      .upload-button:hover:not(:disabled) {
        opacity: 0.9;
      }

      .upload-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .cancel-button {
        background-color: var(--secondary-background-color);
        color: var(--primary-text-color);
      }

      .cancel-button:hover:not(:disabled) {
        background-color: var(--divider-color);
      }

      .cancel-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
    this.appendChild(style);
  }

  static getConfigElement() {
    // Return null for now - editor configuration is optional
    return null;
  }

  static getStubConfig() {
    return {
      title: "Load Profile Upload",
      obis_code: "1.8.0",
    };
  }
}

// Register the card (guard against double-define on reloads)
try {
  if (!customElements.get("smart-energy-insights-upload-card")) {
    customElements.define(
      "smart-energy-insights-upload-card",
      SmartEnergyInsightsUploadCard
    );
  }
} catch (err) {
  if (!(err && String(err).includes("already been used"))) {
    throw err;
  }
}

// Register the card as a custom card
window.customCards = window.customCards || [];
window.customCards.push({
  type: "smart-energy-insights-upload-card",
  name: "Smart Energy Insights - Upload Card",
  description: "Upload load profile CSV files to Smart Energy Insights integration",
});

console.log(
  "Smart Energy Insights Upload Card loaded successfully"
);
