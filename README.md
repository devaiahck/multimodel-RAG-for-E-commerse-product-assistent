# UrbanPick: Multimodal AI-Powered E-Commerce Assistant

UrbanPick is an intelligent, privacy-conscious e-commerce assistant and discovery engine built to provide shoppers with transparent pricing, multimodal product search, personalized recommendations, and budget planning.

Designed with a calm, high-efficiency editorial interface (inspired by classical typography and modernist layouts), UrbanPick runs without bloated UI frameworks or marketing noise.

---

## Features

### 1. Multimodal Product Discovery
- **Text & Visual Search:** Search with free-form queries, natural language, or upload an image to find visually and semantically similar items using dual text/image vector embeddings.
- **Category Agnostic:** Fully supports dynamic catalogs across **Clothing, Shoes, Watches, Electronics, Home, Beauty, Sports**, and more. No hardcoded category assumptions.
- **Search Refinement:** Iteratively refine photo uploads with text constraints (e.g., photo of a shoe + "under 3000").

### 2. Conversational Shopping Assistant
- **Context-Aware AI Assistant:** Accessible from anywhere via the drawer; answers product questions, compares specifications, and explains trade-offs.
- **Grounded Responses:** Employs Retrieval-Augmented Generation (RAG) backed by a local Chroma vector database to ground all claims in actual product attributes and pricing.
- **Interactive Citations:** Renders direct, actionable product cards inside the conversation stream.

### 3. Price Transparency & Historical Insights
- **Price Trend Visualizations:** Interactive historical price charts displaying minimum, maximum, and average prices.
- **Discount Verification:** Distinguishes genuine price cuts from inflated "list price" discounts.
- **Price Score:** Algorithmic confidence scoring based on historical variance, volatility, and timing.

### 4. Smart Budget Planner
- **Single & Multi-Category Allocations:** Input a budget limit and specify shopping goals (single item or cross-category combinations).
- **Optimization Modes:** Evaluates price-to-spec scores to construct the best basket fitting within the budget ceiling.

### 5. Price Tracking & Multi-Channel Alerts
- **Custom Threshold Alerts:** Users can monitor items and set target trigger prices or drop notifications.
- **Flexible Notification Providers:** Pluggable alert dispatcher supporting Local Dev Console logging, Telegram Bot messages, and SMS (Twilio).

### 6. User Accounts & Activity-Based Recommendations
- **Server-Side Authentication:** Secure, session-based cookie authentication backed by SQLite (`users.db`).
- **Data Isolation:** User saved items, carts, view history, and preference toggles are strictly isolated and synchronized with server storage.
- **Personalized Recommendations:** Employs Chroma embedding vector centroids derived from user view history and saved items, filtered dynamically by active categories and privacy settings.

---

## Architecture & Project Structure

```
ecommerce-ai-assistant/
├── backend/
│   ├── data/                 # SQLite databases (users.db, alerts.db) & catalog JSONs
│   ├── rag/                  # Retriever, Chroma store client, multimodal encoders
│   ├── services/             # Recommender, price score, alert dispatcher, budget engine
│   ├── static/images/        # Cached product images for local serving
│   ├── tests/                # Comprehensive pytest suite (107+ tests)
│   ├── config.py             # Pydantic environment settings
│   ├── main.py               # FastAPI application & REST routing
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/       # Design system primitives, product cards, assistant drawer
│   │   ├── config/           # saleCalendar.json and frontend configuration
│   │   ├── context/          # Auth, Cart, Saved Items, and Assistant React contexts
│   │   ├── hooks/            # Data-fetching hooks (react-query / native fetch)
│   │   ├── pages/            # Home, Category, Product, Compare, Budget, Search, Account
│   │   └── App.tsx           # Route layout with code-splitting
│   ├── package.json          # Node dependencies
│   └── vite.config.ts        # Vite configuration
├── scripts/
│   ├── smoke_test.py         # End-to-end user lifecycle automated test
│   ├── fetch_images.py       # Catalog image fetcher & downscaler
│   └── load_watches.py       # Catalog ingestion & vector embedding script
├── Docs/                     # Specifications & architecture design docs
└── README.md
```

---

## Getting Started

### Prerequisites
- **Python:** 3.10+ (recommended: 3.11 or 3.12)
- **Node.js:** 18+ and `npm`

---

### Backend Setup

1. **Create and activate a virtual environment:**
   ```bash
   cd backend
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment:**
   Copy the example environment file:
   ```bash
   cp ../backend/.env.example .env
   ```
   *Note: In development (`APP_ENV=dev`), sensible defaults are provided automatically.*

4. **Start the API server:**
   ```bash
   uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8001 --reload
   ```
   API interactive docs will be available at `http://127.0.0.1:8001/docs`.

---

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure environment:**
   Create `.env` in the `frontend` folder (or copy `frontend/.env.example`):
   ```env
   VITE_API_BASE_URL=http://localhost:8001
   VITE_DEMO_DATA=true
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## Ingesting New Categories

UrbanPick is built to support any product category. To ingest data for a new category:

1. **Prepare Product Data:**
   Create a JSON file with product records following the schema in `backend/data/` (e.g. `backend/data/shoes.json`):
   ```json
   [
     {
       "id": "shoe-running-air-zoom",
       "name": "Air Zoom Running Shoe",
       "brand": "Nike",
       "category": "shoes",
       "price": 8499,
       "original_price": 9999,
       "description": "Lightweight breathable road running shoe.",
       "image_url": "https://example.com/shoes/running.jpg",
       "specs": {
         "Sole Material": "Rubber",
         "Closure": "Lace-Up"
       },
       "price_history": [
         { "date": "2026-10-01", "price": 9999 },
         { "date": "2026-11-01", "price": 8499 }
       ]
     }
   ]
   ```

2. **Fetch and Cache Images (Optional):**
   ```bash
   python scripts/fetch_images.py --input backend/data/shoes.json --output backend/static/images/shoes/
   ```

3. **Embed and Load into ChromaDB:**
   Use the ingestion endpoint (requiring `X-Api-Key` in production or `APP_ENV=dev`) or run a loader script:
   ```bash
   python scripts/load_watches.py --file backend/data/shoes.json --category shoes
   ```
   The embedding model will encode both textual descriptions and image features into the collection vector space.

---

## Testing & Quality Assurance

### Run Backend Tests
The backend test suite covers authentication, authorization, session isolation, RAG retriever, budget optimization, and recommendations:
```bash
pytest backend
```

### Run Frontend Build & Lint Checks
```bash
cd frontend
npm run lint      # Runs oxlint
npm run build     # Runs tsc -b and vite build with code-splitting
```

### Run End-to-End Smoke Test
Run the automated user lifecycle verification test:
```bash
python scripts/smoke_test.py
```
This tests:
- Account signup and session authentication
- Catalog search and photo search
- Price history retrieval and price alerts
- Shopping assistant query execution
- Budget planning calculation
- Saved items and cart operations
- Personalized recommendations

---

## Notification Providers

UrbanPick supports multi-channel notification dispatches for price alerts:

- **Console / Dev Mode (`NOTIFY_PROVIDER=console`):**
  Alerts are written to `backend/data/sent_notifications.log` for local inspection without third-party credentials.
- **Telegram (`NOTIFY_PROVIDER=telegram`):**
  Configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `backend/.env`.
- **SMS / Twilio (`NOTIFY_PROVIDER=twilio`):**
  Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` in `backend/.env`.

---

## Sale Calendar Configuration

Upcoming and seasonal sales are defined in [`frontend/src/config/saleCalendar.json`](file:///c:/Users/bopan/OneDrive/Desktop/PROJECT/ecommerce-ai-assistant/frontend/src/config/saleCalendar.json). Update this file to configure promotional events and dates displayed across the application:

```json
[
  {
    "name": "Diwali Mega Sale",
    "year": 2026,
    "start": "2026-10-15",
    "end": "2026-11-02",
    "approximate": false,
    "note": "Major festive discounts across all product categories."
  }
]
```

---

## Pre-Launch Production Checklist

Before deploying UrbanPick to a public production environment:

- [ ] **Security:**
  - Set `APP_ENV=prod` in `backend/.env`.
  - Provide a strong, cryptographically random `SESSION_SECRET`.
  - Set a secret `INGEST_API_KEY` for `/api/v1/ingest` and `/api/v1/admin/*`.
  - Set `COOKIE_SECURE=true` (ensures cookies are served over HTTPS only).
  - Configure `FRONTEND_ORIGINS` to only your production domain(s).
- [ ] **Data:**
  - Ingest real product catalog datasets for all active categories.
  - Set `VITE_DEMO_DATA=false` in `frontend/.env` to remove the demo pricing notice.
- [ ] **Infrastructure:**
  - Configure production database backups for `backend/data/users.db` and `backend/data/alerts.db`.
  - Set up persistent storage for `backend/chroma_db` vector store.
  - Set up a reverse proxy (e.g., Nginx, Caddy, or Cloudflare) with SSL termination.
"# multimodel-RAG-for-E-commerse-product-assistent" 
