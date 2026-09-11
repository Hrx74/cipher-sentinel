from datetime import datetime, timezone
from pathlib import Path

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
    *,
    amount: float,
    latitude: float,
    longitude: float,
    hour: int | None = None,
    day_of_week: int | None = None,
    month: int | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "Transaction_Amount": float(amount),
        "Account_Balance": 25000.0,
        "IP_Address_Flag": 0,
        "Previous_Fraudulent_Activity": 1,
        "Daily_Transaction_Count": 5,
        "Avg_Transaction_Amount_7d": float(amount),
        "Failed_Transaction_Count_7d": 3,
        "Card_Age": 120,
        "Transaction_Distance": 1200.0,
        "Risk_Score": 0.78,
        "Is_Weekend": 1 if now.weekday() >= 5 else 0,
        "Latitude": float(latitude),
        "Longitude": float(longitude),
        "Hour": int(hour if hour is not None else now.hour),
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
        raise RuntimeError(model_load_error or "Hotspot model is not loaded")

    X = _feature_dataframe(
        amount=amount,
        latitude=latitude,
        longitude=longitude,
        hour=hour,
        day_of_week=day_of_week,
        month=month,
    )

    probabilities = fraud_model.predict_proba(X)[0]
    fraud_index = 1 if len(probabilities) > 1 else 0
    return float(probabilities[fraud_index])
