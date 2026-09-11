# verify_ml.py
import sys
from pathlib import Path

import pandas as pd

# Add backend directory to sys.path
sys.path.insert(0, str(Path("backend").resolve()))

import ml_service as ml

print("Loading models...")
ml.load_hotspot_models()
print(f"Models ready: {ml.models_ready()}")
print("Model feature names:", getattr(ml.fraud_model, "feature_names_in_", None))
print("FEATURE_ORDER:", ml.FEATURE_ORDER)

test_cases = [
    {"name": "Low Risk (₹10,000 at 2 PM)", "amount": 10000, "hour": 14},
    {"name": "Medium Risk (₹48,500 at 2 PM)", "amount": 48500, "hour": 14},
    {"name": "High Risk (₹85,000 at 9 PM)", "amount": 85000, "hour": 21},
    {"name": "Critical Risk (₹120,000 at 2 AM)", "amount": 120000, "hour": 2},
]

print("\n--- ACTUAL MODEL.PKL PROBABILITY SWEEP ---")
for tc in test_cases:
    row = ml._default_feature_row(
        amount=tc["amount"],
        latitude=23.0300,
        longitude=72.5800,
        hour=tc["hour"],
    )
    df = pd.DataFrame([row])[ml.FEATURE_ORDER]
    print(f"\n[*] {tc['name']} -> feature row:")
    print(df.to_string(index=False))

    prob = ml.predict_fraud_probability(
        amount=tc["amount"],
        latitude=23.0300,
        longitude=72.5800,
        hour=tc["hour"],
    )
    proba = ml.fraud_model.predict_proba(df)
    print(f"[*] {tc['name']} -> Fraud Probability: {prob}")
    print(f"[*] {tc['name']} -> predict_proba: {proba.tolist()}")

print("\n--- TIME-ONLY VARIATION CHECK FOR ₹85,000 ---")
for h in (2, 14, 21):
    row = ml._default_feature_row(
        amount=85000,
        latitude=23.0300,
        longitude=72.5800,
        hour=h,
    )
    prob = ml.predict_fraud_probability(
        amount=85000,
        latitude=23.0300,
        longitude=72.5800,
        hour=h,
    )
    print(
        f"[*] ₹85,000 at hour {h} -> "
        f"Risk_Score={row['Risk_Score']} "
        f"Failed_Txns={row['Failed_Transaction_Count_7d']} "
        f"Prev_Fraud={row['Previous_Fraudulent_Activity']} -> {prob}"
    )
