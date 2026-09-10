import pandas as pd
import joblib


# ==========================================
# LOAD TRAINED MODELS
# ==========================================

fraud_model = joblib.load("model.pkl")
hotspot_model = joblib.load("hotspot_model.pkl")
hotspot_encoder = joblib.load("hotspot_encoder.pkl")


# ==========================================
# FEATURES USED DURING TRAINING
# ==========================================

fraud_features = [
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
    "Month"
]

zone_features = [
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
    "Month"
]


# ==========================================
# PREDICTION FUNCTION
# ==========================================

def predict_transaction(transaction_data):

    # Convert dictionary into DataFrame
    input_df = pd.DataFrame([transaction_data])

    # Keep the same feature order used during training
    X_fraud = input_df[fraud_features]
    X_hotspot = input_df[zone_features]

    # ==========================================
    # FRAUD PREDICTION
    # ==========================================

    fraud_prediction = fraud_model.predict(X_fraud)[0]

    fraud_probability = fraud_model.predict_proba(
        X_fraud
    )[0][1]

    # ==========================================
    # HOTSPOT PREDICTION
    # ==========================================

    hotspot_prediction = hotspot_model.predict(X_hotspot)[0]

    predicted_hotspot = hotspot_encoder.inverse_transform(
        [hotspot_prediction]
    )[0]

    # ==========================================
    # HOTSPOT PROBABILITIES
    # ==========================================

    hotspot_probabilities = hotspot_model.predict_proba(
        X_hotspot
    )[0]

    hotspot_names = hotspot_encoder.classes_

    hotspot_ranking = sorted(
        zip(hotspot_names, hotspot_probabilities),
        key=lambda x: x[1],
        reverse=True
    )

    hotspot_ranking = [
        {
            "hotspot": name,
            "probability": float(probability)
        }
        for name, probability in hotspot_ranking
    ]

    # ==========================================
    # FINAL RESULT
    # ==========================================

    result = {
        "fraud_prediction": int(fraud_prediction),
        "fraud_probability": float(fraud_probability),
        "predicted_hotspot": predicted_hotspot,
        "hotspot_ranking": hotspot_ranking
    }

    return result