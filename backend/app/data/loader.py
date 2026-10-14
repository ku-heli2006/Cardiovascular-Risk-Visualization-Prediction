"""Load the raw Z-Alizadeh Sani file and derive binary targets."""
from __future__ import annotations
import re
from pathlib import Path
import pandas as pd
from ..config import RAW_DIR, TARGET_SOURCE_COLUMNS, TARGETS

SUPPORTED = (".csv", ".xlsx", ".xls")


def normalize(name: str) -> str:
    """'Current Smoker' -> 'currentsmoker'; 'EX-Smoker' -> 'exsmoker'; 'EF-TTE' -> 'efttе'-style key."""
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def find_raw_file(path: str | Path | None = None) -> Path:
    if path:
        return Path(path)
    files = [p for p in RAW_DIR.glob("*") if p.suffix.lower() in SUPPORTED and not p.name.startswith("~$")]
    if not files:
        raise FileNotFoundError(
            f"No dataset in {RAW_DIR}. Download 'Extention of Z-Alizadeh Sani' (UCI dataset 411; "
            "UCI spells it 'Extention') and place the .xlsx/.csv file there.")
    return max(files, key=lambda p: p.stat().st_mtime)      # newest file wins, so a freshly added file is used


def load_raw(path: str | Path | None = None) -> pd.DataFrame:
    p = find_raw_file(path)
    if p.suffix.lower() == ".csv":
        df = pd.read_csv(p)
    else:                                                    # Excel: use the largest sheet (UCI files may carry extras)
        sheets = pd.read_excel(p, sheet_name=None)
        df = max(sheets.values(), key=lambda s: s.shape[0] * s.shape[1])
    df = df.dropna(axis=1, how="all").dropna(axis=0, how="all")
    df.columns = [str(c).strip() for c in df.columns]
    df.attrs["source_file"] = str(p)
    return df


def _to_binary(series: pd.Series) -> pd.Series:
    """Map label encodings to 0/1. Accepts 0/1, Y/N, Normal/Cad, Normal/Stenotic, True/False."""
    pos = {"1", "y", "yes", "cad", "stenotic", "stenosis", "true", "abnormal", "positive"}
    neg = {"0", "n", "no", "normal", "false", "negative"}

    def f(v):
        if pd.isna(v):
            return pd.NA
        s = str(v).strip().lower()
        if s.endswith(".0"):
            s = s[:-2]
        if s in pos:
            return 1
        if s in neg:
            return 0
        raise ValueError(f"Unrecognised label value: {v!r}")

    return series.map(f).astype("Int64")


def build_targets(df: pd.DataFrame) -> pd.DataFrame:
    """One 0/1 column per AVAILABLE target. CAD is mandatory; vessel targets are skipped if absent."""
    lookup = {normalize(c): c for c in df.columns}
    out, used = {}, {}
    for t in TARGETS:
        cands = TARGET_SOURCE_COLUMNS[t]
        cands = [cands] if isinstance(cands, str) else list(cands)
        present = [lookup[normalize(c)] for c in cands if normalize(c) in lookup]
        if not present:
            if t == "cad":
                raise KeyError(f"No overall-CAD label column found (looked for {cands}). Columns: {list(df.columns)}")
            continue          # vessel labels absent (original, non-extension dataset): train what we can
        out[t] = _to_binary(df[present[0]])
        used[t] = present[0]
        if len(present) > 1:  # e.g. both Cath and CAD exist: keep the first, but flag any disagreement
            alt = _to_binary(df[present[1]])
            used[t + "_disagrees_with_" + present[1]] = int((out[t] != alt).sum())
    res = pd.DataFrame(out, index=df.index)
    res.attrs["label_columns"] = used
    return res
