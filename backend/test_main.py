import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def test_hotspots_endpoint_enriches_response_with_model_prediction(monkeypatch):
    """The hotspot list should become model-traceable when the trained model is ready."""
    monkeypatch.setattr(main, "models_ready", lambda: True)
    monkeypatch.setattr(
        main,
        "predict_hotspot_zone",
        lambda **kwargs: ("CG Road (Navrangpura)", 0.90),
    )
    monkeypatch.setattr(
        main, "match_hotspot", lambda mock_hotspots, zone_name: mock_hotspots[0]
    )

    response = client.get("/api/v1/hotspots")

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert len(payload) >= 1
    assert payload[0]["source"] == "model"
    assert payload[0]["predicted_zone"] == "CG Road (Navrangpura)"
    assert payload[0]["confidence"] == 0.90


def test_hotspots_endpoint_exposes_fraud_probability_and_ranking(monkeypatch):
    """The route should carry fraud probability and the ordered hotspot ranking list."""
    monkeypatch.setattr(main, "models_ready", lambda: True)
    monkeypatch.setattr(
        main,
        "predict_hotspot_zone",
        lambda **kwargs: ("CG Road (Navrangpura)", 0.90),
    )
    monkeypatch.setattr(
        main, "match_hotspot", lambda mock_hotspots, zone_name: mock_hotspots[0]
    )
    monkeypatch.setattr(
        main,
        "predict_hotspot_ranking",
        lambda **kwargs: [
            {"hotspot": "CG Road (Navrangpura)", "probability": 0.91},
            {"hotspot": "Ashram Road Financial Hub", "probability": 0.88},
        ],
    )
    monkeypatch.setattr(main, "predict_fraud_probability", lambda **kwargs: 0.73)

    response = client.get(
        "/api/v1/hotspots?amount=5000&latitude=23.0305&longitude=72.5570"
    )

    assert response.status_code == 200
    payload = response.json()
    ranked = payload[0].get("ranking")
    assert isinstance(ranked, list)
    assert ranked[0]["hotspot"] == "CG Road (Navrangpura)"
    assert payload[0]["fraud_prob"] == 0.73


def test_trace_predict_decouples_victim_and_returns_terminal_mule(monkeypatch):
    """Verifies that the victim is decoupled and terminal node is in Ahmedabad."""
    monkeypatch.setattr(main, "models_ready", lambda: True)
    monkeypatch.setattr(
        main,
        "predict_hotspot_zone",
        lambda **kwargs: ("Ashram Road Financial Hub", 0.94),
    )
    monkeypatch.setattr(
        main,
        "predict_hotspot_ranking",
        lambda **kwargs: [
            {"hotspot": "Ashram Road Financial Hub", "probability": 0.94},
            {"hotspot": "CG Road (Navrangpura)", "probability": 0.04},
        ],
    )
    monkeypatch.setattr(main, "predict_fraud_probability", lambda **kwargs: 0.99)

    response = client.post(
        "/api/v1/trace-predict",
        json={"transaction_id": "TXN-8492", "amount": 85000, "hour": 21},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["latest_known_node"] == "Ahmedabad"
    assert data["fund_flow"] == ["Mumbai", "Delhi", "Ahmedabad"]
    assert data["terminal_ifsc"] == "SBIN0001234"
    assert data["predicted_hotspot"] == "Ashram Road Financial Hub"
    assert data["fraud_prob"] >= 0.90
