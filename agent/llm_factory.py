import os
import re
from langchain_openai import ChatOpenAI


def _is_reasoning_model(model: str) -> bool:
    """o-series models (o1, o3, o4-mini, o4.5 …) reject the temperature parameter."""
    return bool(re.match(r"^o\d", model.lower()))


def create_llm(model: str = None, temperature: float = 0.2):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    resolved = model or os.getenv("OPENAI_MODEL", "gpt-5.4")

    kwargs: dict = {"model": resolved, "api_key": api_key}
    if not _is_reasoning_model(resolved):
        kwargs["temperature"] = temperature

    return ChatOpenAI(**kwargs)
