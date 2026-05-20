/**
 * Smart Energy Insights - Load Profile CSV Upload Card
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
    const isFirstLoad = !this._hass;
    this._hass = hass;
    
    // Sobald die Karte mit HA verbunden ist, holen wir die persistenten Daten aus dem Backend
    if (isFirstLoad) {
      this.loadHeatmapsFromBackend();
    }
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

            <div class="response-message" id="responseMessage" style="display: none;"></div>
          </div>
        </div>
        
        <div class="card-actions">
          <button id="uploadBtn" class="upload-button" style="display: none;">Upload</button>
          <button id="cancelBtn" class="cancel-button" style="display: none;">Cancel</button>
        </div>

        <div id="heatmapContainer"></div>
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

    filePickerBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        this.handleFileSelected(e.target.files[0], obisCode);
      }
    });

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

    uploadBtn.addEventListener("click", () => {
      this.uploadFile(obisCode);
    });

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
    this.querySelector("#responseMessage").style.display = "none";
  }

  async uploadFile(obisCode) {
    if (!this.selectedFile) return;

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

      const response = await fetch("/api/smart_energy_insights/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this._hass.auth.data.access_token}`
        },
        body: formData
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
      }

      this.showSuccessMessage(responseData);
      this.renderHeatmaps(responseData);
      this.resetUI();
      
    } catch (error) {
      this.showErrorMessage(`Error: ${error.message}`);
      uploadBtn.disabled = false;
      cancelBtn.disabled = false;
      progressContainer.style.display = "none";
    }
  }

  // --- NEU: Zieht die Heatmap-Daten direkt aus dem HA-Backend ---
  async loadHeatmapsFromBackend() {
    try {
      const response = await fetch("/api/smart_energy_insights/upload", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this._hass.auth.data.access_token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.success) {
          this.renderHeatmaps(data);
        }
      }
    } catch (e) {
      console.error("Failed to load persistent heatmaps", e);
    }
  }

  showSuccessMessage(response) {
    const message = this.querySelector("#responseMessage");
    const count = response.count || 0;
    
    message.style.display = "block";
    message.className = "response-message success";
    message.innerHTML = `
      <div class="success-icon">✓</div>
      <p><strong>Upload Erfolgreich!</strong></p>
      <p>${count} Werte wurden in die Datenbank importiert.</p>
    `;
  }

  showErrorMessage(error) {
    const message = this.querySelector("#responseMessage");
    message.style.display = "block";
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

  updateProgress(percent) {
    const progressBar = this.querySelector("#progressBar");
    const progressText = this.querySelector("#progressText");
    progressBar.style.width = percent + "%";
    progressText.textContent = `Uploading: ${Math.round(percent)}%`;
  }

  formatNumber(value, decimals) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "N/A";
    return num.toFixed(decimals);
  }

  renderHeatmaps(response) {
    const container = this.querySelector("#heatmapContainer");
    if (!container) return;

    let heatmapsHtml = '<div class="heatmaps-wrapper">';
    
    if (response.consumption_heatmap && response.consumption_heatmap.length > 0) {
      heatmapsHtml += this.generateHeatmapHTML(response.consumption_heatmap, "Ø Verbrauch pro Stunde (kWh)", "kWh", false);
    }
    
    if (response.price_heatmap && response.price_heatmap.length > 0) {
      heatmapsHtml += this.generateHeatmapHTML(response.price_heatmap, "Ø Spotpreis pro Stunde (ct/kWh)", "ct/kWh", false);
    }
    heatmapsHtml += '</div>';

    if (heatmapsHtml === '<div class="heatmaps-wrapper"></div>') {
      container.innerHTML = "";
      return;
    }

    const avgConsumption = this.formatNumber(response.avg_consumption_kwh, 3);
    const avgPrice = this.formatNumber(response.avg_price_ct_kwh, 3);
    const start = response.start ? response.start.split('T')[0] : 'N/A';
    const end = response.end ? response.end.split('T')[0] : 'N/A';

    container.innerHTML = `
      <div class="heatmap-section-container">
        <div class="info-box">
          <h3>📊 Analyse des Lastprofils</h3>
          <p>Zeitraum: <strong>${start} bis ${end}</strong> | Ø Verbrauch: <strong>${avgConsumption} kWh</strong> | Ø Spotpreis: <strong>${avgPrice} ct/kWh</strong></p>
          <hr class="info-divider" />
          <p class="info-text">
            <strong>Was du hier siehst:</strong><br/>
            Die oberen Heatmaps helfen dir, Muster in deinem Stromverbrauch zu erkennen. <br/>
            Die horizontale Achse zeigt die Stunden des Tages (0-23 Uhr), die vertikale Achse die Wochentage.
            Fahre mit der Maus über die Felder, um die exakten Durchschnittswerte für diese Stunde zu sehen.
          </p>
        </div>
        ${heatmapsHtml}
      </div>
    `;
  }

  generateHeatmapHTML(data, title, unit, reverseColors = false) {
    if (!data || data.length === 0) return '';

    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const flatData = data.flat();
    
    // 1. ROBUSTE SKALIERUNG (Perzentile statt absolute Min/Max-Werte)
    // Wir ignorieren die extremsten 2% der Ausreißer nach oben und unten für die Farbskala
    const sortedData = flatData.slice().sort((a, b) => a - b);
    const minIdx = Math.floor(sortedData.length * 0.02);
    const maxIdx = Math.floor(sortedData.length * 0.98);
    const min = sortedData[minIdx];
    const max = sortedData[maxIdx];
    const range = max - min === 0 ? 1 : max - min;

    let html = `
      <div class="heatmap-section">
        <div class="heatmap-title">${title}</div>
        <div class="heatmap-grid">
    `;

    html += `<div></div>`; 
    for (let h = 0; h < 24; h++) {
      html += `<div class="heatmap-header-x">${h}</div>`;
    }

    for (let d = 0; d < 7; d++) {
      html += `<div class="heatmap-header-y">${days[d]}</div>`;
      for (let h = 0; h < 24; h++) {
        const val = data[d][h] || 0;
        
        // 2. CLIPPING: Verhindert, dass echte Ausreißer die berechnete Skala sprengen
        const clampedVal = Math.max(min, Math.min(max, val));
        
        // 3. GAMMA-KORREKTUR: Zieht die Werte optisch auseinander (0.85er Kurve)
        let intensity = (clampedVal - min) / range;
        intensity = Math.pow(intensity, 0.85); 
        
        let hue = reverseColors ? (intensity * 120) : ((1 - intensity) * 120);
        
        // 4. DYNAMISCHE LEUCHTKRAFT: Gelb (Mitte) heller, Rot/Grün (Ränder) satter
        const lightness = 45 + (15 * (1 - Math.abs(intensity - 0.5) * 2));
        
        const alpha = val === 0 ? 0.1 : 1; 
        const bgColor = `hsla(${hue}, 85%, ${lightness}%, ${alpha})`;
        
        html += `<div class="heatmap-cell" 
                      style="background-color: ${bgColor}" 
                      title="${days[d]} ${h}:00 Uhr&#10;${this.formatNumber(val, 2)} ${unit}">
                 </div>`;
      }
    }
    html += `</div></div>`;
    return html;
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
      .file-info {
        padding: 12px;
        background-color: var(--secondary-background-color);
        border-radius: 4px;
        border-left: 3px solid var(--primary-color);
      }
      .file-info p { margin: 4px 0; font-size: 14px; }
      
      .progress-container { display: flex; flex-direction: column; gap: 8px; }
      .progress-bar {
        width: 0%; height: 4px; background-color: var(--primary-color);
        border-radius: 2px; transition: width 0.2s ease;
      }
      #progressText { font-size: 12px; color: var(--secondary-text-color); }
      
      .response-message { padding: 16px; border-radius: 4px; text-align: center; }
      .response-message p { margin: 4px 0; }
      .response-message.success { background-color: rgba(76, 175, 80, 0.1); border-left: 3px solid #4caf50; }
      .response-message.error { background-color: rgba(244, 67, 54, 0.1); border-left: 3px solid #f44336; }
      .success-icon { font-size: 24px; color: #4caf50; margin-bottom: 8px; }
      .error-icon { font-size: 24px; color: #f44336; margin-bottom: 8px; }
      
      .card-actions {
        padding: 8px 16px 16px;
        display: flex; gap: 8px; justify-content: flex-end;
      }
      .upload-button, .cancel-button {
        padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer;
        font-size: 14px; font-weight: 500; transition: all 0.2s ease;
      }
      .upload-button { background-color: var(--primary-color); color: white; }
      .upload-button:hover:not(:disabled) { opacity: 0.9; }
      .upload-button:disabled { opacity: 0.5; cursor: not-allowed; }
      .cancel-button { background-color: var(--secondary-background-color); color: var(--primary-text-color); }
      .cancel-button:hover:not(:disabled) { background-color: var(--divider-color); }

      /* --- HEATMAP STYLES --- */
      .heatmap-section-container {
        border-top: 1px solid var(--divider-color);
        padding: 24px 16px;
        background-color: var(--card-background-color);
        border-radius: 0 0 8px 8px;
      }
      
      .info-box {
        background-color: rgba(var(--rgb-primary-color), 0.05);
        border-left: 4px solid var(--primary-color);
        padding: 16px;
        margin-bottom: 24px;
        border-radius: 0 4px 4px 0;
      }
      
      .info-box h3 {
        margin: 0 0 8px 0;
        font-size: 16px;
        color: var(--primary-text-color);
      }
      
      .info-divider {
        border: 0;
        height: 1px;
        background: var(--divider-color);
        margin: 12px 0;
      }
      
      .info-text {
        font-size: 13px;
        color: var(--secondary-text-color);
        line-height: 1.5;
        margin: 0;
      }

      .heatmaps-wrapper {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      
      .heatmap-title {
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 8px;
        text-align: left;
      }

      .heatmap-grid {
        display: grid;
        grid-template-columns: auto repeat(24, 1fr);
        gap: 2px;
        font-size: 10px;
      }

      .heatmap-header-y {
        display: flex; align-items: center; justify-content: flex-end;
        padding-right: 8px; color: var(--secondary-text-color); font-weight: 500;
      }

      .heatmap-header-x {
        text-align: center; color: var(--secondary-text-color); padding-bottom: 4px;
      }

      .heatmap-cell {
        aspect-ratio: 1; border-radius: 2px; cursor: crosshair; transition: transform 0.1s;
      }

      .heatmap-cell:hover {
        transform: scale(1.2); box-shadow: 0 0 4px rgba(0,0,0,0.3); z-index: 2; position: relative;
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
  name: "Smart Energy Insights - Upload Card",
  description: "Upload load profile CSV files to Smart Energy Insights integration",
});