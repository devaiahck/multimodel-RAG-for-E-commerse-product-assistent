"""
UrbanPick — Multimodal Agentic RAG E-Commerce Backend.

Endpoints:
  GET  /                              Health check
  GET  /api/v1/health                 Detailed health check (Ollama, ChromaDB)
  POST /api/v1/ingest                 Ingest a product (API-key protected if configured)
  GET  /api/v1/products               Browse products with filters, search, and pagination
  GET  /api/v1/products/{product_id}  Fetch a single product
  DELETE /api/v1/products/{product_id} Delete a product
  GET  /api/v1/categories            Get top-level categories with product counts
  DELETE /api/v1/admin/clear         Delete all products (admin only)
  POST /api/v1/search                 Multimodal search (text / image / both)
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

import httpx
import numpy as np
from fastapi import (
    FastAPI,
    HTTPException,
    File,
    UploadFile,
    Form,
    Header,
    Query,
    Depends,
    Request,
    Response,
    status,
)
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.concurrency import run_in_threadpool

from config import settings
from schemas import (
    ProductIngestSchema,
    SearchResponseSchema,
    ProductListResponseSchema,
    CategoryItemSchema,
    CreateAlertSchema,
    SendPhoneOtpSchema,
    VerifyPhoneOtpSchema,
    SimulatePriceDropSchema,
    AssistantChatRequest,
    AssistantChatResponse,
    BudgetPlanRequest,
    BudgetPlanResponse,
    UserSchema,
    UserResponseSchema,
    SignUpRequest,
    LoginRequest,
    ChangePasswordRequest,
    DeleteAccountRequest,
    CartItemPayload,
    SavedItemPayload,
    HistoryItemPayload,
    ActivityEventPayload,
    PreferencesSchema,
    PreferencesUpdatePayload,
)
from rag.encoder import MultimodalEncoder
from rag.retriever import get_retriever
from services.agent_reasoning import generate_grounded_response
from services.ollama_client import check_ollama_health
from services.shopping_assistant import ShoppingAssistant, get_catalog_suggestions
from services.budget_advisor import plan_budget
from services.alerts_db import (
    init_db,
    create_alert,
    get_user_alerts,
    delete_alert,
    delete_user_alert,
    send_phone_otp,
    verify_phone_otp,
    is_phone_verified,
)
from services.users_db import (
    init_users_db,
    check_login_rate_limit,
    record_login_attempt,
    check_signup_rate_limit,
    record_signup_attempt,
    create_user,
    get_user_by_email,
    get_user_by_id,
    update_user_password,
    delete_user_account,
    create_session,
    get_user_from_token,
    delete_session,
    get_cart_items,
    set_cart_item,
    remove_cart_item,
    get_saved_items,
    add_saved_item,
    remove_saved_item,
    get_history,
    add_history,
    get_activity,
    add_activity,
    clear_activity,
    get_preferences,
    update_preferences,
    verify_password,
)
from services.alert_checker import run_alert_check, alert_checker_loop
from services.recommender import get_recommendations, get_saved_insights



# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("urbanpick")


# ---------------------------------------------------------------------------
# Shared application objects (initialised in lifespan)
# ---------------------------------------------------------------------------

encoder: Optional[MultimodalEncoder] = None
retriever = get_retriever()
http_client: Optional[httpx.AsyncClient] = None


# ---------------------------------------------------------------------------
# Rate limiter (slowapi)
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address, default_limits=[])


async def _rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": f"Rate limit exceeded: {exc.detail}. Please slow down."},
    )


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    global encoder, http_client

    # Shared HTTP client for all image downloads (ingest).
    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(10.0, connect=5.0),
        follow_redirects=True,
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
    )

    logger.info("Initialising MultimodalEncoder (%s)...", settings.EMBEDDING_MODEL_NAME)
    try:
        encoder = MultimodalEncoder(
            model_name=settings.EMBEDDING_MODEL_NAME,
            cache_maxsize=settings.EMBEDDING_CACHE_MAXSIZE,
            cache_ttl=settings.EMBEDDING_CACHE_TTL,
        )
        logger.info("MultimodalEncoder ready (text cache: maxsize=%d, ttl=%ds).",
                    settings.EMBEDDING_CACHE_MAXSIZE, settings.EMBEDDING_CACHE_TTL)
    except Exception:
        logger.exception("CRITICAL: MultimodalEncoder failed to load.")
        raise

    logger.info("Checking Ollama health...")
    ollama_status = await check_ollama_health(settings.OLLAMA_MODEL)
    if not ollama_status["reachable"]:
        logger.warning(
            "Ollama is NOT reachable at %s. "
            "AI reasoning will fall back to the deterministic template. "
            "Start Ollama with: ollama serve",
            settings.OLLAMA_BASE_URL,
        )
    elif not ollama_status["model_available"]:
        logger.warning(
            "Ollama is running but model '%s' is not pulled. "
            "Run: ollama pull %s",
            settings.OLLAMA_MODEL,
            settings.OLLAMA_MODEL,
        )
    else:
        logger.info("Ollama + model '%s' are ready.", settings.OLLAMA_MODEL)

    # Initialise price alerts SQLite database
    logger.info("Initialising alerts SQLite database...")
    init_db()

    # Initialise users SQLite database
    logger.info("Initialising users SQLite database...")
    init_users_db()

    # Start 15-minute background alert checker loop
    checker_task = asyncio.create_task(
        alert_checker_loop(retriever, interval_seconds=15 * 60)
    )

    yield

    logger.info("UrbanPick backend shutting down.")
    checker_task.cancel()
    try:
        await checker_task
    except asyncio.CancelledError:
        pass

    if http_client:
        await http_client.aclose()
        logger.info("Shared HTTP client closed.")


# ---------------------------------------------------------------------------
# Health-check cache (15-second TTL — avoids a fresh blocking Ollama probe on
# every GET /api/v1/health while still surfacing recent status changes).
# ---------------------------------------------------------------------------

_HEALTH_TTL: float = 15.0
_health_cache: dict = {"data": None, "ts": 0.0}


async def _get_cached_ollama_health() -> dict:
    now = time.monotonic()
    if _health_cache["data"] is None or now - _health_cache["ts"] > _HEALTH_TTL:
        _health_cache["data"] = await check_ollama_health(settings.OLLAMA_MODEL)
        _health_cache["ts"] = now
    return _health_cache["data"]


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="UrbanPick — Multimodal Agentic RAG E-Commerce API",
    description=(
        "Multimodal product assistant supporting text search, image search, "
        "product filtering, AI-generated comparisons and product ingestion."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# Wire up the rate-limiter and its 429 handler.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def global_unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Never leak internal stack traces or server file paths to API clients."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(_static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=_static_dir), name="static")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def set_auth_cookie(response: Response, token: str) -> None:
    """Set the 30-day httpOnly access_token cookie."""
    response.set_cookie(
        key="access_token",
        value=token,
        max_age=30 * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    """Clear access_token cookie."""
    response.delete_cookie(
        key="access_token",
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )


def get_current_user(request: Request) -> Dict[str, Any]:
    """
    Extract active session user from access_token cookie
    (or Authorization: Bearer <token> header as fallback).
    Raises 401 if not authenticated or session expired.
    """
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalid or expired",
        )
    return user


def normalize_vector(v: List[float]) -> List[float]:
    """L2-normalize a vector to unit length."""
    arr = np.asarray(v, dtype=np.float32)
    norm = float(np.linalg.norm(arr))
    if norm > 1e-9:
        arr = arr / norm
    return arr.tolist()


def _require_encoder() -> MultimodalEncoder:
    """Dependency: return encoder, lazy-initialising if not yet created."""
    global encoder
    if encoder is None:
        try:
            encoder = MultimodalEncoder(
                model_name=settings.EMBEDDING_MODEL_NAME,
                cache_maxsize=settings.EMBEDDING_CACHE_MAXSIZE,
                cache_ttl=settings.EMBEDDING_CACHE_TTL,
            )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="MultimodalEncoder is not yet initialised. Please retry in a moment.",
            )
    return encoder


def _verify_ingest_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    """
    Dependency: require X-Api-Key matching INGEST_API_KEY.
    If INGEST_API_KEY is not set, request is refused with 403 Forbidden
    unless APP_ENV=dev is set.
    """
    configured_key = settings.INGEST_API_KEY.strip()
    app_env = getattr(settings, "APP_ENV", "dev").strip().lower()

    if not configured_key:
        if app_env == "dev":
            return  # Allowed without key only in dev mode
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ingest and admin endpoints are disabled because INGEST_API_KEY is not configured and APP_ENV is not 'dev'.",
        )

    if not x_api_key or x_api_key != configured_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Api-Key header for admin/ingestion operation.",
        )


def _validate_image_upload(contents: bytes, filename: str) -> None:
    """Raise 400 if image is empty, too large, or has an unsupported format."""
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded image is empty.",
        )

    max_bytes = int(settings.MAX_IMAGE_SIZE_MB * 1024 * 1024)
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Image exceeds the maximum allowed size of "
                f"{settings.MAX_IMAGE_SIZE_MB} MB."
            ),
        )

    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported image format '{ext}'. "
                f"Allowed: {', '.join(sorted(allowed_extensions))}."
            ),
        )


# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------


@app.get("/", status_code=status.HTTP_200_OK, tags=["Health"])
async def root_health():
    """Quick liveness check."""
    indexed = await run_in_threadpool(retriever.collection.count)
    return {
        "status": "healthy",
        "service": "UrbanPick Multimodal RAG API",
        "version": "2.0.0",
        "model_loaded": encoder is not None,
        "indexed_products": indexed,
    }


@app.get("/api/v1/health", status_code=status.HTTP_200_OK, tags=["Health"])
async def detailed_health():
    """Detailed readiness check including Ollama and ChromaDB status."""
    ollama = await _get_cached_ollama_health()
    indexed = await run_in_threadpool(retriever.collection.count)
    return {
        "status": "healthy",
        "encoder": {
            "loaded": encoder is not None,
            "model": settings.EMBEDDING_MODEL_NAME,
        },
        "chromadb": {
            "path": settings.CHROMA_DB_PATH,
            "indexed_products": indexed,
        },
        "ollama": {
            "base_url": settings.OLLAMA_BASE_URL,
            "model": settings.OLLAMA_MODEL,
            "reachable": ollama["reachable"],
            "model_available": ollama["model_available"],
            "error": ollama.get("error"),
        },
        "gemini": {
            "configured": bool(settings.GEMINI_API_KEY),
            "model": settings.GEMINI_MODEL,
        },
        "ingest_protected": bool(settings.INGEST_API_KEY.strip()),
    }


# ---------------------------------------------------------------------------
# Product ingestion
# ---------------------------------------------------------------------------


@app.post(
    "/api/v1/ingest",
    status_code=status.HTTP_201_CREATED,
    tags=["Products"],
    dependencies=[Depends(_verify_ingest_api_key)],
)
async def ingest_product(
    product: ProductIngestSchema,
    enc: MultimodalEncoder = Depends(_require_encoder),
):
    """
    Ingest (create or update) a product in the vector index.

    - Validates all fields via ProductIngestSchema.
    - Downloads and encodes the image URL if provided.
    - Combines text and image embeddings into a joint vector.
    - Uses upsert so re-ingesting the same product_id is an update, not a duplicate.
    - Protected by X-Api-Key header when INGEST_API_KEY is configured.
    """
    try:
        # Build descriptive text for text embedding.
        text_content = (
            f"{product.title} by {product.brand}. "
            f"Category: {product.category}. "
            f"Price: {product.current_price}. "
            f"Specifications: {product.specs}"
        )
        text_vector = await run_in_threadpool(enc.encode_text, text_content)

        image_vector: Optional[List[float]] = None

        if product.image_url:
            try:
                max_bytes = int(settings.MAX_IMAGE_SIZE_MB * 1024 * 1024)
                async with http_client.stream("GET", product.image_url) as resp:
                    resp.raise_for_status()
                    chunks: list[bytes] = []
                    downloaded = 0
                    async for chunk in resp.aiter_bytes(65536):
                        downloaded += len(chunk)
                        if downloaded > max_bytes:
                            raise ValueError(
                                f"Remote image exceeds {settings.MAX_IMAGE_SIZE_MB} MB limit."
                            )
                        chunks.append(chunk)
                    raw_image = b"".join(chunks)
                image_vector = await run_in_threadpool(enc.encode_image, raw_image)
                logger.info("Image encoded for product '%s'.", product.product_id)
            except Exception as img_err:
                logger.warning(
                    "Could not fetch/encode image for product '%s': %s — "
                    "using text-only embedding.",
                    product.product_id,
                    img_err,
                )

        # Fuse embeddings when both are available.
        if image_vector is not None and text_vector is not None:
            combined = (
                np.asarray(text_vector, dtype=np.float32)
                + np.asarray(image_vector, dtype=np.float32)
            )
            joint_vector = normalize_vector(combined.tolist())
            embedding_type = "multimodal"
        else:
            joint_vector = text_vector
            embedding_type = "text_only"

        if not joint_vector:
            raise ValueError("Embedding generation produced an empty vector.")

        await run_in_threadpool(
            retriever.add_product,
            product_data=product.model_dump(),
            vector=joint_vector,
        )

        logger.info(
            "Product '%s' (%s) ingested. Embedding: %s, dim: %d.",
            product.product_id,
            product.title,
            embedding_type,
            len(joint_vector),
        )

        return {
            "status": "success",
            "message": f"Product '{product.title}' ingested successfully.",
            "product_id": product.product_id,
            "embedding_type": embedding_type,
            "vector_dimension": len(joint_vector),
            "indexed_products_total": await run_in_threadpool(retriever.collection.count),
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("Error during product ingestion for '%s'.", product.product_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during product ingestion.",
        )


# ---------------------------------------------------------------------------
# Categories list
# ---------------------------------------------------------------------------

FIXED_CATEGORIES: List[str] = [
    "Clothing",
    "Shoes",
    "Watches",
    "Electronics",
    "Home",
    "Beauty",
    "Sports",
]


@app.get(
    "/api/v1/categories",
    response_model=List[CategoryItemSchema],
    tags=["Categories"],
)
async def list_categories():
    """
    Get top-level categories with product counts.

    Sorted in fixed order:
    Clothing, Shoes, Watches, Electronics, Home, Beauty, Sports,
    followed by any other categories alphabetically.
    """
    raw = await run_in_threadpool(retriever.collection.get, include=["metadatas"])
    metadatas: List[Dict[str, Any]] = raw.get("metadatas", []) or []

    counts: Dict[str, int] = {}
    for meta in metadatas:
        if not meta:
            continue
        cat_str = str(meta.get("category", "")).strip()
        if not cat_str:
            continue
        top_cat = cat_str.split(" / ")[0].strip()
        if top_cat:
            counts[top_cat] = counts.get(top_cat, 0) + 1

    result: List[Dict[str, Any]] = []

    # 1. Fixed order categories
    for fixed_cat in FIXED_CATEGORIES:
        result.append({
            "slug": fixed_cat.lower(),
            "label": fixed_cat,
            "product_count": counts.get(fixed_cat, 0),
        })

    # 2. Any additional categories found, sorted alphabetically
    other_cats = sorted(
        cat for cat in counts.keys() if cat not in FIXED_CATEGORIES
    )
    for other in other_cats:
        result.append({
            "slug": other.lower(),
            "label": other,
            "product_count": counts[other],
        })

    return result


# ---------------------------------------------------------------------------
# Browse & filter products
# ---------------------------------------------------------------------------


@app.get(
    "/api/v1/products",
    response_model=ProductListResponseSchema,
    tags=["Products"],
)
@limiter.limit(settings.SEARCH_RATE_LIMIT)
async def list_products(
    request: Request,
    category: Optional[str] = Query(None, description="Category substring filter (case-insensitive)"),
    q: Optional[str] = Query(None, description="Substring search over title, brand, and category"),
    min_price: Optional[float] = Query(None, ge=0, description="Minimum price filter (>= 0)"),
    max_price: Optional[float] = Query(None, ge=0, description="Maximum price filter (>= 0)"),
    sort: Optional[str] = Query(
        None,
        description="Sort order: 'price_asc', 'price_desc', 'rating', 'newest', 'discount'",
    ),
    limit: int = Query(20, ge=1, le=100, description="Number of items to return (1-100)"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
):
    """
    Browse and filter products from the catalog.

    Filters:
    - category: substring match (case-insensitive)
    - q: substring match across title, brand, and category (case-insensitive)
    - min_price: current_price >= min_price
    - max_price: current_price <= max_price

    Sort options:
    - price_asc: lowest price first
    - price_desc: highest price first
    - rating: highest rating first
    - newest: most recently indexed first
    - discount: highest discount percentage first
    """
    raw = await run_in_threadpool(retriever.collection.get, include=["metadatas"])
    metadatas: List[Dict[str, Any]] = raw.get("metadatas", []) or []

    filtered: List[Dict[str, Any]] = []

    cat_clean = category.strip().casefold() if category and category.strip() else None
    q_clean = q.strip().casefold() if q and q.strip() else None

    for meta in metadatas:
        if not meta:
            continue

        try:
            curr_p = float(meta.get("current_price", 0) or 0)
        except (TypeError, ValueError):
            curr_p = 0.0

        if min_price is not None and curr_p < min_price:
            continue

        if max_price is not None and curr_p > max_price:
            continue

        prod_cat = str(meta.get("category", "")).casefold()
        if cat_clean and cat_clean not in prod_cat:
            continue

        if q_clean:
            prod_title = str(meta.get("title", "")).casefold()
            prod_brand = str(meta.get("brand", "")).casefold()
            if (
                q_clean not in prod_title
                and q_clean not in prod_brand
                and q_clean not in prod_cat
            ):
                continue

        prod = dict(meta)
        for field in ("store_availability", "price_history"):
            raw_field = prod.get(field, "[]")
            try:
                prod[field] = json.loads(raw_field) if isinstance(raw_field, str) else raw_field
            except (json.JSONDecodeError, TypeError):
                prod[field] = []

        raw_credit = prod.get("image_credit")
        if raw_credit:
            try:
                prod["image_credit"] = json.loads(raw_credit) if isinstance(raw_credit, str) else raw_credit
            except (json.JSONDecodeError, TypeError):
                prod["image_credit"] = None
        else:
            prod["image_credit"] = None

        filtered.append(prod)

    # Sort
    if sort == "price_asc":
        filtered.sort(key=lambda p: (float(p.get("current_price", 0) or 0), str(p.get("product_id", ""))))
    elif sort == "price_desc":
        filtered.sort(key=lambda p: (float(p.get("current_price", 0) or 0), str(p.get("product_id", ""))), reverse=True)
    elif sort == "rating":
        filtered.sort(key=lambda p: (float(p.get("rating", 0) or 0), str(p.get("product_id", ""))), reverse=True)
    elif sort == "newest":
        filtered.sort(key=lambda p: str(p.get("indexed_at", "") or ""), reverse=True)
    elif sort == "discount":
        filtered.sort(key=lambda p: (float(p.get("discount", 0) or 0), str(p.get("product_id", ""))), reverse=True)

    total = len(filtered)
    paginated_items = filtered[offset : offset + limit]

    return {
        "items": paginated_items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ---------------------------------------------------------------------------
# Get one product
# ---------------------------------------------------------------------------


@app.get("/api/v1/products/{product_id}", tags=["Products"])
async def get_product(product_id: str):
    """Fetch a single product's stored metadata by ID."""

    product_id = product_id.strip()
    if not product_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="product_id must not be empty.",
        )

    result = await run_in_threadpool(retriever.collection.get, ids=[product_id])

    if not result.get("ids"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{product_id}' not found.",
        )

    meta = result["metadatas"][0]

    # Deserialize JSON fields for the response.
    for field in ("store_availability", "price_history"):
        raw = meta.get(field, "[]")
        try:
            meta[field] = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            meta[field] = []

    raw_credit = meta.get("image_credit")
    if raw_credit:
        try:
            meta["image_credit"] = json.loads(raw_credit) if isinstance(raw_credit, str) else raw_credit
        except (json.JSONDecodeError, TypeError):
            meta["image_credit"] = None
    else:
        meta["image_credit"] = None

    return meta


SIMILAR_MIN_PRICE_RATIO: float = 0.4


@app.get("/api/v1/products/{product_id}/similar", tags=["Products"])
async def get_similar_products(
    product_id: str,
    limit: int = Query(4, ge=1, le=20),
    cheaper: bool = Query(True),
):
    """
    Find visually/semantically similar products in the same top-level category.
    If cheaper=True, only products with current_price < this product's current_price
    and current_price >= this product's current_price * SIMILAR_MIN_PRICE_RATIO are returned.
    Excludes the product itself.
    Prefers products in the same subcategory (part after ' - ') if at least 2 match.
    If fewer than 2 results match, returns an empty list.
    """
    clean_id = product_id.strip()
    if not clean_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="product_id must not be empty.",
        )

    res = await run_in_threadpool(
        retriever.collection.get,
        ids=[clean_id],
        include=["embeddings", "metadatas"],
    )

    if not res.get("ids"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{clean_id}' not found.",
        )

    meta = res["metadatas"][0]
    embeddings = res.get("embeddings", [])

    if embeddings is not None and len(embeddings) > 0 and len(embeddings[0]) > 0:
        vector = embeddings[0]
    else:
        enc = _require_encoder()
        text_to_embed = f"{meta.get('title', '')} {meta.get('specs', '')}".strip()
        vector = enc.embed_text(text_to_embed)

    curr_price = float(meta.get("current_price", 0) or 0)
    raw_cat = str(meta.get("category", ""))
    cat_parts = raw_cat.split(" - ", 1)
    target_top_cat = cat_parts[0].strip().casefold()
    target_subcat = cat_parts[1].strip().casefold() if len(cat_parts) > 1 else ""

    title_text = meta.get("title", "")
    candidates = await run_in_threadpool(
        retriever.retrieve,
        query_vector=vector,
        top_k=50,
        query_text=title_text,
    )

    same_subcat = []
    other_subcat = []

    for p in candidates:
        p_id = str(p.get("product_id") or p.get("id") or "")
        if p_id == clean_id:
            continue

        p_cat_raw = str(p.get("category", ""))
        p_cat_parts = p_cat_raw.split(" - ", 1)
        p_top_cat = p_cat_parts[0].strip().casefold()
        if p_top_cat != target_top_cat:
            continue

        p_price = float(p.get("current_price", 0) or 0)
        if cheaper:
            min_price = curr_price * SIMILAR_MIN_PRICE_RATIO
            if p_price >= curr_price or p_price < min_price:
                continue

        p_subcat = p_cat_parts[1].strip().casefold() if len(p_cat_parts) > 1 else ""
        if target_subcat and p_subcat == target_subcat:
            same_subcat.append(p)
        else:
            other_subcat.append(p)

    if len(same_subcat) >= 2:
        ranked = same_subcat + other_subcat
    else:
        ranked = [p for p in candidates if p in same_subcat or p in other_subcat]

    similar = ranked[:limit]

    # If after these rules there are fewer than 2 results, return empty
    if len(similar) < 2:
        return []

    return similar


# ---------------------------------------------------------------------------
# Delete one product
# ---------------------------------------------------------------------------


@app.delete(
    "/api/v1/products/{product_id}",
    status_code=status.HTTP_200_OK,
    tags=["Products"],
    dependencies=[Depends(_verify_ingest_api_key)],
)
async def delete_product(product_id: str):
    """Delete a product from the vector index by ID."""

    product_id = product_id.strip()
    if not product_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="product_id must not be empty.",
        )

    deleted = await run_in_threadpool(retriever.delete_product, product_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{product_id}' not found.",
        )

    return {
        "status": "success",
        "message": f"Product '{product_id}' deleted.",
        "indexed_products_total": await run_in_threadpool(retriever.collection.count),
    }


# ---------------------------------------------------------------------------
# Admin: clear catalog
# ---------------------------------------------------------------------------


@app.delete(
    "/api/v1/admin/clear",
    status_code=status.HTTP_200_OK,
    tags=["Admin"],
    dependencies=[Depends(_verify_ingest_api_key)],
)
async def admin_clear_catalog(
    confirm: bool = Query(False, description="Must be true to execute the clear."),
):
    """
    **DANGEROUS** — Delete the entire product catalog and recreate it empty.

    Requires:
    - ``X-Api-Key`` header matching ``INGEST_API_KEY`` (when configured).
    - ``?confirm=true`` query parameter as an extra safeguard.
    """
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pass ?confirm=true to confirm catalog deletion.",
        )
    await run_in_threadpool(retriever._clear_for_tests)
    logger.warning("Admin catalog clear executed via API.")
    return {
        "status": "success",
        "message": "Product catalog cleared.",
        "indexed_products_total": await run_in_threadpool(retriever.collection.count),
    }


# ---------------------------------------------------------------------------
# Multimodal search
# ---------------------------------------------------------------------------


_PRICE_CAP_RE = re.compile(
    r"(?:under|below|less\s+than|upto|up\s+to|within|<)"  # trigger word
    r"\s*(?:rs\.?|inr|₹)?\s*"                              # optional currency
    r"([\d,]+)"                                             # the number (commas OK)
    ,
    re.IGNORECASE,
)


def _extract_price_cap(text: str) -> Optional[float]:
    """
    Parse a price ceiling from natural-language text.

    Examples:
        "yoga mat under 500"       → 500.0
        "moisturizer below Rs 300" → 300.0
        "earbuds less than 1,500"  → 1500.0
        "wireless speaker"         → None
    """
    m = _PRICE_CAP_RE.search(text)
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            pass
    return None


@app.post(
    "/api/v1/search",
    response_model=SearchResponseSchema,
    tags=["Search"],
)
@limiter.limit(settings.SEARCH_RATE_LIMIT)
async def search_products(
    request: Request,
    text_prompt: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    max_price: Optional[float] = Form(None, ge=0),
    category: Optional[str] = Form(None),
    top_k: int = Form(5, gt=0, le=100),
    enc: MultimodalEncoder = Depends(_require_encoder),
):
    """
    Search products using text, an uploaded image, or both.

    Form fields:
    - text_prompt   : natural-language query (optional if image_file provided)
    - image_file    : product image upload (optional if text_prompt provided)
    - max_price     : maximum price filter (>= 0)
    - category      : category substring filter (case-insensitive)
    - top_k         : maximum results to return (1–100, default 5)

    Similarity scores are in [0, 1] — higher is more relevant.
    """

    cleaned_prompt = text_prompt.strip() if text_prompt and text_prompt.strip() else None

    if cleaned_prompt is None and image_file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one of: text_prompt or image_file.",
        )

    # Auto-extract a price cap from the query text when the caller did not
    # supply one explicitly (e.g. "moisturizer under 500" → max_price=500).
    effective_max_price = max_price
    if effective_max_price is None and cleaned_prompt:
        effective_max_price = _extract_price_cap(cleaned_prompt)

    try:
        text_vector: Optional[List[float]] = None
        image_vector: Optional[List[float]] = None
        search_type = "text"

        # --- Encode text ---
        if cleaned_prompt:
            text_vector = await run_in_threadpool(enc.encode_text, cleaned_prompt)

        # --- Encode image ---
        if image_file is not None:
            contents = await image_file.read()
            _validate_image_upload(contents, image_file.filename or "upload.jpg")
            image_vector = await run_in_threadpool(enc.encode_image, contents)
            search_type = "image" if cleaned_prompt is None else "multimodal"

        # --- Build query vector ---
        if text_vector is not None and image_vector is not None:
            fused = (
                np.asarray(text_vector, dtype=np.float32)
                + np.asarray(image_vector, dtype=np.float32)
            )
            query_vector = normalize_vector(fused.tolist())
            query_desc = (
                f"Multimodal Search — text: '{cleaned_prompt}', "
                f"image: '{image_file.filename}'"
            )
        elif text_vector is not None:
            query_vector = text_vector
            query_desc = f"Text Search: '{cleaned_prompt}'"
        elif image_vector is not None:
            query_vector = image_vector
            query_desc = f"Image Search: '{image_file.filename}'"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not generate a query vector from the provided input.",
            )

        # --- Retrieve ---
        products = await run_in_threadpool(
            retriever.retrieve,
            query_vector=query_vector,
            top_k=top_k,
            max_price=effective_max_price,
            category=category,
            query_text=cleaned_prompt,
        )

        logger.info(
            "Search '%s' returned %d product(s) [top_k=%d, max_price=%s, category=%s].",
            query_desc,
            len(products),
            top_k,
            effective_max_price,
            category,
        )

        # --- AI Reasoning ---
        reasoning = await generate_grounded_response(
            user_query=query_desc,
            retrieved_products=products,
        )

        if not isinstance(reasoning, dict):
            reasoning = {}

        return SearchResponseSchema(
            query=query_desc,
            recommended_products=products,
            ai_analysis=reasoning.get("summary", "No analysis generated."),
            comparison_table=reasoning.get("comparison_table", []),
            total_results=len(products),
            search_type=search_type,
        )

    except HTTPException:
        raise

    except Exception:
        logger.exception("Unexpected error during search.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during search. Please retry.",
        )


# ---------------------------------------------------------------------------
# Shopping Assistant Chat
# ---------------------------------------------------------------------------

_assistant_instance: Optional[ShoppingAssistant] = None


def _get_shopping_assistant() -> ShoppingAssistant:
    global _assistant_instance
    if _assistant_instance is None:
        enc = _require_encoder()
        _assistant_instance = ShoppingAssistant(retriever=retriever, encoder=enc)
    return _assistant_instance


@app.get(
    "/api/v1/assistant/suggestions",
    response_model=List[str],
    tags=["Assistant"],
)
async def assistant_suggestions():
    """
    Return 4 dynamic query suggestion strings derived from real catalog data.
    """
    return await run_in_threadpool(get_catalog_suggestions, retriever)


@app.post(
    "/api/v1/assistant/chat",
    response_model=AssistantChatResponse,
    tags=["Assistant"],
)
@limiter.limit(settings.SEARCH_RATE_LIMIT)
async def assistant_chat(
    request: Request,
    payload: AssistantChatRequest,
):
    """
    Shopping assistant that answers questions using ONLY products in our catalog.
    Runs constraint extraction, semantic retrieval, price intelligence ranking,
    and grounded LLM generation with anti-hallucination safety checks.
    """
    assistant = _get_shopping_assistant()
    try:
        result = await assistant.chat(
            message=payload.message,
            history=payload.history,
        )
        return AssistantChatResponse(**result)
    except Exception as exc:
        logger.exception("Shopping assistant error.")
        # The endpoint must never return a 500 for assistant/LLM problems
        return AssistantChatResponse(
            answer=(
                "I am having trouble answering right now. "
                "Please try searching for specific products, brands, or budget ranges."
            ),
            products=[],
            filters_used={},
            grounded=True,
        )


# ---------------------------------------------------------------------------
# Budget Planner Endpoint
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/budget/plan",
    response_model=BudgetPlanResponse,
    tags=["Budget"],
)
@limiter.limit(settings.SEARCH_RATE_LIMIT)
async def create_budget_plan(
    request: Request,
    payload: BudgetPlanRequest,
):
    """
    Budget Advisor endpoint: deterministic budget plan based on value score,
    price fitting, rating, and buy confidence score.
    """
    res = await run_in_threadpool(
        plan_budget,
        budget=payload.budget,
        categories=payload.categories,
        mode=payload.mode,
        retriever=retriever,
    )
    return BudgetPlanResponse(**res)




# ---------------------------------------------------------------------------
# User Authentication Endpoints
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/auth/signup",
    status_code=status.HTTP_201_CREATED,
    response_model=UserResponseSchema,
    tags=["Auth"],
)
async def auth_signup(payload: SignUpRequest, request: Request, response: Response):
    """
    Register a new user account, create a 30-day session, and set an httpOnly cookie.
    Enforces rate limit of 5 signups per IP per hour.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_signup_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many signup attempts. Please try again later.",
        )

    if get_user_by_email(payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists.",
        )

    user = create_user(name=payload.name, email=payload.email, password=payload.password)
    record_signup_attempt(client_ip)
    token = create_session(user["id"])
    set_auth_cookie(response, token)
    return {"user": user}


@app.post(
    "/api/v1/auth/login",
    response_model=UserResponseSchema,
    tags=["Auth"],
)
async def auth_login(payload: LoginRequest, request: Request, response: Response):
    """
    Log into an existing account with email and password.
    Enforces rate limit of 5 failed attempts per email per 15 minutes.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not check_login_rate_limit(payload.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please try again in 15 minutes.",
        )

    user = get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        record_login_attempt(payload.email, client_ip, is_success=False)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password.",
        )

    record_login_attempt(payload.email, client_ip, is_success=True)
    token = create_session(user["id"])
    set_auth_cookie(response, token)
    return {
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "created_at": user["created_at"],
        }
    }


@app.get(
    "/api/v1/auth/me",
    response_model=UserResponseSchema,
    tags=["Auth"],
)
async def auth_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Return current authenticated user profile."""
    return {"user": current_user}


@app.post(
    "/api/v1/auth/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Auth"],
)
async def auth_logout(request: Request, response: Response):
    """Log out current user: delete session from database and clear cookie."""
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    if token:
        delete_session(token)
    clear_auth_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/api/v1/auth/change-password",
    tags=["Auth"],
)
async def auth_change_password(
    payload: ChangePasswordRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Change account password verifying the old password first."""
    full_user = get_user_by_id(current_user["id"])
    if not full_user or not verify_password(payload.old_password, full_user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password.",
        )
    update_user_password(current_user["id"], payload.new_password)
    return {"ok": True, "message": "Password changed successfully."}


@app.post(
    "/api/v1/auth/delete-account",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Auth"],
)
async def auth_delete_account(
    payload: DeleteAccountRequest,
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Permanently delete account and cascade delete cart, saved items, history,
    activity, preferences, sessions, and active price alerts.
    """
    full_user = get_user_by_id(current_user["id"])
    if not full_user or not verify_password(payload.password, full_user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password.",
        )
    delete_user_account(current_user["id"])
    clear_auth_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# User Data Endpoints (/api/v1/me/*)
# ---------------------------------------------------------------------------

@app.get("/api/v1/me/cart", tags=["User Data"])
async def me_get_cart(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch all cart items for authenticated user, enriched with product details."""
    raw_items = get_cart_items(current_user["id"])
    if not raw_items:
        return []
    pids = [it["product_id"] for it in raw_items]
    prod_map = {}
    try:
        res = await run_in_threadpool(retriever.collection.get, ids=pids)
        if res and res.get("ids"):
            for i, pid in enumerate(res["ids"]):
                meta = res["metadatas"][i] if res.get("metadatas") else {}
                prod_map[pid] = meta
    except Exception:
        pass

    enriched = []
    for it in raw_items:
        meta = prod_map.get(it["product_id"], {})
        enriched.append({
            "productId": it["product_id"],
            "product_id": it["product_id"],
            "quantity": it["quantity"],
            "qty": it["quantity"],
            "title": meta.get("title", it["product_id"]),
            "price": float(meta.get("current_price", 0.0)),
            "originalPrice": meta.get("original_price"),
            "imageUrl": meta.get("image_url", ""),
            "brand": meta.get("brand", ""),
            "category": meta.get("category", ""),
            "store": meta.get("store", ""),
        })
    return enriched


@app.post("/api/v1/me/cart", tags=["User Data"])
async def me_set_cart_item(
    payload: CartItemPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Set or update cart item quantity (or remove if 0)."""
    set_cart_item(current_user["id"], payload.product_id, payload.quantity)
    return await me_get_cart(current_user=current_user)


@app.delete("/api/v1/me/cart/{product_id}", tags=["User Data"])
async def me_delete_cart_item(
    product_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Remove item from authenticated user's cart."""
    remove_cart_item(current_user["id"], product_id)
    return await me_get_cart(current_user=current_user)


@app.get("/api/v1/me/saved", tags=["User Data"])
async def me_get_saved(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch all saved / wishlisted items for authenticated user, enriched with product details."""
    raw_items = get_saved_items(current_user["id"])
    if not raw_items:
        return []
    pids = [it["product_id"] for it in raw_items]
    prod_map = {}
    try:
        res = await run_in_threadpool(retriever.collection.get, ids=pids)
        if res and res.get("ids"):
            for i, pid in enumerate(res["ids"]):
                meta = res["metadatas"][i] if res.get("metadatas") else {}
                prod_map[pid] = meta
    except Exception:
        pass

    enriched = []
    for it in raw_items:
        meta = prod_map.get(it["product_id"], {})
        enriched.append({
            "productId": it["product_id"],
            "product_id": it["product_id"],
            "title": meta.get("title", it["product_id"]),
            "price": float(meta.get("current_price", 0.0)),
            "originalPrice": meta.get("original_price"),
            "imageUrl": meta.get("image_url", ""),
            "brand": meta.get("brand", ""),
            "category": meta.get("category", ""),
            "rating": meta.get("rating"),
            "discountPercentage": meta.get("discount"),
            "store": meta.get("store", ""),
            "savedAt": it.get("created_at"),
        })
    return enriched


@app.post("/api/v1/me/saved", tags=["User Data"])
async def me_add_saved(
    payload: SavedItemPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Add item to saved list."""
    add_saved_item(current_user["id"], payload.product_id)
    return await me_get_saved(current_user=current_user)


@app.delete("/api/v1/me/saved/{product_id}", tags=["User Data"])
async def me_delete_saved(
    product_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Remove item from saved list."""
    remove_saved_item(current_user["id"], product_id)
    return await me_get_saved(current_user=current_user)


@app.get("/api/v1/me/history", tags=["User Data"])
async def me_get_history(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch purchase or store click history for authenticated user."""
    return get_history(current_user["id"])


@app.post("/api/v1/me/history", tags=["User Data"])
async def me_add_history(
    payload: HistoryItemPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Record purchase or store click event."""
    return add_history(current_user["id"], payload.product_id, payload.store, payload.ts)


@app.get("/api/v1/me/activity", tags=["User Data"])
async def me_get_activity(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch activity stream for authenticated user."""
    return get_activity(current_user["id"])


@app.post(
    "/api/v1/me/activity",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["User Data"],
)
async def me_add_activity(
    payload: ActivityEventPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Record user activity event (ignored if personalization is paused)."""
    add_activity(
        user_id=current_user["id"],
        activity_type=payload.type,
        product_id=payload.product_id,
        category=payload.category,
        brand=payload.brand,
        query=payload.query,
        price=payload.price,
        ts=payload.ts,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete(
    "/api/v1/me/activity",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["User Data"],
)
async def me_clear_activity(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Clear all logged activity for authenticated user."""
    clear_activity(current_user["id"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/v1/me/preferences",
    response_model=PreferencesSchema,
    tags=["User Data"],
)
async def me_get_preferences(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch user personalization preferences."""
    return get_preferences(current_user["id"])


@app.put(
    "/api/v1/me/preferences",
    response_model=PreferencesSchema,
    tags=["User Data"],
)
async def me_update_preferences(
    payload: PreferencesUpdatePayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Update user personalization preferences."""
    return update_preferences(
        user_id=current_user["id"],
        favorite_categories=payload.favorite_categories,
        budget_min=payload.budget_min,
        budget_max=payload.budget_max,
        personalization_paused=payload.personalization_paused,
    )


@app.get("/api/v1/me/recommendations", tags=["User Data"])
async def me_get_recommendations(
    limit: int = Query(12, ge=1, le=50, description="Max products to recommend"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Fetch personalized product recommendations based on user activity."""
    return await run_in_threadpool(
        get_recommendations,
        user_id=current_user["id"],
        limit=limit,
    )


@app.get("/api/v1/me/saved/insights", tags=["User Data"])
async def me_get_saved_insights(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Fetch price timing insights for all saved products of authenticated user."""
    return await run_in_threadpool(
        get_saved_insights,
        user_id=current_user["id"],
    )


# ---------------------------------------------------------------------------
# Price Drop Alerts & Phone Verification
# ---------------------------------------------------------------------------


@app.post("/api/v1/alerts", status_code=status.HTTP_201_CREATED, tags=["Alerts"])
async def create_new_alert(
    payload: CreateAlertSchema,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Create a new price alert for the authenticated user.
    Requires product_id, channel ('sms', 'telegram', 'email'), destination,
    and at least one trigger condition (target_price or notify_on_good_time).
    If channel is 'sms', the phone number must have been previously verified via OTP.
    """
    if payload.channel == "sms":
        if not is_phone_verified(payload.destination):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number is not verified. Please verify your phone number with OTP first.",
            )

    alert = create_alert(
        user_email=current_user["email"],
        product_id=payload.product_id,
        target_price=payload.target_price,
        notify_on_good_time=payload.notify_on_good_time,
        channel=payload.channel,
        destination=payload.destination,
    )
    return alert


@app.get("/api/v1/alerts", tags=["Alerts"])
async def list_alerts(
    product_id: Optional[str] = Query(None, description="Optional product ID filter"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """List all active alerts for the authenticated user, optionally filtered by product_id."""
    return get_user_alerts(user_email=current_user["email"], product_id=product_id)


@app.delete("/api/v1/alerts/{alert_id}", tags=["Alerts"])
async def remove_alert(
    alert_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete (deactivate) a price alert by ID, verifying user ownership."""
    clean_id = alert_id.strip()
    if not clean_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_id must not be empty.",
        )
    success = delete_user_alert(clean_id, user_email=current_user["email"])
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert '{clean_id}' not found or already deleted.",
        )
    return {"ok": True, "message": f"Alert '{clean_id}' deleted."}


@app.post("/api/v1/phone/send-otp", tags=["Alerts"])
async def trigger_phone_otp(payload: SendPhoneOtpSchema):
    """
    Send a 6-digit OTP to a phone number.
    Rate limited to 3 sends per phone per hour.
    """
    result = send_phone_otp(payload.phone)
    if not result.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=result.get("message", "Too many OTP requests. Please wait."),
        )
    return {
        "ok": True,
        "message": "Verification code generated and sent.",
        "expires_at": result["expires_at"],
        "code": result.get("code"),  # surfaced for dev/testing convenience
    }


@app.post("/api/v1/phone/verify-otp", tags=["Alerts"])
async def confirm_phone_otp(payload: VerifyPhoneOtpSchema):
    """Verify the 6-digit OTP for a phone number."""
    result = verify_phone_otp(payload.phone, payload.code)
    if not result.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("message", "Verification failed."),
        )
    return {
        "ok": True,
        "verified": True,
        "message": result.get("message", "Phone verified successfully."),
    }


# ---------------------------------------------------------------------------
# Admin Testing / Simulation Endpoints
# ---------------------------------------------------------------------------


@app.post(
    "/api/v1/admin/simulate-price-drop",
    tags=["Admin"],
    dependencies=[Depends(_verify_ingest_api_key)],
)
async def simulate_price_drop(payload: SimulatePriceDropSchema):
    """
    Admin simulation endpoint:
    Updates current_price in ChromaDB, appends to price_history,
    and runs the alert checker immediately.
    """
    prod_id = payload.product_id.strip()
    res = await run_in_threadpool(retriever.collection.get, ids=[prod_id])
    if not res.get("ids"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{prod_id}' not found.",
        )

    meta = res["metadatas"][0]
    meta["current_price"] = payload.new_price

    raw_hist = meta.get("price_history", "[]")
    if isinstance(raw_hist, str):
        try:
            price_history = json.loads(raw_hist)
        except Exception:
            price_history = []
    elif isinstance(raw_hist, list):
        price_history = raw_hist
    else:
        price_history = []

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    price_history.append({"date": today_str, "price": payload.new_price})
    meta["price_history"] = json.dumps(price_history)

    await run_in_threadpool(retriever.collection.update, ids=[prod_id], metadatas=[meta])

    # Run alert check immediately
    notifications_sent = await run_alert_check(retriever)

    return {
        "ok": True,
        "product_id": prod_id,
        "new_price": payload.new_price,
        "notifications_sent": notifications_sent,
        "message": f"Simulated price drop to ₹{payload.new_price}. Dispatched {notifications_sent} notification(s).",
    }

