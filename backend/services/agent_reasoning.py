"""
Grounded generation service — the "G" in RAG.

Takes the products already returned by VectorRetriever and asks the LLM to
reason ONLY over that evidence. This is the piece main.py imports.

LLM priority:
  1. Ollama (Qwen3:8B) running locally — always tried first.
  2. Gemini — used if GEMINI_API_KEY is set and Ollama fails.
  3. Deterministic template fallback — used when both LLMs are unavailable.

Design goal (Hallucination Control):
  - The LLM is given retrieved_products as its *only* source of product facts.
  - It must say when a field isn't present rather than invent it.
  - Falls back gracefully so ingestion/retrieval tests work without any LLM.
"""

import json
import logging
from typing import List, Dict, Any, Optional

from config import settings
from services.ollama_client import generate_text as ollama_generate
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional Gemini setup
# ---------------------------------------------------------------------------

_gemini_model = None
if settings.GEMINI_API_KEY:
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        _gemini_model = genai.GenerativeModel(settings.GEMINI_MODEL)
        logger.info("Gemini model '%s' configured as secondary LLM.", settings.GEMINI_MODEL)
    except Exception as _gemini_err:
        logger.warning("Could not initialize Gemini: %s", _gemini_err)


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

SYSTEM_INSTRUCTIONS = """\
You are UrbanPick's shopping assistant. You answer ONLY using the
PRODUCT CONTEXT provided below — never your own prior knowledge of these products.

Rules:
1. Every factual claim (price, spec, rating, brand) must come from PRODUCT CONTEXT.
2. If a detail the user asked about isn't present in PRODUCT CONTEXT, say plainly
   that the retrieved data doesn't include it. Do not guess or estimate it.
3. Be concise, comparative, and helpful — explain WHY a product fits the query.
4. Respond with STRICT JSON only — no markdown fences, no prose outside it.
   Use exactly this shape:
{
  "summary": "<2-4 sentence grounded answer>",
  "comparison_table": [
    {"product_id": "...", "title": "...", "price": 0, "key_points": ["...", "..."]}
  ]
}
Do NOT include ```json or ``` in your response. Output raw JSON only.\
"""


def _build_context(retrieved_products: List[Dict[str, Any]]) -> str:
    if not retrieved_products:
        return "No products were retrieved for this query."

    blocks = []
    for p in retrieved_products:
        blocks.append(
            f"- product_id: {p.get('product_id')}\n"
            f"  title: {p.get('title')}\n"
            f"  brand: {p.get('brand')}\n"
            f"  price: {p.get('current_price')}\n"
            f"  rating: {p.get('rating', 'not available')}\n"
            f"  specs: {p.get('specs', 'not available')}\n"
            f"  similarity_score: {p.get('similarity_score', 'n/a')}"
        )
    return "\n".join(blocks)


def _parse_llm_json(raw_text: str) -> Dict[str, Any]:
    """Strip markdown fences and parse JSON from LLM output."""
    text = raw_text.strip()
    # Remove common markdown fence patterns
    for prefix in ("```json", "```"):
        if text.startswith(prefix):
            text = text[len(prefix):]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    parsed = json.loads(text)
    if "summary" not in parsed or "comparison_table" not in parsed:
        raise ValueError("LLM response missing 'summary' or 'comparison_table' keys.")
    return parsed


# ---------------------------------------------------------------------------
# Fallback (no LLM)
# ---------------------------------------------------------------------------


def _fallback_response(retrieved_products: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Deterministic, template-based grounding used when no LLM is available.
    Only echoes fields present in retrieved_products — no hallucination."""
    if not retrieved_products:
        return {
            "summary": "No matching products were found in the current catalog for this query.",
            "comparison_table": [],
        }

    top = retrieved_products[0]
    price_str = (
        f"₹{top['current_price']:,.0f}"
        if top.get("current_price") is not None
        else "price not listed"
    )
    summary = (
        f"Based on the retrieved catalog data, '{top.get('title', 'the top match')}' "
        f"is the closest match at {price_str}. "
        f"{len(retrieved_products)} product(s) matched your query overall."
    )
    table = [
        {
            "product_id": p.get("product_id"),
            "title": p.get("title"),
            "price": p.get("current_price"),
            "key_points": [
                f"Brand: {p.get('brand', 'not available')}",
                f"Category: {p.get('category', 'not available')}",
                f"Specs: {p.get('specs', 'not available')}",
                f"Rating: {p.get('rating', 'not available')}",
                f"Score: {p.get('similarity_score', 'n/a')}",
            ],
        }
        for p in retrieved_products
    ]
    return {"summary": summary, "comparison_table": table}


# ---------------------------------------------------------------------------
# Ollama generation
# ---------------------------------------------------------------------------


async def _ollama_response(
    user_query: str, retrieved_products: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """Try Ollama (Qwen3:8B). Returns parsed dict or None on failure."""
    context = _build_context(retrieved_products)
    prompt = (
        f"USER QUERY:\n{user_query}\n\n"
        f"PRODUCT CONTEXT:\n{context}\n\n"
        "JSON RESPONSE:"
    )
    try:
        raw = await ollama_generate(prompt=prompt, system=SYSTEM_INSTRUCTIONS, timeout=5)
        return _parse_llm_json(raw)
    except Exception as exc:
        logger.warning("Ollama generation/parsing failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Gemini generation
# ---------------------------------------------------------------------------


async def _gemini_response(
    user_query: str, retrieved_products: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """Try Gemini (sync SDK). Returns parsed dict or None on failure."""
    if _gemini_model is None:
        return None

    context = _build_context(retrieved_products)
    prompt = (
        f"{SYSTEM_INSTRUCTIONS}\n\n"
        f"USER QUERY:\n{user_query}\n\n"
        f"PRODUCT CONTEXT:\n{context}\n\n"
        "JSON RESPONSE:"
    )
    try:
        # Gemini SDK is synchronous — offload to thread pool.
        response = await run_in_threadpool(_gemini_model.generate_content, prompt)
        return _parse_llm_json(response.text)
    except Exception as exc:
        logger.warning("Gemini generation/parsing failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


async def generate_grounded_response(
    user_query: str,
    retrieved_products: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Generate a grounded recommendation.

    Priority: Ollama → Gemini → deterministic fallback.

    :param user_query: The original (or reformulated) user query/description.
    :param retrieved_products: Output of VectorRetriever.retrieve() — the ONLY
        allowed source of product facts for the LLM.
    :returns: Dict with 'summary' (str) and 'comparison_table' (list[dict]).
    """
    # 1. Try Ollama
    result = await _ollama_response(user_query, retrieved_products)
    if result is not None:
        logger.info("Response generated by Ollama (%s).", settings.OLLAMA_MODEL)
        return result

    # 2. Try Gemini
    result = await _gemini_response(user_query, retrieved_products)
    if result is not None:
        logger.info("Response generated by Gemini (%s).", settings.GEMINI_MODEL)
        return result

    # 3. Deterministic fallback
    logger.warning(
        "Both Ollama and Gemini unavailable — using deterministic fallback response."
    )
    return _fallback_response(retrieved_products)
