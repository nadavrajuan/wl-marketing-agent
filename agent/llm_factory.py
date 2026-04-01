import os
from langchain_openai import ChatOpenAI


def create_llm(model: str = None, temperature: float = 0.2):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    resolved_model = model or os.getenv("OPENAI_MODEL", "gpt-4o")
    return ChatOpenAI(
        model=resolved_model,
        temperature=temperature,
        api_key=api_key,
    )
