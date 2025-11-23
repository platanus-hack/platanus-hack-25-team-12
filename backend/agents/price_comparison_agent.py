import asyncio
import os
import re
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urlparse

from pydantic import BaseModel, Field
from tavily import TavilyClient

from schemas import AnalysisRequest, Flag
from llm import call_llm, call_structured_llm

# Enable logging
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ExtractedPrice(BaseModel):
    """Structured response for price extraction from search result content."""
    current_price: Optional[int] = Field(
        default=None,
        description="The CURRENT/SALE price in the local currency (as integer, no decimals). This is the price the customer would actually pay NOW, NOT the original/crossed-out price, and NOT installment/monthly payments."
    )
    currency: str = Field(
        default="CLP",
        description="The currency code (CLP for Chilean Peso, USD for US Dollar, etc.)"
    )
    is_installment: bool = Field(
        default=False,
        description="True if the extracted price appears to be an installment/monthly payment rather than the full price"
    )
    confidence: int = Field(
        default=50,
        ge=0,
        le=100,
        description="Confidence level (0-100) that this is the actual current full price"
    )


async def extract_price_with_llm(content: str, title: str, product_name: str) -> Optional[dict]:
    """
    Use LLM to intelligently extract the CURRENT price from search result content.

    This avoids common pitfalls like:
    - Extracting crossed-out/original prices instead of sale prices
    - Extracting installment amounts instead of full prices
    - Extracting shipping costs or other unrelated prices
    """
    # Truncate content if too long
    content_truncated = content[:1500] if len(content) > 1500 else content

    messages = [
        {
            "role": "system",
            "content": """You are a price extraction expert. Extract the CURRENT/SALE price from e-commerce text.

RULES:
1. Extract the CURRENT price, NOT the original/crossed-out price
2. Extract the FULL price, NOT installment/monthly payments (e.g., "12 cuotas de $22.499" - ignore $22.499)
3. Chilean prices use dots as thousand separators (e.g., $269.990 = 269990)
4. If discount shown (X% OFF), the current price is the LOWER one
5. Return price as integer without separators
6. If uncertain, set current_price to null

IMPORTANT: Respond ONLY with valid JSON. No explanations, no text before or after the JSON."""
        },
        {
            "role": "user",
            "content": f"""Product: {product_name}

Title: {title}

Page content:
{content_truncated}

Extract the CURRENT price (not original, not installments)."""
        }
    ]

    try:
        result = await call_structured_llm(messages, ExtractedPrice, max_tokens=200)
        if result and result.current_price and result.confidence >= 50 and not result.is_installment:
            return {
                "price": result.current_price,
                "currency": result.currency,
                "confidence": result.confidence
            }
        return None
    except Exception as e:
        logger.warning(f"[PRICE AGENT] LLM price extraction failed: {e}")
        return None


def extract_price_regex_fallback(content: str) -> Optional[int]:
    """
    Fallback regex extraction - tries to find the most likely current price.
    Less accurate than LLM but useful as a backup.
    """
    # Find all Chilean peso prices in the content
    # Matches: $XX.XXX.XXX or $XX,XXX,XXX or CLP XX.XXX.XXX
    price_matches = re.findall(r'[\$|CLP]\s?(\d{1,3}(?:[.,]\d{3})+)', content)

    if not price_matches:
        return None

    # Convert all prices to integers
    prices = []
    for match in price_matches:
        # Remove dots and commas, convert to int
        cleaned = re.sub(r'[.,]', '', match)
        try:
            prices.append(int(cleaned))
        except ValueError:
            continue

    if not prices:
        return None

    # Heuristic: Filter out likely installment prices (typically under 50,000 CLP for electronics)
    # and return a middle-range price (not the highest which might be original, not the lowest which might be installment)
    reasonable_prices = [p for p in prices if p >= 50000]  # Filter likely installments

    if reasonable_prices:
        # Return the minimum of reasonable prices (most likely the sale price)
        return min(reasonable_prices)

    # If all prices seem like installments, return None
def parse_price(price_str: str) -> Optional[int]:
    """
    Parse a price string and return the numeric value.
    Handles formats like: $1.029.990, $899.990, CLP 150.000, etc.
    """
    if not price_str:
        return None

    # Remove currency symbols and whitespace
    cleaned = re.sub(r'[\$CLP\s]', '', price_str)
    # Remove thousand separators (dots or commas)
    cleaned = re.sub(r'[.,](?=\d{3})', '', cleaned)

    try:
        return int(cleaned)
    except ValueError:
        return None


def extract_price_from_html(html_content: str) -> Optional[Tuple[str, int]]:
    """
    Try to extract the main product price from HTML content.
    Returns tuple of (price_string, price_value) or None.
    """
    if not html_content:
        return None

    # Common price patterns in Chilean e-commerce
    # Look for prices in common price containers
    price_patterns = [
        # JSON-LD structured data
        r'"price":\s*"?(\d{1,3}(?:[.,]\d{3})*)"?',
        # Meta tags
        r'content="(\d{1,3}(?:[.,]\d{3})*)"[^>]*property="product:price:amount"',
        # Common price formats with currency
        r'[\$](\d{1,3}(?:\.\d{3})+)',
        r'CLP\s*(\d{1,3}(?:\.\d{3})+)',
        # Price in data attributes
        r'data-price="(\d+)"',
    ]

    for pattern in price_patterns:
        match = re.search(pattern, html_content)
        if match:
            price_str = match.group(1)
            price_val = parse_price(price_str)
            if price_val and price_val > 100:  # Filter out tiny values
                return (f"${price_str}", price_val)

    return None


def extract_product_name(request: AnalysisRequest) -> str:
    """
    Try to extract a product name from the request data.
    Priority: Title cleaned up
    """
    if request.title:
        # Common separators in e-commerce titles
        separators = [' | ', ' - ', ' – ', ' — ']
        title = request.title
        
        # Try to take the first part as the product name
        for sep in separators:
            if sep in title:
                parts = title.split(sep)
                if len(parts) >= 1:
                    title = parts[0].strip()
                    break
        
        return title
    
    return ""


async def price_comparison_agent(request: AnalysisRequest) -> Dict[str, Any]:
    """
    Search for the same product on other websites to compare prices.
    
    Features:
    - Searches for the product name on Google Shopping / General Search via Tavily
    - Extracts prices from results
    - Returns flags if better prices are found
    """
    logger.info("💰 [PRICE AGENT] Starting price comparison analysis...")

    tavily_api_key = os.getenv("TAVILY_API_KEY")
    if not tavily_api_key:
        logger.warning("⚠️ [PRICE AGENT] No TAVILY_API_KEY found, skipping price comparison")
        return {
            "flags": [],
            "details": {"checked": False, "reason": "API key not configured"},
            "score_impact": 0
        }

    try:
        client = TavilyClient(api_key=tavily_api_key)
        product_name = extract_product_name(request)
        
        if not product_name or len(product_name) < 3:
            logger.info("⚠️ [PRICE AGENT] Could not extract a valid product name")
            return {
                "flags": [],
                "details": {"checked": False, "reason": "No product name extracted"},
                "score_impact": 0
            }

        logger.info(f"🔎 [PRICE AGENT] Searching for product: '{product_name}'")

        # Search query - focused on Chile and international stores that ship to Chile
        query = f'comprar "{product_name}" precio Chile'
        
        response = client.search(
            query=query,
            search_depth="advanced",
            max_results=20,  # Increased to get more options to filter
            include_answer=True
        )

        found_prices = []
        seen_domains = set()

        # Process results to find potential price comparisons
        # This is a heuristic approach since we don't have structured product data from Tavily
        # We'll look for price patterns in the content snippets
        
        current_domain = urlparse(request.url).netloc.replace("www.", "")
        
        # Collect results first, then process prices with LLM in parallel
        results_to_process = []

        for result in response.get("results", []):
            url = result.get("url", "")
            domain = urlparse(url).netloc.replace("www.", "")

            # Skip the current site
            if current_domain in domain or domain in current_domain:
                continue

            # Skip if we already found a price for this domain
            if domain in seen_domains:
                continue

            content = result.get("content", "")
            title = result.get("title", "")

            # Only process if there's some price-like content
            if re.search(r'[\$|CLP]\s?\d', content):
                results_to_process.append({
                    "url": url,
                    "domain": domain,
                    "content": content,
                    "title": title
                })
                seen_domains.add(domain)

        logger.info(f"🔍 [PRICE AGENT] Processing {len(results_to_process)} results for price extraction...")

        # Process prices using LLM for accurate extraction
        # Limit to first 5 results to avoid too many LLM calls
        async def process_single_result(result_data: dict) -> Optional[dict]:
            """Process a single search result to extract price."""
            content = result_data["content"]
            title = result_data["title"]

            # Try LLM extraction first for accuracy
            llm_result = await extract_price_with_llm(content, title, product_name)

            if llm_result and llm_result.get("price"):
                price_value = llm_result["price"]
                # Format price with Chilean thousands separator
                price_formatted = f"${price_value:,.0f}".replace(",", ".")
                return {
                    "store": result_data["domain"],
                    "title": title,
                    "price_text": price_formatted,
                    "price_numeric": price_value,
                    "url": result_data["url"],
                    "extraction_method": "llm",
                    "confidence": llm_result.get("confidence", 0)
                }

            # Fallback to regex if LLM fails
            regex_price = extract_price_regex_fallback(content)
            if regex_price:
                price_formatted = f"${regex_price:,.0f}".replace(",", ".")
                return {
                    "store": result_data["domain"],
                    "title": title,
                    "price_text": price_formatted,
                    "price_numeric": regex_price,
                    "url": result_data["url"],
                    "extraction_method": "regex_fallback",
                    "confidence": 30  # Lower confidence for regex
                }

            return None

        # Process up to 5 results in parallel
        tasks = [process_single_result(r) for r in results_to_process[:5]]
        extraction_results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in extraction_results:
            if isinstance(result, dict) and result:
                found_prices.append(result)

        logger.info(f"✅ [PRICE AGENT] Found {len(found_prices)} potential price comparisons")

        flags = []
        score_impact = 0
        price_verdict = None
        price_verdict_detail = None

        # Try to extract current site's price
        current_price_data = extract_price_from_html(request.html_content)
        current_price = current_price_data[1] if current_price_data else None
        current_price_str = current_price_data[0] if current_price_data else None

        if found_prices and current_price:
            # Parse competitor prices and compare
            competitor_prices = []
            for fp in found_prices:
                parsed = parse_price(fp["price_text"])
                if parsed:
                    competitor_prices.append(parsed)

            if competitor_prices:
                avg_price = sum(competitor_prices) / len(competitor_prices)
                min_price = min(competitor_prices)
                max_price = max(competitor_prices)

                # Determine price verdict
                if current_price <= min_price * 1.05:  # Within 5% of lowest
                    price_verdict = "🟢 Buen precio"
                    price_verdict_detail = f"Este precio ({current_price_str}) está entre los más bajos del mercado."
                elif current_price <= avg_price * 1.1:  # Within 10% of average
                    price_verdict = "🟡 Precio promedio"
                    price_verdict_detail = f"Este precio ({current_price_str}) está dentro del rango normal del mercado."
                else:
                    price_verdict = "🔴 Precio alto"
                    price_verdict_detail = f"Este precio ({current_price_str}) está por sobre el promedio. Encontramos opciones más baratas."
                    flags.append(Flag(
                        type="warning",
                        msg=f"⚠️ Precio alto: encontramos el mismo producto desde ${min_price:,}".replace(",", ".")
                    ))

                logger.info(f"💰 [PRICE AGENT] Verdict: {price_verdict} (current: {current_price}, avg: {avg_price:.0f}, min: {min_price})")

        if found_prices:
            flags.append(Flag(
                type="info",
                msg=f"💡 Encontramos este producto en otras {len(found_prices)} tiendas. ¡Compara precios!"
            ))

        return {
            "flags": flags,
            "details": {
                "checked": True,
                "product_name": product_name,
                "current_price": current_price_str,
                "price_verdict": price_verdict,
                "price_verdict_detail": price_verdict_detail,
                "comparisons": found_prices
            },
            "score_impact": score_impact
        }

    except Exception as e:
        logger.error(f"❌ [PRICE AGENT] Error: {str(e)}")
        return {
            "flags": [],
            "details": {"checked": False, "error": str(e)},
            "score_impact": 0
        }
