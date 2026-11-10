"""
Pydantic Schemas for Multimodal Agentic RAG E-Commerce Platform.

Validation rules:
- Required fields: product_id, title, brand, specs, current_price
- Numeric ranges: price >= 0, rating 0–5, discount 0–100
- String guards: no empty / placeholder values for critical fields
- image_url: optional (download may fail gracefully)
"""

import re
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PLACEHOLDER_PATTERNS = re.compile(
    r"^(string|none|null|undefined|test|placeholder|example|sample|n/a|na)$",
    re.IGNORECASE,
)


def _reject_placeholder(value: str, field_name: str) -> str:
    """Reject obviously invalid placeholder strings."""
    stripped = value.strip()
    if not stripped:
        raise ValueError(f"'{field_name}' must not be empty.")
    if _PLACEHOLDER_PATTERNS.match(stripped):
        raise ValueError(
            f"'{field_name}' looks like a placeholder value ('{stripped}'). "
            "Please provide a real value."
        )
    return stripped


# ---------------------------------------------------------------------------
# Sub-schemas
# ---------------------------------------------------------------------------


class StorePrice(BaseModel):
    store: str = Field(..., description="Store name (Amazon, Flipkart, Nykaa, etc.)")
    price: float = Field(..., ge=0, description="Current price at the store")
    url: str = Field(..., description="Product URL at the store")

    @field_validator("store")
    @classmethod
    def validate_store(cls, v: str) -> str:
        return _reject_placeholder(v, "store")


# ---------------------------------------------------------------------------
# Product Ingest Schema
# ---------------------------------------------------------------------------


class ProductIngestSchema(BaseModel):

    # ── Basic Info ──────────────────────────────────────────────────────────

    product_id: str = Field(..., description="Unique Product ID (UUID or slug)")
    title: str = Field(..., min_length=3, description="Product title")
    brand: str = Field(..., min_length=1, description="Brand name")
    category: Optional[str] = Field(default="", description="Product category")
    specs: str = Field(..., min_length=5, description="Product specifications")

    # ── Image ───────────────────────────────────────────────────────────────

    image_url: Optional[str] = Field(
        default=None,
        description="Main product image URL (optional; image download is best-effort)",
    )
    image_credit: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional image attribution/credit details (e.g. source, photographer)",
    )

    # ── Pricing ─────────────────────────────────────────────────────────────

    current_price: float = Field(..., ge=0, description="Current selling price (>= 0)")
    original_price: Optional[float] = Field(default=None, ge=0, description="Original / MRP price")
    discount: Optional[float] = Field(
        default=None,
        ge=0,
        le=100,
        description="Discount percentage (0–100)",
    )

    # ── Rating & Availability ───────────────────────────────────────────────

    rating: Optional[float] = Field(
        default=None,
        ge=0,
        le=5,
        description="Average rating (0–5)",
    )
    availability: Optional[str] = Field(
        default="In Stock",
        description="Stock status (In Stock / Out of Stock / etc.)",
    )
    store: Optional[str] = Field(default="", description="Primary store name")

    # ── Multi-store prices ──────────────────────────────────────────────────

    store_availability: List[StorePrice] = Field(
        default_factory=list,
        description="Prices and links from multiple stores",
    )

    # ── Price history ───────────────────────────────────────────────────────

    price_history: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Historical price records [{date, price}]",
    )

    # ── Validators ──────────────────────────────────────────────────────────

    @field_validator("product_id")
    @classmethod
    def validate_product_id(cls, v: str) -> str:
        return _reject_placeholder(v, "product_id")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        return _reject_placeholder(v, "title")

    @field_validator("brand")
    @classmethod
    def validate_brand(cls, v: str) -> str:
        return _reject_placeholder(v, "brand")

    @field_validator("specs")
    @classmethod
    def validate_specs(cls, v: str) -> str:
        return _reject_placeholder(v, "specs")

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v.strip() == "":
            return None
        v = v.strip()
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("image_url must be a valid HTTP/HTTPS URL.")
        return v

    @model_validator(mode="after")
    def derive_discount(self) -> "ProductIngestSchema":
        """Auto-compute discount if original_price is given but discount is not."""
        if (
            self.discount is None
            and self.original_price is not None
            and self.original_price > 0
            and self.current_price < self.original_price
        ):
            self.discount = round(
                (self.original_price - self.current_price) / self.original_price * 100,
                2,
            )
        return self


# ---------------------------------------------------------------------------
# Search Response Schema
# ---------------------------------------------------------------------------


class SearchResponseSchema(BaseModel):
    query: str = Field(..., description="Original user query or description")
    recommended_products: List[Dict[str, Any]] = Field(
        ..., description="Retrieved & ranked product list"
    )
    ai_analysis: str = Field(..., description="AI-generated grounded recommendation")
    comparison_table: List[Dict[str, Any]] = Field(
        ..., description="Structured side-by-side comparison"
    )
    total_results: int = Field(default=0, description="Number of products returned")
    search_type: str = Field(
        default="text",
        description="Search modality: 'text', 'image', or 'multimodal'",
    )


# ---------------------------------------------------------------------------
# Browse & Category Schemas
# ---------------------------------------------------------------------------


class ProductListResponseSchema(BaseModel):
    items: List[Dict[str, Any]] = Field(..., description="Paginated list of product items")
    total: int = Field(..., description="Total count matching filters before pagination")
    limit: int = Field(..., description="Limit of items returned")
    offset: int = Field(..., description="Offset used for pagination")


class CategoryItemSchema(BaseModel):
    slug: str = Field(..., description="Category slug in lowercase (e.g. 'clothing')")
    label: str = Field(..., description="Category display label (e.g. 'Clothing')")
    product_count: int = Field(..., description="Number of products in this category")


# ---------------------------------------------------------------------------
# Alert & Notification Schemas
# ---------------------------------------------------------------------------


class CreateAlertSchema(BaseModel):
    user_email: Optional[str] = Field(None, description="User's email address (optional, derived from session)")
    product_id: str = Field(..., description="Product ID to watch")
    target_price: Optional[float] = Field(None, ge=0, description="Target price threshold")
    notify_on_good_time: bool = Field(True, description="Notify when Buy Score is good (>= 70)")
    channel: str = Field("email", description="Channel: 'sms', 'telegram', or 'email'")
    destination: str = Field(..., description="Destination: phone number, telegram chat ID, or email")

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, v: str) -> str:
        chan = v.strip().lower()
        if chan not in ("sms", "telegram", "email"):
            raise ValueError("Channel must be 'sms', 'telegram', or 'email'.")
        return chan

    @field_validator("user_email", "product_id", "destination")
    @classmethod
    def validate_non_empty(cls, v: str, info) -> str:
        return _reject_placeholder(v, info.field_name)

    @model_validator(mode="after")
    def validate_trigger(self) -> "CreateAlertSchema":
        if self.target_price is None and not self.notify_on_good_time:
            raise ValueError("At least one trigger must be set: target_price or notify_on_good_time.")
        return self


class SendPhoneOtpSchema(BaseModel):
    phone: str = Field(..., description="Mobile phone number with country code")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return _reject_placeholder(v, "phone")


class VerifyPhoneOtpSchema(BaseModel):
    phone: str = Field(..., description="Mobile phone number")
    code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code")

    @field_validator("phone", "code")
    @classmethod
    def validate_inputs(cls, v: str, info) -> str:
        return _reject_placeholder(v, info.field_name)


class SimulatePriceDropSchema(BaseModel):
    product_id: str = Field(..., description="Product ID to simulate price drop for")
    new_price: float = Field(..., ge=0, description="New lower simulated price")


# ---------------------------------------------------------------------------
# Shopping Assistant Schemas
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role of the speaker: 'user' or 'assistant'")
    content: str = Field(..., min_length=1, description="Message text content")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in ("user", "assistant"):
            raise ValueError("Role must be either 'user' or 'assistant'.")
        return clean


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User's natural language question")
    history: Optional[List[ChatMessage]] = Field(
        default=None,
        description="Optional conversation history (up to last 6 turns)",
    )


class AssistantChatResponse(BaseModel):
    answer: str = Field(..., description="Assistant answer")
    products: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Recommended products (max 5)",
    )
    filters_used: Dict[str, Any] = Field(
        default_factory=dict,
        description="Extracted query filters",
    )
    grounded: bool = Field(
        default=True,
        description="Whether the response is strictly grounded in catalog data",
    )


# ---------------------------------------------------------------------------
# Budget Planner Schemas
# ---------------------------------------------------------------------------

class BudgetPlanRequest(BaseModel):
    budget: float = Field(
        ...,
        ge=100.0,
        le=10000000.0,
        description="Target budget in INR (100 to 10,000,000)",
    )
    categories: Optional[List[str]] = Field(
        default=None,
        description="Optional list of top-level categories (empty means all)",
    )
    mode: str = Field(
        default="mix",
        description="Planning mode: 'single' (best buy) or 'mix' (basket)",
    )

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        clean = str(v).strip().lower()
        if clean not in ("single", "mix"):
            raise ValueError("mode must be 'single' or 'mix'.")
        return clean


class BudgetPlanDetails(BaseModel):
    items: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Recommended products in the plan with price, buy score, and why string",
    )
    total: float = Field(
        default=0.0,
        description="Total cost of items in the plan",
    )
    remaining: float = Field(
        default=0.0,
        description="Remaining unused budget",
    )


class BudgetPlanResponse(BaseModel):
    budget: float
    mode: str
    plan: BudgetPlanDetails
    buy_now: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Top products with buy_score >= 70 outside the plan",
    )
    wait: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Top products with buy_score < 40 to hold off on",
    )
    message: Optional[str] = Field(
        default=None,
        description="Optional explanatory message when no items fit",
    )





# ---------------------------------------------------------------------------
# Auth and User Data Schemas
# ---------------------------------------------------------------------------

class UserSchema(BaseModel):
    id: str
    name: str
    email: str
    created_at: str


class UserResponseSchema(BaseModel):
    user: UserSchema


class SignUpRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        clean = v.strip().lower()
        if "@" not in clean or "." not in clean.split("@")[-1]:
            raise ValueError("Invalid email format.")
        return clean


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        clean = v.strip().lower()
        if "@" not in clean or "." not in clean.split("@")[-1]:
            raise ValueError("Invalid email format.")
        return clean


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=128)


class CartItemPayload(BaseModel):
    product_id: str = Field(..., min_length=1)
    quantity: int = Field(..., ge=0)


class SavedItemPayload(BaseModel):
    product_id: str = Field(..., min_length=1)


class HistoryItemPayload(BaseModel):
    product_id: str = Field(..., min_length=1)
    store: Optional[str] = None
    ts: Optional[str] = None


class ActivityEventPayload(BaseModel):
    type: str = Field(..., min_length=1)
    product_id: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    query: Optional[str] = None
    price: Optional[float] = None
    ts: Optional[str] = None


class PreferencesSchema(BaseModel):
    favorite_categories: List[str] = Field(default_factory=list)
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    personalization_paused: bool = False


class PreferencesUpdatePayload(BaseModel):
    favorite_categories: Optional[List[str]] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    personalization_paused: Optional[bool] = None
