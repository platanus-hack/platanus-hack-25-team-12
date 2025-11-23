import os
import re
from typing import Dict, Any, List
from urllib.parse import urlparse

from tavily import TavilyClient

from schemas import AnalysisRequest, Flag
from llm import call_llm

# Enable logging
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
        
        # Define Chilean stores and international stores that ship to Chile
        chilean_tlds = ['.cl']
        
        # Process results to find potential price comparisons
        # This is a heuristic approach since we don't have structured product data from Tavily
        # We'll look for price patterns in the content snippets
        
        current_domain = urlparse(request.url).netloc.replace("www.", "")
        
        for result in response.get("results", []):
            url = result.get("url", "")
            domain = urlparse(url).netloc.replace("www.", "")
            
            # Skip the current site
            if current_domain in domain or domain in current_domain:
                continue
            
            # Skip if we already found a price for this domain
            if domain in seen_domains:
                continue
            
            # Accept all stores (removed strict Chilean-only filter)
            # This allows international stores that may ship to Chile
            
            content = result.get("content", "")
            title = result.get("title", "")
            
            # Improved regex to capture full Chilean prices like $1.029.990, $899.990, etc.
            # Matches: $XX.XXX.XXX or $XX,XXX,XXX or CLP XX.XXX.XXX
            # The (?:[.,]\d{3})+ allows multiple groups of thousands
            price_match = re.search(r'[\$|CLP]\s?(\d{1,3}(?:[.,]\d{3})+)', content)
            
            if price_match:
                price_str = price_match.group(0)
                found_prices.append({
                    "store": domain,
                    "title": title,
                    "price_text": price_str,
                    "url": url
                })
                seen_domains.add(domain)

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
