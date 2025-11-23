# BodyCart Backend - Development Guidelines

## Project Overview

BodyCart is a browser extension that analyzes e-commerce websites for potential scams, phishing, or low-quality dropshipping. The backend is a FastAPI monolith that runs multiple analysis agents in parallel.

## Backend Folder Structure

```
backend/
├── main.py                  # FastAPI app entry point, routes, middleware
├── schemas.py               # Pydantic models for request/response validation
├── agents.py                # E-commerce analysis agents (technical, context, AI)
├── marketplace_agents.py    # Facebook Marketplace specialized agents
├── requirements.txt         # Python dependencies
├── Dockerfile               # Container configuration
├── fly.toml                 # Fly.io deployment config
│
├── services/                # (Future) External service integrations
│   ├── __init__.py
│   ├── whois.py             # Domain age lookup
│   ├── safe_browsing.py     # Google Safe Browsing API
│   └── openai.py            # LLM integration
│
├── utils/                   # (Future) Helper functions
│   ├── __init__.py
│   ├── text.py              # Text processing, regex patterns
│   ├── scoring.py           # Score calculation logic
│   └── validators.py        # Custom validation helpers
│
└── config/                  # (Future) Configuration management
    ├── __init__.py
    └── settings.py          # Environment variables, constants
```

## File Responsibilities

### `main.py`
- FastAPI app initialization
- CORS middleware configuration
- Route definitions (`/analyze`, `/analyze/marketplace`, `/`)
- Orchestrates agent calls and aggregates results
- **Do NOT** put business logic here - delegate to agents/services

### `schemas.py`
- All Pydantic models live here
- **E-commerce models**: `AnalysisRequest`, `AnalysisResult`, `Flag`
- **Marketplace models**: `MarketplaceRequest`, `MarketplaceSellerInfo`, `MarketplaceListingInfo`
- Keep models flat when possible
- Use `Optional` for nullable fields with defaults

### `agents.py`
- E-commerce analysis agents: `technical_agent`, `context_agent`, `ai_agent`
- Each agent is an `async def` function
- Agents receive `AnalysisRequest` and return a dict with:
  - `flags`: List of `Flag` objects
  - `details`: Dict of analysis metadata
  - `score_impact`: Integer points to deduct from 100
  - (AI agent only) `verdict_title`, `verdict_message`

### `marketplace_agents.py`
- Facebook Marketplace specialized agents:
  - `seller_trust_agent`: Profile age, account legitimacy
  - `pricing_agent`: Too-good-to-be-true price detection
  - `image_analysis_agent`: Stock photos, stolen images (GPT-4o)
  - `red_flags_agent`: Common scam patterns (payment outside platform, contact bypass)
  - `marketplace_ai_verdict_agent`: Final AI verdict
- All agents receive `MarketplaceRequest` and return the same dict format as e-commerce agents

### `services/` (when created)
- One file per external service
- Wrap API calls in async functions
- Handle errors gracefully, return sensible defaults
- Example: `whois.py` exports `async def get_domain_age(domain: str) -> int`

### `utils/` (when created)
- Pure functions, no side effects
- Text processing, regex patterns, scoring math
- Should be easily testable

## Coding Conventions

### Python Style
- Python 3.11+ features allowed
- Use type hints for all function signatures
- Async functions for I/O operations
- Use `asyncio.gather()` for parallel operations

### Naming
- Files: `snake_case.py`
- Classes: `PascalCase`
- Functions/variables: `snake_case`
- Constants: `UPPER_SNAKE_CASE`

### Pydantic Models
```python
class MyModel(BaseModel):
    required_field: str
    optional_field: Optional[str] = None
    list_field: List[str] = []
    dict_field: Dict[str, Any] = {}
```

### Agent Return Format
```python
async def my_agent(request: AnalysisRequest) -> dict:
    return {
        "flags": [Flag(type="warning", msg="Something suspicious")],
        "details": {"key": "value"},
        "score_impact": 10  # Points to deduct
    }
```

### Flag Types
- `critical`: Red alert, major security issue (e.g., domain created yesterday)
- `warning`: Yellow alert, suspicious but not definitive (e.g., uses non-local payment)
- `info`: Neutral observation (e.g., analysis completed)

### Risk Levels
- `safe`: Score >= 80
- `suspicious`: Score 50-79
- `dangerous`: Score < 50

## Environment Variables

```bash
OPENAI_API_KEY=sk-...        # Required for AI agent
GOOGLE_SAFE_BROWSING_KEY=... # Optional, for URL checking
```

## Running the Backend

```bash
# Install dependencies
make install

# Run server (port 8000)
make run

# Run with auto-reload for development
make dev
```

## API Endpoints

### `GET /`
Health check. Returns `{"status": "ok", "service": "BodyCart API"}`

### `POST /analyze`
E-commerce website analysis endpoint.

**Request:**
```json
{
  "url": "https://example.com",
  "html_content": "<html>...</html>",
  "screenshot_base64": "base64string...",
  "title": "Page Title",
  "protocol": "https:"
}
```

**Response:**
```json
{
  "score": 75,
  "risk_level": "suspicious",
  "verdict_title": "Huele a humo...",
  "verdict_message": "Review the details below.",
  "flags": [
    {"type": "warning", "msg": "Domain is only 30 days old"}
  ],
  "details": {
    "domain_age_days": 30,
    "ssl_valid": true
  }
}
```

### `POST /analyze/marketplace`
Facebook Marketplace listing analysis endpoint.

**Request:**
```json
{
  "url": "https://facebook.com/marketplace/item/123456",
  "platform": "facebook_marketplace",
  "screenshot_base64": "base64string...",
  "listing": {
    "title": "iPhone 15 Pro Max",
    "price": "$200",
    "description": "Brand new, still in box...",
    "condition": "New",
    "location": "Miami, FL",
    "posted_date": "Listed 2 days ago",
    "image_count": 3
  },
  "seller": {
    "name": "John Doe",
    "profile_url": "https://facebook.com/marketplace/profile/123",
    "join_date": "Joined in 2024",
    "location": "Miami, FL"
  },
  "listing_images": ["https://scontent..."]
}
```

**Response:** Same format as `/analyze`

**Trust Signals Checked:**
- **Seller Trust**: Account age, profile completeness, response rate
- **Pricing**: Too-good-to-be-true detection for electronics, free item warnings
- **Images**: Image count, stock photo detection (GPT-4o)
- **Red Flags**: Payment outside platform (Zelle, Venmo), contact bypass (WhatsApp), scam phrases

## Adding New Agents

1. Create async function in `agents.py`
2. Accept `AnalysisRequest` as parameter
3. Return dict with `flags`, `details`, `score_impact`
4. Add to `asyncio.gather()` in `main.py`
5. Aggregate results in the `/analyze` endpoint

## Testing

```bash
# Test health endpoint
curl http://localhost:8000/

# Test e-commerce analysis
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://test.com", "html_content": "<html></html>"}'

# Test marketplace analysis
curl -X POST http://localhost:8000/analyze/marketplace \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://facebook.com/marketplace/item/123",
    "platform": "facebook_marketplace",
    "listing": {
      "title": "iPhone 15 Pro",
      "price": "$100",
      "description": "Brand new, contact me on WhatsApp"
    },
    "seller": {
      "name": "Test Seller",
      "join_date": "Joined in 2024"
    }
  }'
```

## Platform Support

| Platform | Endpoint | Data Collector | Status |
|----------|----------|----------------|--------|
| E-commerce (generic) | `/analyze` | `collectPageData()` | Active |
| Facebook Marketplace | `/analyze/marketplace` | `collectMarketplaceData()` | Active |

### Adding New Platform Support

1. Add platform detection in `content.js` `detectPlatform()` function
2. Create data collector function (e.g., `collectNewPlatformData()`)
3. Add schemas in `schemas.py` if needed
4. Create platform-specific agents in new file (e.g., `newplatform_agents.py`)
5. Add endpoint in `main.py`
6. Update `renderInfo` function for UI display
