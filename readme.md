# Smart Energy Insights

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

A decision support tool for analyzing household electricity consumption, load shifting, and the evaluation of dynamic tariffs.

## 📌 Project Overview
This Home Assistant integration is being developed as part of a Master's Thesis at FH JOANNEUM. The goal is to empower households to minimize energy costs through data-driven tariff selection and targeted load shifting.

## 🛠 Features (Planned)
* **Tariff Simulation:** Compare historical consumption against real-time EPEX SPOT prices.
* **Load Analysis:** Identify major consumers using Non-Intrusive Load Monitoring (NILM).
* **Automation:** Direct control or "nudging" via notifications to shift loads into cheap time windows.

## 🚀 Installation
1. Open **HACS** in Home Assistant.
2. Navigate to **Integrations** -> **Custom repositories** (three-dot menu).
3. Add this repository URL and select `Integration` as the category.
4. Click **Install** and restart Home Assistant.

## 🏗 Setup & Requirements
This integration is designed to run locally on hardware ranging from **Raspberry Pi** to **x86 systems**. It supports data acquisition via:
* **P1 Interface:** For high-resolution local data.
* **EDA Portal:** For 15-minute resolution cloud profiles.

---
*Created by Christoph Seidlinger as part of the Master's Program Software and Digital Experience Engineering.*