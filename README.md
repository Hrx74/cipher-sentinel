# 🛡️ Cipher Sentinel

> Tactical intercept console that predicts cyber fraud ATM cash-out hotspots and alerts patrol units before stolen funds are withdrawn.

🔗 **Live Demo:** [cipher-sentinel-wzpe.onrender.com](https://cipher-sentinel-wzpe.onrender.com/)

---

## What It Does

When financial fraud is reported on the **1930 helpline**, syndicates typically extract physical cash from ATMs within a 15–45 minute window.

**Cipher Sentinel** bridges digital complaint data with street-level police interdiction: it traces the money mule trail, runs machine learning to predict which banking corridor will be hit, and calculates the fastest police patrol intercept route.

---

## Core Features

- **Fund-Flow Graph:** Traces money movement across hops (Victim ➔ Transit Mule ➔ Terminal Cash-Out Node).
- **Dual ML Pipeline:** Calibrated XGBoost models that score fraud severity and predict the target commercial ATM corridor.
- **Tactical Radar Map:** Interactive Leaflet.js map with DBSCAN hotspot clusters, junction CCTV nodes, and live patrol van tracking.
- **Resource Triage Matrix:** Dispatches PCR vans only when threat is high and ETA is under 10 minutes; defaults to CCTV buffer locks for secondary alerts to avoid false alarms.

---

## Tech Stack

- **Backend:** FastAPI (Python), Uvicorn
- **ML & Analytics:** XGBoost, Scikit-learn (DBSCAN Spatial Clustering)
- **Geospatial & UI:** Leaflet.js, HTML5/CSS3, JavaScript
- **Data Layer:** SQLite (Edge prototype) & SQLAlchemy

---

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the API server
uvicorn backend.main:app --reload

# 3. View the console
# Open frontend/index.html in your browser or visit [http://127.0.0.1:8000](http://127.0.0.1:8000)
```
