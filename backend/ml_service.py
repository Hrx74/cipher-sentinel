from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent


def _resolve_model_path(filename: str) -> Path:
    # Check backend directory first, then root directory, then ML/ directory
    candidates = [
        CURRENT_DIR / filename,
        PROJECT_ROOT / filename,
        PROJECT_ROOT / "ML" / filename,
        CURRENT_DIR / "ML" / filename,
    ]
    for p in candidates:
        if p.exists():
            return p
    return CURRENT_DIR / filename


MODEL_PATH = _resolve_model_path("model.pkl")
HOTSPOT_MODEL_PATH = _resolve_model_path("hotspot_model.pkl")
HOTSPOT_ENCODER_PATH = _resolve_model_path("hotspot_encoder.pkl")
FRAUD_MODEL_PATH = _resolve_model_path("model.pkl")

ZONE_TO_HOTSPOT_NAME = {
    "Ashram Road Financial Hub": "Ashram Road",
    "CG Road (Navrangpura)": "CG Road",
    "Prahlad Nagar Corporate Rd": "Prahlad Nagar",
    "SG Highway (Sindhu Bhavan)": "SG Highway",
}

FEATURE_ORDER = [
    "Transaction_Amount",
    "Account_Balance",
    "IP_Address_Flag",
    "Previous_Fraudulent_Activity",
    "Daily_Transaction_Count",
    "Avg_Transaction_Amount_7d",
    "Failed_Transaction_Count_7d",
    "Card_Age",
    "Transaction_Distance",
    "Risk_Score",
    "Is_Weekend",
    "Latitude",
    "Longitude",
    "Hour",
    "DayOfWeek",
    "Month",
]

hotspot_model = None
hotspot_encoder = None
fraud_model = None
model_load_error: str | None = None


def load_hotspot_models() -> None:
    global hotspot_model, hotspot_encoder, fraud_model, model_load_error

    try:
        hotspot_model = joblib.load(HOTSPOT_MODEL_PATH)
        hotspot_encoder = joblib.load(HOTSPOT_ENCODER_PATH)
        fraud_model = joblib.load(FRAUD_MODEL_PATH)
        model_load_error = None
    except Exception as exc:
        hotspot_model = None
        hotspot_encoder = None
        fraud_model = None
        model_load_error = str(exc)


def models_ready() -> bool:
    return (
        hotspot_model is not None
        and hotspot_encoder is not None
        and fraud_model is not None
    )


def match_hotspot(mock_hotspots: list[dict], zone_name: str) -> dict | None:
    hotspot_name = ZONE_TO_HOTSPOT_NAME.get(zone_name, zone_name)
    for hotspot in mock_hotspots:
        if hotspot["name"] == hotspot_name:
            return hotspot
    return None


def _default_feature_row(
    amount: float,
    latitude: float,
    longitude: float,
    hour: int | None = None,
    day_of_week: int | None = None,
    month: int | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    resolved_hour = int(hour if hour is not None else now.hour)
    resolved_amount = float(amount)

    # Dynamically derive historical telemetry based on incident severity
    # Lower amount & daytime = clean baseline profile
    # High amount & night = anomalous syndicate profile
    is_night = resolved_hour >= 23 or resolved_hour <= 5
    is_evening = 19 <= resolved_hour < 23

    # Continuous Risk_Score: 0.12 (benign) to 0.94 (critical)
    amt_ratio = min(max((resolved_amount - 10000.0) / 140000.0, 0.0), 1.0)
    risk_score = round(
        0.15
        + (0.55 * amt_ratio)
        + (0.22 if is_night else (0.10 if is_evening else 0.0)),
        3,
    )
    risk_score = min(max(risk_score, 0.05), 0.98)

    # Failed attempts: 0 for minor daytime, up to 4 for high-value off-peak
    if amt_ratio > 0.6 and is_night:
        failed_count = 4
    elif amt_ratio > 0.4 or is_night or is_evening:
        failed_count = 2
    elif amt_ratio > 0.2:
        failed_count = 1
    else:
        failed_count = 0

    prev_fraud = 1 if (amt_ratio > 0.45 or is_night) else 0
    daily_txns = int(2 + (6 * amt_ratio) + (2 if is_night else 0))
    distance = round(25.0 + (1400.0 * amt_ratio), 1)

    return {
        "Transaction_Amount": resolved_amount,
        "Account_Balance": round(max(5000.0, 150000.0 - (resolved_amount * 0.8)), 2),
        "IP_Address_Flag": 1 if (is_night and amt_ratio > 0.5) else 0,
        "Previous_Fraudulent_Activity": prev_fraud,
        "Daily_Transaction_Count": daily_txns,
        "Avg_Transaction_Amount_7d": round(
            resolved_amount * (0.4 if amt_ratio > 0.5 else 0.9), 2
        ),
        "Failed_Transaction_Count_7d": failed_count,
        "Card_Age": 180 if amt_ratio < 0.5 else 32,
        "Transaction_Distance": distance,
        "Risk_Score": risk_score,
        "Is_Weekend": (
            1 if (day_of_week if day_of_week is not None else now.weekday()) >= 5 else 0
        ),
        "Latitude": float(latitude),
        "Longitude": float(longitude),
        "Hour": resolved_hour,
        "DayOfWeek": int(day_of_week if day_of_week is not None else now.weekday()),
        "Month": int(month if month is not None else now.month),
    }


def _feature_dataframe(
    *,
    amount: float,
    latitude: float,
    longitude: float,
    hour: int | None = None,
    day_of_week: int | None = None,
    month: int | None = None,
) -> pd.DataFrame:
    record = _default_feature_row(
        amount=amount,
        latitude=latitude,
        longitude=longitude,
        hour=hour,
        day_of_week=day_of_week,
        month=month,
    )
    return pd.DataFrame([record], columns=FEATURE_ORDER)


def predict_hotspot_zone(
    *,
    amount: float,
    latitude: float,
    longitude: float,
    hour: int | None = None,
    day_of_week: int | None = None,
    month: int | None = None,
) -> tuple[str, float]:
    if not models_ready():
        raise RuntimeError(model_load_error or "Hotspot model is not loaded")

    X = _feature_dataframe(
        amount=amount,
        latitude=latitude,
        longitude=longitude,
        hour=hour,
        day_of_week=day_of_week,
        month=month,
    )

    prediction = hotspot_model.predict(X)[0]
    probabilities = hotspot_model.predict_proba(X)[0]
    zone_name = hotspot_encoder.inverse_transform([prediction])[0]
    confidence = float(probabilities[prediction])
    return zone_name, confidence


def predict_hotspot_ranking(
    *,
    amount: float,
    latitude: float,
    longitude: float,
    hour: int | None = None,
    day_of_week: int | None = None,
    month: int | None = None,
) -> list[dict]:
    if not models_ready():
        raise RuntimeError(model_load_error or "Hotspot model is not loaded")

    X = _feature_dataframe(
        amount=amount,
        latitude=latitude,
        longitude=longitude,
        hour=hour,
        day_of_week=day_of_week,
        month=month,
    )

    probabilities = hotspot_model.predict_proba(X)[0]
    hotspot_names = hotspot_encoder.classes_
    ranked = sorted(
        zip(hotspot_names, probabilities), key=lambda pair: pair[1], reverse=True
    )
    return [
        {"hotspot": str(name), "probability": float(probability)}
        for name, probability in ranked
    ]


def predict_fraud_probability(
    *,
    amount: float,
    latitude: float,
    longitude: float,
    hour: int | None = None,
    day_of_week: int | None = None,
    month: int | None = None,
) -> float:
    if not models_ready():
        # Fallback heuristic if .pkl is missing
        ratio = min(max((amount - 10000.0) / 140000.0, 0.0), 1.0)
        return round(0.18 + 0.75 * ratio, 3)

    row = _default_feature_row(
        amount,
        latitude,
        longitude,
        hour,
        day_of_week,
        month,
    )
    df = pd.DataFrame([row])[FEATURE_ORDER]
    proba = fraud_model.predict_proba(df)[:, 1]
    return round(float(proba[0]), 3)
