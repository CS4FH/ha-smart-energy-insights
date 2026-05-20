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
    if (isFirstLoad) {
      this.loadHeatmapsFromBackend();
    }
  }

  debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  async saveSettingsToBackend(data) {
    if (!this._hass) return;
    try {
      await this._hass.fetchWithAuth("/api/smart_energy_insights/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    } catch (e) {
      console.error("Failed to sync settings to HA backend", e);
    }
  }

  render() {
    const title = this.config?.title || "Load Profile Upload";
    const obisCode = this.config?.obis_code || "1.8.0";

    if (!this._debouncedSave) {
      this._debouncedSave = this.debounce((data) => this.saveSettingsToBackend(data), 600);
    }

    // Grund-HTML: Standardmäßig wird der Header angezeigt, bis Daten da sind.
    this.innerHTML = `
      <ha-card id="mainCard">
        <div class="card-header" id="defaultHeader">
          <div class="title">${title}</div>
        </div>
        
        <div id="dashboardContainer"></div>

        <div class="card-content" id="uploadContent">
          <div class="upload-container">
            <div class="dropzone" id="dropzone">
              <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v16M7 7l5-5 5 5M2 20h20"/>
              </svg>
              <h3 id="uploadTitle">Neue CSV hochladen</h3>
              <p>Drag & Drop oder <button class="file-picker-btn" id="filePickerBtn">Datei auswählen</button></p>
              <input type="file" id="fileInput" accept=".csv" style="display: none;" />
            </div>
            <div class="file-info" id="fileInfo" style="display: none;">
              <p><strong>Datei:</strong> <span id="fileName"></span></p>
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
          <button id="cancelBtn" class="cancel-button" style="display: none;">Abbrechen</button>
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

    filePickerBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) this.handleFileSelected(e.target.files[0], obisCode);
    });

    dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
    dropzone.addEventListener("dragleave", () => { dropzone.classList.remove("drag-over"); });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault(); dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) this.handleFileSelected(e.dataTransfer.files[0], obisCode);
    });

    uploadBtn.addEventListener("click", () => { this.uploadFile(obisCode); });
    cancelBtn.addEventListener("click", () => { this.resetUI(); });
  }

  handleFileSelected(file, obisCode) {
    if (!file.name.endsWith(".csv")) {
      this.showErrorMessage("Bitte wähle eine CSV-Datei aus.");
      return;
    }
    this.selectedFile = file;
    this.querySelector("#fileName").textContent = file.name;
    this.querySelector("#fileInfo").style.display = "block";
    this.querySelector("#uploadBtn").style.display = "inline-block";
    this.querySelector("#cancelBtn").style.display = "inline-block";
    this.querySelector("#responseMessage").style.display = "none";
  }

  async uploadFile(obisCode) {
    if (!this.selectedFile) return;
    const uploadBtn = this.querySelector("#uploadBtn");
    const cancelBtn = this.querySelector("#cancelBtn");
    const progressContainer = this.querySelector("#progressContainer");

    uploadBtn.disabled = true; cancelBtn.disabled = true; progressContainer.style.display = "block";

    const formData = new FormData();
    formData.append("file", this.selectedFile);
    formData.append("obis_code", obisCode);

    try {
      if (!this._hass) throw new Error("Home Assistant instance not found");
      const response = await this._hass.fetchWithAuth("/api/smart_energy_insights/upload", {
        method: "POST", body: formData
      });
      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.error || `HTTP error! status: ${response.status}`);

      this.showSuccessMessage(responseData);
      this.renderDashboard(responseData);
      this.resetUI();
    } catch (error) {
      this.showErrorMessage(`Fehler: ${error.message}`);
      uploadBtn.disabled = false; cancelBtn.disabled = false; progressContainer.style.display = "none";
    }
  }

  async loadHeatmapsFromBackend() {
    try {
      const response = await this._hass.fetchWithAuth("/api/smart_energy_insights/upload", { method: "GET" });
      if (response.ok) {
        const data = await response.json();
        if (data && data.success) this.renderDashboard(data);
      }
    } catch (e) {
      console.error("Failed to load persistent heatmaps", e);
    }
  }

  showSuccessMessage(response) {
    const message = this.querySelector("#responseMessage");
    message.style.display = "block";
    message.className = "response-message success";
    message.innerHTML = `
      <div class="success-icon">✓</div>
      <p><strong>Upload Erfolgreich!</strong></p>
      <p>${response.count || 0} Werte wurden importiert.</p>
    `;
  }

  showErrorMessage(error) {
    const message = this.querySelector("#responseMessage");
    message.style.display = "block";
    message.className = "response-message error";
    message.innerHTML = `<div class="error-icon">✗</div><p><strong>Upload fehlgeschlagen</strong></p><p>${error}</p>`;
  }

  resetUI() {
    this.querySelector("#uploadBtn").style.display = "none";
    this.querySelector("#cancelBtn").style.display = "none";
    this.querySelector("#fileInfo").style.display = "none";
    this.querySelector("#progressContainer").style.display = "none";
    this.querySelector("#fileInput").value = "";
    this.selectedFile = null;
    this.querySelector("#progressBar").style.width = "0%";
  }

  formatNumber(value, decimals) {
    const num = Number(value);
    return !Number.isFinite(num) ? "N/A" : num.toFixed(decimals).replace('.', ',');
  }

  renderDashboard(response) {
    const container = this.querySelector("#dashboardContainer");
    if (!container) return;

    this.latestData = response;

    // 1. Wenn Daten da sind, Standard-Header entfernen und Upload-Feld unauffälliger machen
    this.querySelector("#defaultHeader").style.display = "none";
    this.querySelector("#uploadContent").classList.add("data-loaded");
    this.querySelector("#uploadTitle").textContent = "Anderes Lastprofil hochladen";

    let heatmapsHtml = '';
    if (response.consumption_heatmap && response.consumption_heatmap.length > 0) {
      heatmapsHtml += this.generateHeatmapHTML(response.consumption_heatmap, "Ø Verbrauch pro Stunde (kWh)", "kWh", false);
    }
    if (response.price_heatmap && response.price_heatmap.length > 0) {
      heatmapsHtml += this.generateHeatmapHTML(response.price_heatmap, "Ø Spotpreis pro Stunde (ct/kWh)", "ct/kWh", false);
    }

    const start = response.start ? response.start.split('T')[0] : 'N/A';
    const end = response.end ? response.end.split('T')[0] : 'N/A';
    
    const initialFix = response.fixed_price_ct || 15.0;
    const initialFixBase = response.fixed_base_fee_eur || 4.90;
    const initialMarkup = response.spot_markup_ct || 1.5;
    const initialSpotBase = response.spot_base_fee_eur || 5.99;
    const initialTax = response.tax_rate || 20.0;
    const initialTaxChecked = response.inputs_are_net !== false; 

    // Metadaten für das aktuelle Profil
    const filenameStr = response.filename || "Profil_geladen.csv";
    let uploadDateStr = "Zuletzt importiert";
    if (response.upload_date) {
      const d = new Date(response.upload_date);
      uploadDateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    container.innerHTML = `
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
            <h2>Aktuelles Lastprofil: <span>${filenameStr}</span></h2>
            <p>${this.formatNumber(response.count, 0)} Werte &bull; Zeitraum: ${start} bis ${end} &bull; Hochgeladen: ${uploadDateStr}</p>
          </div>
        </div>

        <div class="top-dashboard-grid">
          
          <div class="banner-column" id="dynamicSavingsBanner"></div>
          
          <div class="interactive-settings">
            <h4>⚙️ Tarif-Simulation</h4>
            
            <div class="tax-toggle">
              <label class="checkbox-container">
                <input type="checkbox" id="chkTax" ${initialTaxChecked ? 'checked' : ''}>
                <span class="checkmark"></span>
                <span><strong>Werte sind Netto</strong> (Endabrechnung erfolgt Brutto)</span>
              </label>
              <div class="tax-input-group">
                <label>Steuer (%)</label>
                <input type="number" id="inputTaxRate" min="0" max="100" step="0.1" value="${initialTax}">
              </div>
            </div>

            <div class="inputs-container">
              <div class="input-box">
                <div class="input-box-title">Vergleichs-Fixtarif</div>
                <div class="input-group">
                  <label>Arbeitspreis (ct/kWh)</label>
                  <input type="number" id="inputFix" min="0" step="0.1" value="${initialFix}">
                </div>
                <div class="input-group">
                  <label>Grundgebühr (€/Monat)</label>
                  <input type="number" id="inputFixBase" min="0" step="0.01" value="${initialFixBase}">
                </div>
              </div>

              <div class="input-box">
                <div class="input-box-title">Spot-Tarif (Dynamisch)</div>
                <div class="input-group">
                  <label>Aufschlag / Markup (ct/kWh)</label>
                  <input type="number" id="inputMarkup" min="0" step="0.1" value="${initialMarkup}">
                </div>
                <div class="input-group">
                  <label>Grundgebühr (€/Monat)</label>
                  <input type="number" id="inputSpotBase" min="0" step="0.01" value="${initialSpotBase}">
                </div>
              </div>
            </div>
            <div class="disclaimer">
              <em>Hinweis: Netzgebühren & Abgaben fallen in beiden Varianten identisch an.</em>
            </div>
          </div>
        </div>

        <div class="info-box">
          <h3>📊 Analyse des Lastprofils</h3>
          <p>Ø Verbrauch: <strong>${this.formatNumber(response.avg_consumption_kwh, 3)} kWh/Std</strong> | Ø Börsenpreis (Netto): <strong>${this.formatNumber(response.avg_price_ct_kwh, 2)} ct/kWh</strong></p>
        </div>
        
        <div class="heatmaps-grid">
          ${heatmapsHtml}
        </div>
      </div>
    `;

    const inputFix = this.querySelector("#inputFix");
    const inputFixBase = this.querySelector("#inputFixBase");
    const inputMarkup = this.querySelector("#inputMarkup");
    const inputSpotBase = this.querySelector("#inputSpotBase");
    const inputTaxRate = this.querySelector("#inputTaxRate");
    const chkTax = this.querySelector("#chkTax");
    
    const updateHandler = () => this.updateSavingsBanner(false);
    inputFix.addEventListener("input", updateHandler);
    inputFixBase.addEventListener("input", updateHandler);
    inputMarkup.addEventListener("input", updateHandler);
    inputSpotBase.addEventListener("input", updateHandler);
    inputTaxRate.addEventListener("input", updateHandler);
    chkTax.addEventListener("change", updateHandler);

    this.updateSavingsBanner(true);
  }

  updateSavingsBanner(isInitialLoad = false) {
    if (!this.latestData || this.latestData.matched_hours === 0) return;

    const valFix = parseFloat(this.querySelector("#inputFix").value) || 0;
    const valFixBase = parseFloat(this.querySelector("#inputFixBase").value) || 0;
    const valMarkup = parseFloat(this.querySelector("#inputMarkup").value) || 0;
    const valSpotBase = parseFloat(this.querySelector("#inputSpotBase").value) || 0;
    const valTaxRate = parseFloat(this.querySelector("#inputTaxRate").value) || 0;
    const inputsAreNet = this.querySelector("#chkTax").checked;

    if (!isInitialLoad) {
      this._debouncedSave({
        fixed_price_ct: valFix,
        fixed_base_fee_eur: valFixBase,
        spot_markup_ct: valMarkup,
        spot_base_fee_eur: valSpotBase,
        tax_rate: valTaxRate,
        inputs_are_net: inputsAreNet
      });
    }

    this.querySelector(".tax-input-group").style.opacity = inputsAreNet ? "1" : "0.4";
    this.querySelector(".tax-input-group").style.pointerEvents = inputsAreNet ? "auto" : "none";

    const matchedCons = this.latestData.matched_consumption || 0;
    const baseSpotEur = this.latestData.base_spot_cost_eur || 0;
    const durationMonths = this.latestData.duration_months || 0;

    const taxMultiplier = inputsAreNet ? (1.0 + (valTaxRate / 100.0)) : 1.0;
    const grossSpotEnergy = baseSpotEur * (1.0 + (valTaxRate / 100.0));

    const grossFixPrice = inputsAreNet ? valFix * taxMultiplier : valFix;
    const grossFixBase = inputsAreNet ? valFixBase * taxMultiplier : valFixBase;
    const grossMarkup = inputsAreNet ? valMarkup * taxMultiplier : valMarkup;
    const grossSpotBase = inputsAreNet ? valSpotBase * taxMultiplier : valSpotBase;

    const costFixEur = (matchedCons * grossFixPrice) / 100.0 + (durationMonths * grossFixBase);
    const costSpotEur = grossSpotEnergy + ((matchedCons * grossMarkup) / 100.0) + (durationMonths * grossSpotBase);
    const savingsEur = costFixEur - costSpotEur;

    const bannerContainer = this.querySelector("#dynamicSavingsBanner");
    const isPositive = savingsEur >= 0;
    const savColor = isPositive ? "#4caf50" : "#f44336";
    const savBg = isPositive ? "rgba(76, 175, 80, 0.1)" : "rgba(244, 67, 54, 0.1)";
    const savIcon = isPositive ? "💰" : "⚠️";
    
    // Die Box ist nun 100% hoch, damit sie im Grid neben den Settings schön abschließt
    bannerContainer.innerHTML = `
      <div style="background-color: ${savBg}; border: 1px solid rgba(var(--rgb-divider-color), 0.2); border-top: 4px solid ${savColor}; padding: 24px; border-radius: 8px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center;">
        <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px;">
          <div style="font-size: 48px; line-height: 1;">${savIcon}</div>
          <div>
            <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: var(--secondary-text-color); margin-bottom: 4px; font-weight: 600;">
              ${isPositive ? 'Ersparnis mit Dynamischem Tarif' : 'Mehrkosten mit Dynamischem Tarif'}
            </div>
            <div style="font-size: 32px; font-weight: bold; color: var(--primary-text-color);">
              ${this.formatNumber(Math.abs(savingsEur), 2)} €
            </div>
          </div>
        </div>
        <div style="font-size: 14px; color: var(--secondary-text-color); margin-bottom: 24px; line-height: 1.5;">
          ${isPositive 
            ? "Für das ausgewertete Profil wäre dein Stromanbieter im <strong>Spot-Tarif</strong> deutlich günstiger gewesen." 
            : "Für das ausgewertete Profil wäre ein klassischer <strong>Fixtarif</strong> die günstigere Wahl gewesen."}
        </div>
        <div style="margin-top: auto; font-size: 13px; background: rgba(var(--rgb-primary-text-color), 0.04); padding: 16px; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span><strong>Kosten Fixtarif:</strong></span>
            <span>${this.formatNumber(costFixEur, 2)} € (Brutto)</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>Kosten Spot-Tarif:</strong></span>
            <span>${this.formatNumber(costSpotEur, 2)} € (Brutto)</span>
          </div>
        </div>
      </div>
    `;
  }

  generateHeatmapHTML(data, title, unit, reverseColors = false) {
    if (!data || data.length === 0) return '';
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const flatData = data.flat();
    
    const sortedData = flatData.slice().sort((a, b) => a - b);
    const minIdx = Math.floor(sortedData.length * 0.02);
    const maxIdx = Math.floor(sortedData.length * 0.98);
    const min = sortedData[minIdx];
    const max = sortedData[maxIdx];
    const range = max - min === 0 ? 1 : max - min;

    let html = `<div class="heatmap-section"><div class="heatmap-title">${title}</div><div class="heatmap-grid">`;
    html += `<div></div>`; 
    for (let h = 0; h < 24; h++) html += `<div class="heatmap-header-x">${h}</div>`;

    for (let d = 0; d < 7; d++) {
      html += `<div class="heatmap-header-y">${days[d]}</div>`;
      for (let h = 0; h < 24; h++) {
        const val = data[d][h] || 0;
        const clampedVal = Math.max(min, Math.min(max, val));
        let intensity = (clampedVal - min) / range;
        intensity = Math.pow(intensity, 0.85);
        let hue = reverseColors ? (intensity * 120) : ((1 - intensity) * 120);
        const lightness = 45 + (15 * (1 - Math.abs(intensity - 0.5) * 2));
        const alpha = val === 0 ? 0.1 : 1; 
        const bgColor = `hsla(${hue}, 85%, ${lightness}%, ${alpha})`;
        html += `<div class="heatmap-cell" style="background-color: ${bgColor}" title="${days[d]} ${h}:00 Uhr&#10;${this.formatNumber(val, 2)} ${unit}"></div>`;
      }
    }
    html += `</div></div>`;
    return html;
  }

  applyStyles() {
    const style = document.createElement("style");
    style.textContent = `
      ha-card { box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1)); border-radius: var(--ha-card-border-radius, 8px); overflow: hidden; }
      .card-header { padding: 16px; border-bottom: 1px solid var(--divider-color); }
      .title { font-size: 18px; font-weight: 500; color: var(--primary-text-color); }
      .card-content { padding: 16px; }
      
      /* Dashboard Wrapper */
      .dashboard-wrapper { padding: 24px; }
      
      /* Profil Metadaten Header */
      .profile-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--divider-color); }
      .profile-icon { color: var(--primary-color); width: 40px; height: 40px; background: rgba(var(--rgb-primary-color), 0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
      .profile-icon svg { width: 24px; height: 24px; }
      .profile-info h2 { margin: 0 0 4px 0; font-size: 18px; font-weight: 500; color: var(--primary-text-color); }
      .profile-info h2 span { color: var(--primary-color); font-weight: 600; }
      .profile-info p { margin: 0; font-size: 13px; color: var(--secondary-text-color); }

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
      
      .info-box { background-color: rgba(var(--rgb-primary-color), 0.05); border-left: 4px solid var(--primary-color); padding: 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0; }
      .info-box h3 { margin: 0 0 8px 0; font-size: 16px; color: var(--primary-text-color); }
      .info-box p { margin: 0; font-size: 14px; color: var(--primary-text-color); }

      /* Heatmaps Grid */
      .heatmaps-grid { display: grid; grid-template-columns: 1fr; gap: 32px; }
      @media(min-width: 1300px) { .heatmaps-grid { grid-template-columns: 1fr 1fr; } }
      
      .heatmap-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; text-align: left; color: var(--primary-text-color); }
      .heatmap-grid { display: grid; grid-template-columns: auto repeat(24, 1fr); gap: 2px; font-size: 10px; }
      .heatmap-header-y { display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; color: var(--secondary-text-color); font-weight: 500; }
      .heatmap-header-x { text-align: center; color: var(--secondary-text-color); padding-bottom: 4px; }
      .heatmap-cell { aspect-ratio: 1; border-radius: 2px; cursor: crosshair; transition: transform 0.1s; }
      .heatmap-cell:hover { transform: scale(1.2); box-shadow: 0 0 4px rgba(0,0,0,0.3); z-index: 2; position: relative; }

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
      .card-actions { padding: 8px 16px 16px; display: flex; gap: 8px; justify-content: flex-end; }
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