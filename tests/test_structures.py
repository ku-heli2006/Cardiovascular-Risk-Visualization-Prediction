"""The 3D explorer links anatomy to dataset measurements. Every linked measurement must be a REAL column
(names taken from the user's actual file), and the wording must not claim diagnosis or localisation."""
import json
from pathlib import Path

from test_partial_targets import REAL_COLS

CATALOG = Path(__file__).resolve().parents[1] / "frontend/src/components3d/HeartModel/structures.json"
FEATURES = {c for c in REAL_COLS if c != "Cath"}
LEAK = {"LAD", "LCX", "RCA", "Cath"}


def load():
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def test_ids_unique_and_required_fields():
    ids = [s["id"] for s in load()]
    assert len(ids) == len(set(ids))
    for s in load():
        assert s["name"] and len(s["role"]) > 40 and s["group"]
        assert {"lad", "lcx", "rca", "sa_node", "av_node", "his", "lv", "rv"} <= set(ids)


def test_every_linked_measurement_is_a_real_column_and_never_a_leak_column():
    for s in load():
        for f in s["findings"] + s.get("riskFactors", []):
            assert f in FEATURES, f"{s['id']}: '{f}' is not a column in the dataset"
            assert f not in LEAK


def test_no_diagnostic_or_treatment_claims():
    text = " ".join(s["role"] + " " + s.get("note", "") for s in load()).lower()
    for bad in ("diagnos", "treatment", "you have", "guarantee", "prescri"):
        assert bad not in text, bad


def test_coronary_notes_say_they_cannot_localise_disease():
    for s in load():
        if s["group"] == "coronary":
            assert "cannot place disease" in s["note"]
