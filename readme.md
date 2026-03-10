# Smart Energy Insights

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

[cite_start]A decision support tool for analyzing household electricity consumption, load shifting, and the evaluation of dynamic tariffs[cite: 5].

## 📌 Project Overview
[cite_start]This Home Assistant integration is being developed as part of a Master's Thesis at FH JOANNEUM[cite: 1, 6]. [cite_start]The goal is to empower households to minimize energy costs through data-driven tariff selection and targeted load shifting[cite: 26].

## 🛠 Features (Planned)
* [cite_start]**Tariff Simulation:** Compare historical consumption against real-time EPEX SPOT prices[cite: 31].
* [cite_start]**Load Analysis:** Identify major consumers using Non-Intrusive Load Monitoring (NILM)[cite: 36].
* [cite_start]**Automation:** Direct control or "nudging" via notifications to shift loads into cheap time windows[cite: 68, 70].

## 🚀 Installation
1. Open **HACS** in Home Assistant.
2. Navigate to **Integrations** -> **Custom repositories** (three-dot menu).
3. Add this repository URL and select `Integration` as the category.
4. Click **Install** and restart Home Assistant.

## 🏗 Setup & Requirements
[cite_start]This integration is designed to run locally on hardware ranging from **Raspberry Pi** to **x86 systems**[cite: 75]. It supports data acquisition via:
* [cite_start]**P1 Interface:** For high-resolution local data[cite: 51].
* [cite_start]**EDA Portal:** For 15-minute resolution cloud profiles[cite: 53].

---
[cite_start]*Created by Christoph Seidlinger as part of the Master's Program Software and Digital Experience Engineering[cite: 3, 10].*