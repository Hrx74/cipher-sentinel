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
