/* =========================================================
   CIPHER SENTINEL - TACTICAL CONTROLLER
========================================================= */

const API_BASE = "http://127.0.0.1:8000/api/v1";
const MAP_CENTER = [23.0305, 72.557];

// Area coordinate mapping for Sandbox
const AREA_COORDINATES = {
  navrangpura: { lat: 23.0225, lng: 72.5714 },
  sola: { lat: 23.07, lng: 72.517 },
  prahlad: { lat: 23.012, lng: 72.51 },
  ellisbridge: { lat: 23.03, lng: 72.58 },
};

// UI Elements
const currentDate = document.getElementById("current-date");
const currentTime = document.getElementById("current-time");
const liveComplaints = document.getElementById("live-complaints");
const incidentAmount = document.getElementById("incident-amount");
const incidentId = document.getElementById("incident-id");

// Sandbox Elements
const sandboxAmount = document.getElementById("sandbox-amount");
const sandboxAmountVal = document.getElementById("sandbox-amount-val");
const sandboxHour = document.getElementById("sandbox-hour");
const sandboxArea = document.getElementById("sandbox-area");
const sandboxBtn = document.getElementById("sandbox-btn");
const simulateBtn = document.getElementById("simulate-btn");

// Target Prediction Elements
const targetName = document.getElementById("target-name");
const targetZone = document.getElementById("target-zone");
const targetConfidence = document.getElementById("target-confidence");
const targetFraudProb = document.getElementById("target-fraud-prob");
const targetCash = document.getElementById("target-cash");

// Intercept & Dispatch Elements
const assignedUnit = document.getElementById("assigned-unit");
const interceptDistance = document.getElementById("intercept-distance");
const interceptEta = document.getElementById("intercept-eta");
const dispatchBtn = document.getElementById("dispatch-btn");
const countermeasuresPanel = document.getElementById("countermeasures-panel");
const mapDispatchBanner = document.getElementById("map-dispatch-banner");
const xaiContainer = document.getElementById("xai-bars-container");
const rankList = document.getElementById("rank-list");

// Layer buttons
const layerRadar = document.getElementById("layer-radar");
const layerDbscan = document.getElementById("layer-dbscan");
const layerCctv = document.getElementById("layer-cctv");

let map;
let hotspotLayer;
let policeLayer;
let vectorLineLayer;
let dbscanLayer;
let cctvLayer;
let currentPredictedSpot = null;

// Real-Time Clock
function updateClock() {
  const now = new Date();
  if (currentDate) {
    currentDate.textContent = now.toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  if (currentTime) {
    currentTime.textContent = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
}

// Leaflet Map Initialization
function initLeafletMap() {
  if (!window.L) return;

  map = L.map("map").setView(MAP_CENTER, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  hotspotLayer = L.layerGroup().addTo(map);
  policeLayer = L.layerGroup().addTo(map);
  vectorLineLayer = L.layerGroup().addTo(map);
  dbscanLayer = L.layerGroup();
  cctvLayer = L.layerGroup();

  renderPoliceUnits();
}

// Render Police Patrol Units
function renderPoliceUnits() {
  if (!policeLayer) return;
  policeLayer.clearLayers();

  const units = [
    {
      id: "PCR-04",
      name: "PCR Van 04 (Ellisbridge)",
      lat: 23.028,
      lng: 72.565,
    },
    { id: "PCR-09", name: "PCR Van 09 (Bodakdev)", lat: 23.045, lng: 72.52 },
    {
      id: "PCR-12",
      name: "PCR Van 12 (Navrangpura)",
      lat: 23.036,
      lng: 72.561,
    },
  ];

  units.forEach((unit) => {
    const icon = L.divIcon({
      className: "police-marker",
      html: "🚓",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    L.marker([unit.lat, unit.lng], { icon })
      .bindPopup(
        `<b>${unit.name}</b><br>ID: ${unit.id}<br>Status: Standby Intercept`,
      )
      .addTo(policeLayer);
  });
}

// Render Dynamic Explainable AI Bars
function renderXAI(xaiFactors) {
  if (!xaiContainer || !Array.isArray(xaiFactors)) return;

  xaiContainer.innerHTML = xaiFactors
    .map(
      (item) => `
      <div class="xai-row">
        <div class="xai-header">
          <span class="xai-label">${item.feature}</span>
          <span class="xai-pct">${item.pct}%</span>
        </div>
        <div class="xai-track">
          <div class="xai-fill" style="width: ${item.pct}%;"></div>
        </div>
      </div>
    `,
    )
    .join("");
}

// Render Dynamic Corridor Rankings
function renderRanking(hotspots) {
  if (!rankList || !Array.isArray(hotspots) || hotspots.length === 0) return;

  const ranking = hotspots[0]?.ranking || [];
  if (!Array.isArray(ranking) || ranking.length === 0) return;

  rankList.innerHTML = ranking
    .slice(0, 4)
    .map((item, index) => {
      const name = item.hotspot || "Corridor";
      const prob = Math.round((item.probability ?? 0) * 100);
      return `
        <div class="rank-row">
          <span><b>${index + 1}.</b> ${name}</span>
          <strong>${prob}%</strong>
        </div>
      `;
    })
    .join("");
}

// Render Hotspots & Update Cards
function renderHotspots(hotspots, activeAmount = 48500) {
  if (
    !Array.isArray(hotspots) ||
    hotspots.length === 0 ||
    !map ||
    !hotspotLayer
  )
    return;

  hotspotLayer.clearLayers();
  currentPredictedSpot =
    hotspots.find((spot) => spot.is_predicted === true) || hotspots[0];

  renderRanking(hotspots);
  if (currentPredictedSpot?.xai_factors) {
    renderXAI(currentPredictedSpot.xai_factors);
  }

  hotspots.forEach((spot) => {
    const lat = Number(spot.latitude);
    const lng = Number(spot.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    const isPredicted = Boolean(spot.is_predicted);

    const popupHtml = `
      <div style="font-family: monospace;">
        <b style="color: #f8fafc; font-size: 12px;">${spot.name}</b><br>
        <span style="color: #94a3b8;">${spot.area}</span><br>
        <span style="color: #64748b;">Nearest Unit: <b>${spot.nearest_unit || "PCR-04"}</b></span><br>
        <span style="color: #22c55e;">ETA: <b>${spot.intercept_eta_mins || 3.5} mins</b> (${spot.distance_km || 1.2} km)</span>
      </div>
    `;

    if (isPredicted) {
      L.circle([lat, lng], {
        radius: 650,
        color: "#e11d48",
        opacity: 0.9,
        fillColor: "#e11d48",
        fillOpacity: 0.18,
        weight: 1.5,
      }).addTo(hotspotLayer);
    }

    const marker = L.circleMarker([lat, lng], {
      radius: isPredicted ? 9 : 6,
      color: isPredicted ? "#ffffff" : "#64748b",
      weight: isPredicted ? 2 : 1,
      fillColor: isPredicted ? "#e11d48" : "#334155",
      fillOpacity: 1,
    }).addTo(hotspotLayer);

    marker.bindPopup(popupHtml);
    if (isPredicted) marker.openPopup();
  });

  // Hydrate Cards
  if (currentPredictedSpot) {
    if (targetName)
      targetName.textContent = `${currentPredictedSpot.name} Banking Corridor`;
    if (targetZone)
      targetZone.textContent = `${currentPredictedSpot.area} • High-Risk ATM Cluster`;
    if (targetConfidence)
      targetConfidence.textContent = `${Math.round((currentPredictedSpot.confidence ?? 1.0) * 100)}%`;
    if (targetFraudProb)
      targetFraudProb.textContent = `${((currentPredictedSpot.fraud_prob ?? 0.998) * 100).toFixed(1)}%`;
    if (targetCash)
      targetCash.textContent = `₹${activeAmount.toLocaleString("en-IN")}`;

    if (assignedUnit)
      assignedUnit.textContent =
        currentPredictedSpot.nearest_unit || "PCR Van 04 (Ellisbridge)";
    if (interceptDistance)
      interceptDistance.textContent = `${currentPredictedSpot.distance_km || 1.2} km`;
    if (interceptEta)
      interceptEta.textContent = `${currentPredictedSpot.intercept_eta_mins || 3.5} mins`;
  }

  const bounds = L.latLngBounds(hotspots.map((s) => [s.latitude, s.longitude]));
  map.fitBounds(bounds.pad(0.2));
}

// Load Tactical Layers (DBSCAN & CCTV)
async function loadTacticalLayers() {
  try {
    const res = await fetch(`${API_BASE}/tactical-layers`);
    const data = await res.json();

    // 1. Populate DBSCAN historical cluster layer
    if (dbscanLayer && Array.isArray(data.dbscan_clusters)) {
      dbscanLayer.clearLayers();
      data.dbscan_clusters.forEach((pt) => {
        L.circleMarker([pt.lat, pt.lng], {
          radius: 5,
          color: "#0284c7",
          fillColor: "#38bdf8",
          fillOpacity: pt.density || 0.7,
          weight: 1,
        })
          .bindPopup(
            `<b>DBSCAN Cluster Node</b><br>Density Score: ${(pt.density * 100).toFixed(0)}%`,
          )
          .addTo(dbscanLayer);
      });
    }

    // 2. Populate CCTV layer
    if (cctvLayer && Array.isArray(data.cctv_nodes)) {
      cctvLayer.clearLayers();
      data.cctv_nodes.forEach((cam) => {
        const icon = L.divIcon({
          className: "cctv-marker",
          html: "📹",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        L.marker([cam.latitude, cam.longitude], { icon })
          .bindPopup(
            `<b>${cam.name}</b><br>ID: ${cam.cam_id}<br>Status: ${cam.status}`,
          )
          .addTo(cctvLayer);
      });
    }
  } catch (err) {
    console.error("Failed to load tactical layers:", err);
  }
}

// Load Hotspots Query
async function loadHotspots(
  amount = 48500,
  lat = 23.0305,
  lng = 72.557,
  hour = 14,
) {
  try {
    const url = `${API_BASE}/hotspots?amount=${amount}&lat=${lat}&lng=${lng}&hour=${hour}`;
    const res = await fetch(url);
    const hotspots = await res.json();
    renderHotspots(hotspots, amount);
  } catch (err) {
    console.error("Hotspots fetch failed:", err);
  }
}

// Load Database Complaint Count
async function loadComplaints() {
  try {
    const res = await fetch(`${API_BASE}/complaints`);
    const complaints = await res.json();
    if (liveComplaints && Array.isArray(complaints)) {
      liveComplaints.textContent = String(complaints.length);
    }
  } catch (err) {
    console.error("Complaints fetch failed:", err);
  }
}

// Interactive Handlers
function setupEventListeners() {
  // Amount Slider Live Preview
  if (sandboxAmount && sandboxAmountVal) {
    sandboxAmount.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      sandboxAmountVal.textContent = `₹${val.toLocaleString("en-IN")}`;
    });
  }

  // Sandbox Live Inference Run
  if (sandboxBtn) {
    sandboxBtn.addEventListener("click", async () => {
      const amt = Number(sandboxAmount.value);
      const hr = Number(sandboxHour.value);
      const areaKey = sandboxArea.value;
      const coords = AREA_COORDINATES[areaKey] || AREA_COORDINATES.navrangpura;

      if (incidentAmount)
        incidentAmount.textContent = `₹${amt.toLocaleString("en-IN")}`;
      if (incidentId)
        incidentId.textContent = `SBX-${Math.floor(1000 + Math.random() * 9000)}`;

      sandboxBtn.textContent = "COMPUTING INFERENCE...";
      await loadHotspots(amt, coords.lat, coords.lng, hr);
      sandboxBtn.textContent = "RUN LIVE MODEL INFERENCE";
    });
  }

  // Tactical Layer Toggles
  if (layerRadar) {
    layerRadar.addEventListener("click", () => {
      layerRadar.classList.toggle("active");
      if (layerRadar.classList.contains("active")) {
        map.addLayer(hotspotLayer);
        map.addLayer(policeLayer);
      } else {
        map.removeLayer(hotspotLayer);
        map.removeLayer(policeLayer);
      }
    });
  }

  if (layerDbscan) {
    layerDbscan.addEventListener("click", () => {
      layerDbscan.classList.toggle("active");
      if (layerDbscan.classList.contains("active")) {
        map.addLayer(dbscanLayer);
      } else {
        map.removeLayer(dbscanLayer);
      }
    });
  }

  if (layerCctv) {
    layerCctv.addEventListener("click", () => {
      layerCctv.classList.toggle("active");
      if (layerCctv.classList.contains("active")) {
        map.addLayer(cctvLayer);
      } else {
        map.removeLayer(cctvLayer);
      }
    });
  }

  // Intercept Dispatch Handler
  if (dispatchBtn) {
    dispatchBtn.addEventListener("click", async () => {
      if (!currentPredictedSpot) return;

      dispatchBtn.disabled = true;
      dispatchBtn.textContent = "TRANSMITTING VECTORS...";

      try {
        await fetch(`${API_BASE}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_name: currentPredictedSpot.name,
            latitude: currentPredictedSpot.latitude,
            longitude: currentPredictedSpot.longitude,
            threat_level: "HIGH",
          }),
        });

        // Draw tactical intercept line from PCR Van 04
        if (vectorLineLayer) {
          vectorLineLayer.clearLayers();
          const pcrCoords = [23.028, 72.565];
          const targetCoords = [
            currentPredictedSpot.latitude,
            currentPredictedSpot.longitude,
          ];

          const line = L.polyline([pcrCoords, targetCoords], {
            color: "#38bdf8",
            weight: 3,
            dashArray: "6, 8",
            opacity: 0.95,
          }).addTo(vectorLineLayer);

          map.fitBounds(line.getBounds().pad(0.3));
        }

        if (countermeasuresPanel) countermeasuresPanel.style.display = "block";
        if (mapDispatchBanner) mapDispatchBanner.style.display = "block";

        dispatchBtn.textContent = "✅ INTERCEPT VECTOR DISPATCHED";
        dispatchBtn.style.background = "#15803d";
      } catch (err) {
        console.error("Dispatch failed:", err);
        dispatchBtn.textContent = "RETRY DISPATCH";
        dispatchBtn.disabled = false;
      }
    });
  }

  // Random 1930 Feed Simulation
  if (simulateBtn) {
    simulateBtn.addEventListener("click", async () => {
      simulateBtn.disabled = true;
      simulateBtn.textContent = "INGESTING 1930 FEED...";

      const newId = `NCR-${Math.floor(1000 + Math.random() * 9000)}`;
      const newAmount = Math.floor(40000 + Math.random() * 40000);

      try {
        await fetch(`${API_BASE}/complaints`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            complaint_id: newId,
            victim_location: "Navrangpura, Ahmedabad",
            amount: newAmount,
          }),
        });

        if (incidentId) incidentId.textContent = newId;
        if (incidentAmount)
          incidentAmount.textContent = `₹${newAmount.toLocaleString("en-IN")}`;

        await Promise.all([
          loadHotspots(newAmount, 23.0305, 72.557, 14),
          loadComplaints(),
        ]);

        simulateBtn.textContent = "⚡ INGEST RANDOM 1930 FEED";
        simulateBtn.disabled = false;
      } catch (err) {
        console.error("Simulation error:", err);
        simulateBtn.textContent = "RETRY SIMULATION";
        simulateBtn.disabled = false;
      }
    });
  }
}

// App Initialization
async function initDashboard() {
  updateClock();
  initLeafletMap();
  setupEventListeners();
  await Promise.all([loadHotspots(), loadTacticalLayers(), loadComplaints()]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}

setInterval(updateClock, 1000);
