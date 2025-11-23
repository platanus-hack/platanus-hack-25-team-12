import asyncio
import os
import re
from typing import Dict, Any, List, Optional
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
            "content": """Eres un experto en extraer precios de productos de texto de sitios web de comercio electrónico.

Tu tarea es identificar el PRECIO ACTUAL/DE VENTA de un producto, NO:
- El precio original tachado (antes del descuento)
- El precio en cuotas/mensualidades (ej: "12 cuotas de $22.499")
- Costos de envío
- Otros precios no relacionados con el producto

REGLAS IMPORTANTES:
1. El precio actual es generalmente el MÁS PROMINENTE y puede estar marcado como "oferta", "ahora", "precio actual", o simplemente ser el precio no tachado
2. Si ves "X% OFF" o "descuento", el precio actual es el MENOR, no el original
3. Las cuotas/mensualidades suelen mencionarse como "en X cuotas de $Y" - ignora $Y y busca el precio total
4. Los precios chilenos usan puntos como separador de miles (ej: $269.990 = 269990)
5. Si no puedes determinar el precio actual con confianza, devuelve null

Devuelve el precio como número entero sin separadores."""
        },
        {
            "role": "user",
            "content": f"""Producto buscado: {product_name}

Título del resultado: {title}

Contenido de la página:
{content_truncated}

Extrae el PRECIO ACTUAL (no el original, no cuotas) del producto."""
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
        
        if found_prices:
            # We found other stores selling potentially the same thing
            # We don't strictly know if it's cheaper without complex parsing, 
            # so we'll add an info flag.
            
            flags.append(Flag(
                type="info",
                msg=f"💡 Encontramos este producto en otras {len(found_prices)} tiendas. ¡Compara precios!"
            ))
            
            # Maybe a small positive impact for finding alternatives? Or neutral.
            # Let's keep it neutral for now unless we are sure it's cheaper.
        
        return {
            "flags": flags,
            "details": {
                "checked": True,
                "product_name": product_name,
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
