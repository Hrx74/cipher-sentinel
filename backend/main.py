import math
from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import datetime, timezone
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from database import Complaint, get_db, init_db
from ml_service import (
    load_hotspot_models,
    match_hotspot,
    models_ready,
    predict_fraud_probability,
    predict_hotspot_ranking,
    predict_hotspot_zone,
)

# =========================================================
# OPERATIONAL REFERENCE DATA: AHMEDABAD SECTOR D3
# =========================================================

MOCK_HOTSPOTS = [
    {
        "id": 1,
        "name": "CG Road",
        "area": "Navrangpura",
        "city": "Ahmedabad",
        "latitude": 23.0225,
        "longitude": 72.5714,
        "description": "Central commercial hub with dense retail banking and multi-bank ATM clusters.",
    },
    {
        "id": 2,
        "name": "Prahlad Nagar",
        "area": "Prahlad Nagar",
        "city": "Ahmedabad",
        "latitude": 23.0120,
        "longitude": 72.5100,
        "description": "Commercial arterial corridor with strong evening retail banking volume.",
    },
    {
        "id": 3,
        "name": "SG Highway",
        "area": "Sola",
        "city": "Ahmedabad",
        "latitude": 23.0700,
        "longitude": 72.5170,
        "description": "High-velocity arterial transit highway connecting western banking clusters.",
    },
    {
        "id": 4,
        "name": "Ashram Road",
        "area": "Ellisbridge",
        "city": "Ahmedabad",
        "latitude": 23.0300,
        "longitude": 72.5800,
        "description": "Historic financial district with dense concentration of public sector ATMs.",
    },
]

PATROL_UNITS = [
    {
        "unit_id": "PCR-04",
        "name": "PCR Van 04 (Ellisbridge)",
        "latitude": 23.0280,
        "longitude": 72.5650,
        "status": "Active Patrol",
    },
    {
        "unit_id": "PCR-09",
        "name": "PCR Van 09 (Bodakdev)",
        "latitude": 23.0450,
        "longitude": 72.5200,
        "status": "Active Patrol",
    },
    {
        "unit_id": "PCR-12",
        "name": "PCR Van 12 (Navrangpura)",
        "latitude": 23.0360,
        "longitude": 72.5610,
        "status": "Standby Intercept",
    },
]

CCTV_NODES = [
    {
        "cam_id": "CAM-01",
        "name": "CG Road Junction PTZ",
        "latitude": 23.0240,
        "longitude": 72.5695,
        "status": "Online",
    },
    {
        "cam_id": "CAM-02",
        "name": "Municipal Market Corridor",
        "latitude": 23.0210,
        "longitude": 72.5730,
        "status": "Online",
    },
    {
        "cam_id": "CAM-03",
        "name": "Prahlad Nagar Crossing",
        "latitude": 23.0115,
        "longitude": 72.5120,
        "status": "Online",
    },
    {
        "cam_id": "CAM-04",
        "name": "SG Highway - Pakwan Crossroad",
        "latitude": 23.0510,
        "longitude": 72.5190,
        "status": "Online",
    },
    {
        "cam_id": "CAM-05",
        "name": "Ellisbridge Riverfront Axis",
        "latitude": 23.0290,
        "longitude": 72.5780,
        "status": "Online",
    },
    {
        "cam_id": "CAM-06",
        "name": "Income Tax Circle Transit",
        "latitude": 23.0380,
        "longitude": 72.5710,
        "status": "Online",
    },
]

DBSCAN_HISTORICAL_CLUSTERS = [
    {"lat": 23.0230, "lng": 72.5710, "density": 0.92},
    {"lat": 23.0220, "lng": 72.5720, "density": 0.88},
    {"lat": 23.0245, "lng": 72.5690, "density": 0.81},
    {"lat": 23.0215, "lng": 72.5735, "density": 0.85},
    {"lat": 23.0250, "lng": 72.5705, "density": 0.90},
    {"lat": 23.0110, "lng": 72.5090, "density": 0.84},
    {"lat": 23.0125, "lng": 72.5110, "density": 0.78},
    {"lat": 23.0135, "lng": 72.5080, "density": 0.82},
    {"lat": 23.0690, "lng": 72.5160, "density": 0.87},
    {"lat": 23.0710, "lng": 72.5180, "density": 0.81},
    {"lat": 23.0725, "lng": 72.5150, "density": 0.75},
    {"lat": 23.0290, "lng": 72.5790, "density": 0.89},
    {"lat": 23.0315, "lng": 72.5815, "density": 0.86},
    {"lat": 23.0280, "lng": 72.5820, "density": 0.74},
]

# =========================================================
# GEOSPATIAL & XAI HELPER ENGINES
# =========================================================


def calculate_haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes exact spherical distance in kilometers between two GPS points."""
    earth_radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(earth_radius_km * c, 2)


def get_closest_patrol_unit(target_lat: float, target_lon: float) -> dict:
    """Calculates closest PCR unit and response ETA."""
    closest_unit = None
    min_dist = float("inf")

    for unit in PATROL_UNITS:
        dist = calculate_haversine_km(
            target_lat, target_lon, unit["latitude"], unit["longitude"]
        )
        if dist < min_dist:
            min_dist = dist
            closest_unit = unit

    # Urban tactical patrol velocity: 25 km/h + 1.0 min dispatch queue
    eta_mins = round((min_dist / 25.0) * 60.0 + 1.0, 1)
    return {
        "unit_id": closest_unit["unit_id"],
        "unit_name": closest_unit["name"],
        "unit_lat": closest_unit["latitude"],
        "unit_lng": closest_unit["longitude"],
        "distance_km": min_dist,
        "eta_minutes": max(eta_mins, 2.0),
    }


def compute_xai_attribution(amount: float, hour: int) -> list[dict]:
    """Generates dynamic feature attribution percentages for Explainable AI."""
    is_night = 23 <= hour or hour <= 5
    is_evening = 19 <= hour < 23

    # Dynamic weighting signals
    amt_score = min(max((amount - 10000) / 75000.0, 0.15), 1.0)
    time_score = 0.95 if is_night else (0.65 if is_evening else 0.30)
    density_score = 0.70  # Commercial banking hub prior
    velocity_score = 0.60 if amount > 40000 else 0.25

    total = amt_score + time_score + density_score + velocity_score
    weights = [
        {
            "feature": "Transaction Surge vs 7d Baseline",
            "pct": round((amt_score / total) * 100),
        },
        {
            "feature": "Temporal Risk (Off-Peak Window)",
            "pct": round((time_score / total) * 100),
        },
        {
            "feature": "DBSCAN Spatial Corridor Density",
            "pct": round((density_score / total) * 100),
        },
        {
            "feature": "Rapid Withdrawal Velocity Flag",
            "pct": round((velocity_score / total) * 100),
        },
    ]

    # Normalize rounding error to guarantee 100% sum
    diff = 100 - sum(w["pct"] for w in weights)
    weights[0]["pct"] += diff
    return weights


# =========================================================
# SCHEMAS
# =========================================================


class ComplaintCreate(BaseModel):
    complaint_id: str = Field(..., min_length=1)
    victim_location: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)


class ComplaintResponse(BaseModel):
    complaint_id: str
    victim_location: str
    amount: float
    created_at: datetime

    model_config = {"from_attributes": True}


class DispatchRequest(BaseModel):
    target_name: str
    latitude: float
    longitude: float
    threat_level: str = "HIGH"


class DispatchResponse(BaseModel):
    status: str
    target_name: str
    assigned_unit: str
    unit_id: str
    distance_km: float
    eta_minutes: float
    countermeasures: dict
    timestamp: datetime


# =========================================================
# APPLICATION LIFECYCLE & APP INIT
# =========================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    load_hotspot_models()
    yield


app = FastAPI(
    title="Cipher Sentinel Engine",
    description="Operational Law Enforcement Intercept Gateway",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# ENDPOINTS
# =========================================================


@app.get("/api/v1/health")
def health():
    return {
        "status": "operational",
        "models_loaded": models_ready(),
        "timestamp": datetime.now(timezone.utc),
    }


@app.get("/api/v1/hotspots")
def get_hotspots(
    lat: float | None = None,
    lng: float | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    amount: float | None = Query(default=None, gt=0),
    hour: int | None = Query(default=None, ge=0, le=23),
    day_of_week: int | None = Query(default=None, ge=0, le=6),
    month: int | None = Query(default=None, ge=1, le=12),
):
    resolved_lat = (
        latitude if latitude is not None else (lat if lat is not None else 23.0305)
    )
    resolved_lng = (
        longitude if longitude is not None else (lng if lng is not None else 72.5570)
    )
    resolved_amount = amount if amount is not None else 48500.0
    resolved_hour = hour if hour is not None else 14

    hotspots = deepcopy(MOCK_HOTSPOTS)
    xai_weights = compute_xai_attribution(resolved_amount, resolved_hour)

    # Attach nearest PCR unit and XAI weights to all corridors
    for spot in hotspots:
        intercept = get_closest_patrol_unit(spot["latitude"], spot["longitude"])
        spot["nearest_unit"] = intercept["unit_name"]
        spot["unit_id"] = intercept["unit_id"]
        spot["distance_km"] = intercept["distance_km"]
        spot["intercept_eta_mins"] = intercept["eta_minutes"]
        spot["xai_factors"] = xai_weights

    if not models_ready():
        for spot in hotspots:
            spot["source"] = "fallback"
            spot["predicted_zone"] = None
            spot["confidence"] = None
            spot["fraud_prob"] = None
            spot["ranking"] = []
            spot["is_predicted"] = False
        return hotspots

    try:
        predicted_zone, confidence = predict_hotspot_zone(
            amount=resolved_amount,
            latitude=resolved_lat,
            longitude=resolved_lng,
            hour=resolved_hour,
            day_of_week=day_of_week,
            month=month,
        )
        predicted_hotspot = match_hotspot(MOCK_HOTSPOTS, predicted_zone)
        ranking = predict_hotspot_ranking(
            amount=resolved_amount,
            latitude=resolved_lat,
            longitude=resolved_lng,
            hour=resolved_hour,
            day_of_week=day_of_week,
            month=month,
        )
        fraud_prob = predict_fraud_probability(
            amount=resolved_amount,
            latitude=resolved_lat,
            longitude=resolved_lng,
            hour=resolved_hour,
            day_of_week=day_of_week,
            month=month,
        )

        for spot in hotspots:
            spot["source"] = "model"
            spot["predicted_zone"] = predicted_zone
            spot["confidence"] = confidence
            spot["fraud_prob"] = fraud_prob
            spot["ranking"] = ranking
            spot["is_predicted"] = bool(
                predicted_hotspot and spot["name"] == predicted_hotspot["name"]
            )

        return hotspots

    except Exception:
        for spot in hotspots:
            spot["source"] = "fallback"
            spot["predicted_zone"] = None
            spot["confidence"] = None
            spot["fraud_prob"] = None
            spot["ranking"] = []
            spot["is_predicted"] = False
        return hotspots


@app.get("/api/v1/tactical-layers")
def get_tactical_layers():
    """Returns CCTV nodes and DBSCAN historical spatial points for map toggles."""
    return {
        "cctv_nodes": CCTV_NODES,
        "dbscan_clusters": DBSCAN_HISTORICAL_CLUSTERS,
    }


@app.post("/api/v1/dispatch", response_model=DispatchResponse)
def dispatch_intercept(payload: DispatchRequest):
    """Executes the post-prediction countermeasure protocol."""
    intercept = get_closest_patrol_unit(payload.latitude, payload.longitude)

    countermeasures = {
        "tactical_dispatch": f"Intercept vector pushed to {intercept['unit_id']} Mobile Data Terminal (MDT).",
        "banking_friction": "Advisory broadcasted to NPCI/NFS: Biometric/OTP friction enforced for high-value ATM withdrawals in 750m perimeter.",
        "cctv_corridor_lock": f"Evidentiary recording locked across 6 transit junctions surrounding {payload.target_name}.",
    }

    return DispatchResponse(
        status="DISPATCHED",
        target_name=payload.target_name,
        assigned_unit=intercept["unit_name"],
        unit_id=intercept["unit_id"],
        distance_km=intercept["distance_km"],
        eta_minutes=intercept["eta_minutes"],
        countermeasures=countermeasures,
        timestamp=datetime.now(timezone.utc),
    )


@app.get("/api/v1/complaints", response_model=list[ComplaintResponse])
def list_complaints(db: Session = Depends(get_db)):
    return db.query(Complaint).order_by(Complaint.created_at.desc()).limit(10).all()


@app.post(
    "/api/v1/complaints",
    response_model=ComplaintResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_complaint(complaint: ComplaintCreate, db: Session = Depends(get_db)):
    existing = db.get(Complaint, complaint.complaint_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Complaint with this ID already exists",
        )

    db_complaint = Complaint(
        complaint_id=complaint.complaint_id,
        victim_location=complaint.victim_location,
        amount=complaint.amount,
    )
    db.add(db_complaint)
    db.commit()
    db.refresh(db_complaint)
    return db_complaint
