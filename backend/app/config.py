"""Central configuration. Change targets/features here, not in the code."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"

RANDOM_SEED = 42
CV_FOLDS = 5
CV_REPEATS = 3

TARGETS = ["cad", "lad", "lcx", "rca"]

# Columns that must NEVER reach a model (compared after name normalisation).
# "CAD" is included because the Extension file may carry the overall label under that name as well as "Cath".
LEAKAGE_COLUMNS = ["LAD", "LCX", "RCA", "Cath", "CAD"]

# Raw label column -> target name. CAD is derived from Cath (label only, never an input).
# A target may list several candidate source columns; the first one present in the file is used.
TARGET_SOURCE_COLUMNS = {"cad": ["Cath", "CAD"], "lad": ["LAD"], "lcx": ["LCX"], "rca": ["RCA"]}

# Explicit grouping matched on normalised names. Columns not listed are reported as
# "uncategorized" so nothing is silently invented or dropped.
FEATURE_GROUPS = {
    "demographic": ["Age", "Weight", "Length", "Sex", "BMI"],
    "clinical": ["DM", "HTN", "CurrentSmoker", "EXSmoker", "FH", "Obesity", "CRF", "CVA",
                 "AirwayDisease", "ThyroidDisease", "CHF", "DLP", "BP", "PR", "Edema",
                 "WeakPeripheralPulse", "LungRales", "SystolicMurmur", "DiastolicMurmur",
                 "TypicalChestPain", "Dyspnea", "FunctionClass", "Atypical", "Nonanginal",
                 "ExertionalCP", "LowTHAng"],
    "laboratory": ["FBS", "CR", "TG", "LDL", "HDL", "BUN", "ESR", "HB", "K", "Na", "WBC",
                   "Lymph", "Neut", "PLT"],
    "ecg": ["QWave", "StElevation", "StDepression", "Tinversion", "LVH", "PoorRProgression", "BBB"],
    "echocardiography": ["EFTTE", "RegionRWMA", "VHD"],
}
