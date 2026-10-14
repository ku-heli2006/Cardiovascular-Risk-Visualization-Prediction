from __future__ import annotations
from .base_model import BaseModel

_REGISTRY: dict[str, type[BaseModel]] = {}


def register(cls: type[BaseModel]) -> type[BaseModel]:
    _REGISTRY[cls.name] = cls
    return cls


def get_model(name: str) -> BaseModel:
    if name not in _REGISTRY:
        raise KeyError(f"Unknown model '{name}'. Available: {list_models()}")
    return _REGISTRY[name]()


def list_models() -> list[str]:
    return sorted(_REGISTRY)


def default_models() -> list[str]:
    """Models trained by default (everything except slow opt-in ones such as the tuned variants)."""
    return [n for n in sorted(_REGISTRY) if not _REGISTRY[n].opt_in]


# importing the modules triggers @register
from . import logistic_model, random_forest_model, xgboost_model  # noqa: E402,F401
from . import ensemble_model, mlp_model  # noqa: E402,F401
from . import tuned_models  # noqa: E402,F401
