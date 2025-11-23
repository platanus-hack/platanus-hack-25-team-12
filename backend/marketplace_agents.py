"""
Facebook Marketplace Analysis Agents

Specialized agents for detecting fraud/scams on FB Marketplace:
1. seller_trust_agent - Profile age, account legitimacy (rule-based)
2. pricing_agent - Too-good-to-be-true detection (rule-based)
3. image_analysis_agent - Image count analysis (rule-based)
4. red_flags_agent - Common scam patterns (rule-based)
5. supplier_confidence_agent - LLM-based holistic analysis that produces final score
"""

import asyncio
import re
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from schemas import MarketplaceRequest, Flag
from llm import call_structured_llm


def parse_join_year(join_date: Optional[str]) -> Optional[int]:
    """Extract year from strings like 'Joined in 2019', 'Se unió en 2019', etc."""
    if not join_date:
        return None
    # Match any 4-digit year starting with 19 or 20
    match = re.search(r'(19|20)\d{2}', join_date)
    if match:
        return int(match.group())
    return None


def parse_posted_days(posted_date: Optional[str]) -> Optional[int]:
    """Extract days from strings like 'Listed 2 days ago', '3 semanas', etc."""
    if not posted_date:
        return None
    posted_lower = posted_date.lower()

    # Immediate (English and Spanish)
    if any(term in posted_lower for term in ['just now', 'ahora', 'recién']):
        return 0

    # Hours/minutes (English and Spanish)
    if any(term in posted_lower for term in ['hour', 'minute', 'hora', 'minuto']):
        return 0

    # Yesterday (English and Spanish)
    if any(term in posted_lower for term in ['yesterday', 'ayer']):
        return 1

    # Days (English and Spanish)
    match = re.search(r'(\d+)\s*(day|día|dias)', posted_lower)
    if match:
        return int(match.group(1))

    # Weeks (English and Spanish)
    match = re.search(r'(\d+)\s*(week|semana)', posted_lower)
    if match:
        return int(match.group(1)) * 7

    # Months (English and Spanish)
    match = re.search(r'(\d+)\s*(month|mes)', posted_lower)
    if match:
        return int(match.group(1)) * 30

    return None


def parse_price(price_str: Optional[str]) -> Optional[float]:
    """Extract numeric price from strings like '$1,500', '90 000 $', 'Free', 'Gratis'"""
    if not price_str:
        return None
    price_lower = price_str.lower()
    if 'free' in price_lower or 'gratis' in price_lower:
        return 0.0
    # Remove currency symbols, spaces, and commas - keep only digits and decimal point
    cleaned = re.sub(r'[^\d.]', '', price_str.replace(' ', ''))
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_listings_count(listings_str: Optional[str]) -> Optional[int]:
    """Extract number from listings count strings like '20+', '5 publicaciones'"""
    if not listings_str:
        return None
    match = re.search(r'(\d+)', listings_str)
    if match:
        return int(match.group(1))
    return None


async def seller_trust_agent(request: MarketplaceRequest) -> dict:
    """
    Analyzes seller profile for trust signals.

    Checks:
    - Account age (older = more trustworthy)
    - Profile completeness
    - Response rate
    - Number of other listings
    - Ratings and reviews (from deep investigation)
    - Badges (Buena calificación, Responde rápido, etc.)
    - Strengths (Comunicación, Puntualidad, etc.)
    - Followers count
    """
    flags = []
    details = {}
    score_impact = 0

    seller = request.seller

    if not seller:
        # No seller data available - return without adding noise
        return {"flags": flags, "details": details, "score_impact": 15}

    # Check account age
    join_year = parse_join_year(seller.join_date)
    print(f"[DEBUG] parsed join_year: {join_year}")
    current_year = datetime.now().year

    if join_year:
        account_age_years = current_year - join_year
        details["account_age_years"] = account_age_years
        details["join_year"] = join_year

        # Granular longevity scoring (more tiers)
        if account_age_years < 1:
            flags.append(Flag(type="critical", msg=f"🚨 Cuenta muy nueva (creada en {join_year})"))
            score_impact += 30
            details["longevity_tier"] = "very_new"
        elif account_age_years < 2:
            flags.append(Flag(type="warning", msg=f"⚠️ Cuenta relativamente nueva ({account_age_years} año)"))
            score_impact += 15
            details["longevity_tier"] = "new"
        elif account_age_years < 3:
            flags.append(Flag(type="info", msg=f"Cuenta con {account_age_years} años en Facebook"))
            score_impact += 5
            details["longevity_tier"] = "moderate"
        elif account_age_years < 5:
            flags.append(Flag(type="info", msg=f"Cuenta establecida ({account_age_years} años en Facebook)"))
            details["longevity_tier"] = "established"
        elif account_age_years < 10:
            flags.append(Flag(type="info", msg=f"✓ Cuenta veterana ({account_age_years} años en Facebook)"))
            score_impact -= 10  # Positive signal
            details["longevity_tier"] = "veteran"
        else:
            flags.append(Flag(type="info", msg=f"⭐ Cuenta muy antigua ({account_age_years}+ años en Facebook)"))
            score_impact -= 15  # Strong positive signal
            details["longevity_tier"] = "senior"
    else:
        # No join date available - skip without adding noise
        score_impact += 10

    # Check seller name
    if seller.name:
        details["seller_name"] = seller.name
        # Check for suspicious patterns in name
        if re.search(r'\d{4,}', seller.name):  # Many numbers in name
            flags.append(Flag(type="warning", msg="Nombre de perfil contiene muchos números"))
            score_impact += 5

    # Check response rate
    if seller.response_rate:
        details["response_rate"] = seller.response_rate
        if 'hour' in seller.response_rate.lower() or 'minute' in seller.response_rate.lower():
            flags.append(Flag(type="info", msg=f"Vendedor responde rápido: {seller.response_rate}"))

    # Check other listings (legacy field)
    if seller.other_listings_count is not None:
        details["other_listings_count"] = seller.other_listings_count
        if seller.other_listings_count == 0:
            flags.append(Flag(type="warning", msg="Este es el único artículo del vendedor"))
            score_impact += 5
        elif seller.other_listings_count > 50:
            flags.append(Flag(type="info", msg=f"Vendedor activo con {seller.other_listings_count} publicaciones"))

    # ==========================================
    # Deep Investigation Fields (from profile)
    # ==========================================

    # Check listings count from profile (e.g., "20+")
    if seller.listings_count:
        details["listings_count"] = seller.listings_count
        # Parse the number from "20+" format
        match = re.search(r'(\d+)', seller.listings_count)
        if match:
            listing_num = int(match.group(1))
            if listing_num >= 10:
                flags.append(Flag(type="info", msg=f"Vendedor establecido con {seller.listings_count} publicaciones"))
                score_impact -= 5  # Positive signal
            elif listing_num <= 2:
                flags.append(Flag(type="warning", msg=f"Vendedor con pocas publicaciones ({seller.listings_count})"))
                score_impact += 5

    # Check followers count
    if seller.followers_count is not None:
        details["followers_count"] = seller.followers_count
        if seller.followers_count >= 50:
            flags.append(Flag(type="info", msg=f"Vendedor con {seller.followers_count} seguidores"))
            score_impact -= 5  # Positive signal
        elif seller.followers_count >= 10:
            flags.append(Flag(type="info", msg=f"Vendedor con {seller.followers_count} seguidores"))

    # Check ratings (most important trust signal!)
    if seller.ratings_count is not None:
        details["ratings_count"] = seller.ratings_count
        if seller.ratings_count >= 10:
            flags.append(Flag(type="info", msg=f"Vendedor con {seller.ratings_count} calificaciones"))
            score_impact -= 10  # Strong positive signal
        elif seller.ratings_count >= 5:
            flags.append(Flag(type="info", msg=f"Vendedor con {seller.ratings_count} calificaciones"))
            score_impact -= 5
        elif seller.ratings_count == 0:
            flags.append(Flag(type="warning", msg="Vendedor sin calificaciones"))
            score_impact += 10

    # Check ratings average (stars)
    if seller.ratings_average is not None:
        details["ratings_average"] = seller.ratings_average
        if seller.ratings_average >= 4.5:
            flags.append(Flag(type="info", msg=f"Excelente calificación: {seller.ratings_average:.1f} estrellas ⭐"))
            score_impact -= 10  # Strong positive
        elif seller.ratings_average >= 4.0:
            flags.append(Flag(type="info", msg=f"Buena calificación: {seller.ratings_average:.1f} estrellas"))
            score_impact -= 5
        elif seller.ratings_average < 3.0:
            flags.append(Flag(type="critical", msg=f"Calificación baja: {seller.ratings_average:.1f} estrellas"))
            score_impact += 20

    # Check badges (very positive signals)
    if seller.badges and len(seller.badges) > 0:
        details["badges"] = seller.badges
        for badge in seller.badges:
            badge_lower = badge.lower()
            if 'buena calificación' in badge_lower or 'good rating' in badge_lower:
                flags.append(Flag(type="info", msg=f"🏆 Insignia: {badge}"))
                score_impact -= 10
            elif 'responde rápido' in badge_lower or 'responds quickly' in badge_lower:
                flags.append(Flag(type="info", msg=f"⚡ Insignia: {badge}"))
                score_impact -= 5
            elif 'destacado' in badge_lower or 'top' in badge_lower:
                flags.append(Flag(type="info", msg=f"🌟 Vendedor destacado"))
                score_impact -= 15

    # Check strengths (Comunicación, Puntualidad, etc.)
    if seller.strengths and len(seller.strengths) > 0:
        details["strengths"] = seller.strengths
        total_positive_reviews = 0
        for strength in seller.strengths:
            # Parse format like "Comunicación (13)"
            match = re.search(r'\((\d+)\)', strength)
            if match:
                total_positive_reviews += int(match.group(1))

        if total_positive_reviews >= 20:
            flags.append(Flag(type="info", msg=f"Vendedor con {total_positive_reviews}+ reseñas positivas en aspectos clave"))
            score_impact -= 10
        elif total_positive_reviews >= 5:
            strength_summary = ", ".join(seller.strengths[:3])
            flags.append(Flag(type="info", msg=f"Fortalezas del vendedor: {strength_summary}"))
            score_impact -= 5

    # Check if we have a profile screenshot (indicates deep investigation worked)
    if seller.profile_screenshot:
        details["profile_investigated"] = True

    # Ensure score_impact doesn't go too negative (floor at -30)
    score_impact = max(score_impact, -30)

    return {
        "flags": flags,
        "details": details,
        "score_impact": score_impact
    }


async def pricing_agent(request: MarketplaceRequest) -> dict:
    """
    Analyzes pricing for too-good-to-be-true patterns.

    Checks:
    - Price vs typical market value (when detectable)
    - Free items (sometimes legitimate, sometimes bait)
    - Suspiciously round numbers
    """
    flags = []
    details = {}
    score_impact = 0

    listing = request.listing
    if not listing or not listing.price:
        return {"flags": flags, "details": details, "score_impact": 0}

    price = parse_price(listing.price)
    details["price_raw"] = listing.price

    # Define these outside price check so they're available for urgency check
    title_lower = (listing.title or "").lower()
    description_lower = (listing.description or "").lower()

    if price is not None:
        details["price_numeric"] = price

        # Free item analysis
        if price == 0:
            flags.append(Flag(type="warning", msg="Artículo gratis - verifica que no sea carnada"))
            score_impact += 10

        # Very low price for electronics/high-value items (heuristic)
        high_value_keywords = ['iphone', 'macbook', 'playstation', 'ps5', 'xbox', 'nintendo', 'laptop', 'samsung', 'gpu', 'rtx']

        for keyword in high_value_keywords:
            if keyword in title_lower:
                if price > 0 and price < 100:
                    flags.append(Flag(
                        type="critical",
                        msg=f"Precio sospechosamente bajo para {keyword.upper()}: {listing.price}"
                    ))
                    score_impact += 25
                elif price > 0 and price < 300:
                    flags.append(Flag(
                        type="warning",
                        msg=f"Precio muy bajo para {keyword.upper()}: {listing.price}"
                    ))
                    score_impact += 10
                break

    # Check for urgency in title/description - tracked in details only
    urgency_patterns = ['urge', 'urgente', 'hoy', 'today only', 'must go', 'moving']
    for pattern in urgency_patterns:
        if pattern in title_lower or pattern in description_lower:
            details["has_urgency"] = True
            break

    return {
        "flags": flags,
        "details": details,
        "score_impact": score_impact
    }


# Market price reference data (approximate USD values for comparison)
MARKET_PRICE_RANGES = {
    # Electronics - Phones
    "iphone 15 pro max": (900, 1400),
    "iphone 15 pro": (800, 1200),
    "iphone 15": (600, 1000),
    "iphone 14 pro max": (700, 1100),
    "iphone 14 pro": (600, 1000),
    "iphone 14": (500, 800),
    "iphone 13": (400, 700),
    "iphone 12": (300, 500),
    "iphone 11": (200, 400),
    "samsung galaxy s24": (600, 1000),
    "samsung galaxy s23": (500, 900),
    "samsung galaxy s22": (400, 700),

    # Electronics - Computers
    "macbook pro 16": (1500, 3500),
    "macbook pro 14": (1200, 3000),
    "macbook pro 13": (800, 2000),
    "macbook air m2": (800, 1500),
    "macbook air m1": (600, 1200),
    "macbook air": (500, 1500),
    "imac": (800, 2500),
    "ipad pro": (500, 1500),
    "ipad air": (400, 900),
    "ipad": (250, 600),

    # Gaming
    "ps5": (350, 600),
    "playstation 5": (350, 600),
    "xbox series x": (350, 550),
    "xbox series s": (200, 350),
    "nintendo switch oled": (280, 400),
    "nintendo switch": (200, 350),
    "steam deck": (350, 700),

    # Graphics Cards
    "rtx 4090": (1500, 2500),
    "rtx 4080": (900, 1500),
    "rtx 4070": (500, 800),
    "rtx 3080": (400, 800),
    "rtx 3070": (300, 600),
    "rtx 3060": (200, 400),

    # Other
    "airpods pro": (150, 280),
    "airpods max": (350, 600),
    "apple watch ultra": (500, 900),
    "apple watch series 9": (300, 500),
    "apple watch": (150, 500),
}


def find_product_match(title: str) -> Optional[tuple]:
    """Find matching product in price database and return (product_name, min_price, max_price)."""
    title_lower = title.lower()

    # Sort by key length (longest first) to match more specific products first
    sorted_products = sorted(MARKET_PRICE_RANGES.keys(), key=len, reverse=True)

    for product in sorted_products:
        if product in title_lower:
            min_price, max_price = MARKET_PRICE_RANGES[product]
            return (product, min_price, max_price)

    return None


async def price_analysis_agent(request: MarketplaceRequest) -> dict:
    """
    Advanced price analysis with market comparison.

    Checks:
    - Price vs market value for known products
    - Too-good-to-be-true detection with specific thresholds
    - Price reasonability scoring
    - Suspicious pricing patterns
    """
    flags = []
    details = {}
    score_impact = 0

    listing = request.listing
    if not listing or not listing.price:
        details["price_analysis_available"] = False
        return {"flags": flags, "details": details, "score_impact": 0}

    price = parse_price(listing.price)
    title = listing.title or ""

    details["price_raw"] = listing.price
    details["price_numeric"] = price
    details["price_analysis_available"] = True

    if price is None:
        # Price not parseable - skip silently
        return {"flags": flags, "details": details, "score_impact": 0}

    # Find matching product in our database
    product_match = find_product_match(title)

    if product_match:
        product_name, min_market, max_market = product_match
        details["matched_product"] = product_name
        details["market_price_min"] = min_market
        details["market_price_max"] = max_market

        # Calculate how the price compares to market
        mid_market = (min_market + max_market) / 2

        if price == 0:
            # Free high-value item is extremely suspicious
            flags.append(Flag(
                type="critical",
                msg=f"🚨 {product_name.upper()} GRATIS - Muy probablemente estafa"
            ))
            score_impact += 35
            details["price_tier"] = "scam"
            details["price_vs_market"] = "free"

        elif price < min_market * 0.3:
            # Less than 30% of minimum market price
            flags.append(Flag(
                type="critical",
                msg=f"🚨 Precio ridículamente bajo para {product_name}: ${price:,.0f} (mercado: ${min_market:,.0f}-${max_market:,.0f})"
            ))
            score_impact += 30
            details["price_tier"] = "scam"
            details["price_vs_market"] = "extreme_low"

        elif price < min_market * 0.5:
            # Less than 50% of minimum market price
            flags.append(Flag(
                type="critical",
                msg=f"⚠️ Precio muy sospechoso para {product_name}: ${price:,.0f} (mercado: ${min_market:,.0f}-${max_market:,.0f})"
            ))
            score_impact += 20
            details["price_tier"] = "very_suspicious"
            details["price_vs_market"] = "very_low"

        elif price < min_market * 0.7:
            # Less than 70% of minimum market price
            flags.append(Flag(
                type="warning",
                msg=f"Precio bajo para {product_name}: ${price:,.0f} (mercado: ${min_market:,.0f}-${max_market:,.0f})"
            ))
            score_impact += 10
            details["price_tier"] = "suspicious"
            details["price_vs_market"] = "low"

        elif price <= max_market * 1.1:
            # Within reasonable market range (up to 10% above max)
            flags.append(Flag(
                type="info",
                msg=f"✓ Precio razonable para {product_name}: ${price:,.0f}"
            ))
            score_impact -= 5  # Positive signal
            details["price_tier"] = "fair"
            details["price_vs_market"] = "market_rate"

        else:
            # Above market price
            flags.append(Flag(
                type="info",
                msg=f"Precio por encima del mercado para {product_name}: ${price:,.0f}"
            ))
            details["price_tier"] = "high"
            details["price_vs_market"] = "above_market"

        # Calculate discount percentage
        if mid_market > 0:
            discount_pct = ((mid_market - price) / mid_market) * 100
            details["discount_from_market"] = round(discount_pct, 1)

    else:
        # No specific product match - do generic analysis
        details["matched_product"] = None

        if price == 0:
            flags.append(Flag(type="warning", msg="Artículo gratis - verifica legitimidad"))
            score_impact += 10
            details["price_tier"] = "free"
        elif price < 10:
            flags.append(Flag(type="info", msg="Precio muy bajo - verifica que sea real"))
            score_impact += 5
            details["price_tier"] = "very_low"
        else:
            details["price_tier"] = "unknown"

    # Check for suspicious pricing patterns
    if price and price > 0:
        # Suspiciously round numbers for high-value items
        if price >= 100 and price % 100 == 0 and price < 1000:
            details["suspiciously_round"] = True

        # Check condition vs price
        if listing.condition:
            condition_lower = listing.condition.lower()
            if "new" in condition_lower or "nuevo" in condition_lower:
                details["claimed_condition"] = "new"
            elif "used" in condition_lower or "usado" in condition_lower:
                details["claimed_condition"] = "used"

    return {
        "flags": flags,
        "details": details,
        "score_impact": score_impact
    }


class ImageAnalysisResult(BaseModel):
    """Structured response from LLM for image analysis."""
    is_stock_photo: bool = Field(
        default=False,
        description="True if image appears to be a stock photo or taken from the internet"
    )
    is_professional: bool = Field(
        default=False,
        description="True if photo looks professionally taken (studio lighting, perfect angles)"
    )
    has_watermark: bool = Field(
        default=False,
        description="True if image contains visible watermarks"
    )
    background_consistent: bool = Field(
        default=True,
        description="True if background/setting looks consistent and authentic"
    )
    shows_actual_product: bool = Field(
        default=True,
        description="True if the image clearly shows the actual product being sold"
    )
    confidence: int = Field(
        default=50,
        ge=0,
        le=100,
        description="Confidence in image authenticity (0=likely fake, 100=definitely real)"
    )
    concerns: List[str] = Field(
        default=[],
        description="List of concerns about the images (in Spanish)"
    )
    positive_signals: List[str] = Field(
        default=[],
        description="List of positive authenticity signals (in Spanish)"
    )
    product_description: str = Field(
        default="",
        description="Brief description of what is shown in the image - the product, its apparent condition, notable details (in Spanish)"
    )
    apparent_condition: str = Field(
        default="",
        description="The apparent condition of the product: 'nuevo', 'como nuevo', 'usado', 'muy usado', 'dañado' (in Spanish)"
    )


async def image_analysis_agent(request: MarketplaceRequest) -> dict:
    """
    Analyzes listing images for authenticity using Claude Vision.

    Uses AI vision to detect:
    - Stock photos
    - Stolen/reused images
    - Inconsistent backgrounds
    - Professional vs personal photos
    - Watermarks
    """
    flags = []
    details = {}
    score_impact = 0

    # Check image count
    image_count = len(request.listing_images)
    if request.listing and request.listing.image_count:
        image_count = request.listing.image_count

    details["image_count"] = image_count

    if image_count == 0:
        flags.append(Flag(type="warning", msg="Publicación sin imágenes"))
        score_impact += 15
        details["image_quality_tier"] = "none"
    elif image_count == 1:
        score_impact += 5
        details["image_quality_tier"] = "minimal"
    elif image_count >= 5:
        flags.append(Flag(type="info", msg=f"Múltiples imágenes disponibles ({image_count})"))
        score_impact -= 5  # Positive signal
        details["image_quality_tier"] = "excellent"
    elif image_count >= 3:
        details["image_quality_tier"] = "good"
    else:
        details["image_quality_tier"] = "adequate"

    # Perform AI vision analysis if screenshot is available
    # OPTIMIZED: Simplified prompt for faster response
    print(f"[IMAGE_ANALYSIS] Screenshot available: {bool(request.screenshot_base64)}")
    if request.screenshot_base64:
        print(f"[IMAGE_ANALYSIS] Screenshot length: {len(request.screenshot_base64)} chars")
        details["screenshot_available"] = True

        # Vision analysis with detailed product description
        user_content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": request.screenshot_base64
                }
            },
            {
                "type": "text",
                "text": """Analiza esta imagen de una publicación de Facebook Marketplace.

1. ¿Las fotos parecen de stock/internet o tomadas por el vendedor?
2. ¿Hay marcas de agua o logos?
3. ¿Se ve el producto claramente? ¿En qué estado aparenta estar?
4. ¿El entorno/fondo es consistente (casa real vs estudio)?
5. Describe brevemente qué ves en la imagen del producto."""
            }
        ]

        messages = [
            {
                "role": "system",
                "content": """Eres un experto analizando imágenes de productos en marketplace.
Tu trabajo es evaluar la autenticidad de las fotos y describir lo que ves.

En tu análisis incluye:
- Si las fotos parecen auténticas o de internet
- El estado aparente del producto (nuevo, usado, dañado)
- Cualquier detalle sospechoso o positivo que notes
- Una breve descripción de lo que muestra la imagen

Sé específico y útil para el comprador."""
            },
            {
                "role": "user",
                "content": user_content
            }
        ]

        try:
            print("[IMAGE_ANALYSIS] Calling LLM for image analysis...")
            result = await call_structured_llm(messages, ImageAnalysisResult, max_tokens=800)
            print(f"[IMAGE_ANALYSIS] LLM result: {result}")

            if result:
                details["ai_analysis"] = {
                    "is_stock_photo": result.is_stock_photo,
                    "is_professional": result.is_professional,
                    "has_watermark": result.has_watermark,
                    "background_consistent": result.background_consistent,
                    "shows_actual_product": result.shows_actual_product,
                    "confidence": result.confidence,
                    "product_description": result.product_description,
                    "apparent_condition": result.apparent_condition
                }

                # Apply flags based on AI analysis
                if result.is_stock_photo:
                    flags.append(Flag(type="critical", msg="🚨 Las imágenes parecen ser fotos de stock/internet"))
                    score_impact += 25

                if result.has_watermark:
                    flags.append(Flag(type="warning", msg="⚠️ Las imágenes tienen marcas de agua"))
                    score_impact += 15

                if result.is_professional and not result.shows_actual_product:
                    flags.append(Flag(type="warning", msg="⚠️ Fotos muy profesionales para marketplace personal"))
                    score_impact += 10

                if not result.background_consistent:
                    flags.append(Flag(type="warning", msg="⚠️ Fondo inconsistente en las imágenes"))
                    score_impact += 10

                if not result.shows_actual_product:
                    flags.append(Flag(type="warning", msg="⚠️ No se muestra claramente el producto real"))
                    score_impact += 10

                # Add concerns as flags
                for concern in result.concerns:
                    flags.append(Flag(type="warning", msg=concern))

                # Add positive signals
                for positive in result.positive_signals:
                    flags.append(Flag(type="info", msg=f"✓ {positive}"))

                # Adjust score based on confidence
                if result.confidence >= 80:
                    flags.append(Flag(type="info", msg="✓ Imágenes parecen auténticas"))
                    score_impact -= 5
                elif result.confidence < 40:
                    flags.append(Flag(type="warning", msg="Baja confianza en autenticidad de imágenes"))
                    score_impact += 10

                details["image_authenticity_confidence"] = result.confidence
        except Exception as e:
            print(f"[WARNING] Image analysis failed: {e}")
            details["ai_analysis_error"] = str(e)
    else:
        details["screenshot_available"] = False

    return {
        "flags": flags,
        "details": details,
        "score_impact": score_impact
    }


async def red_flags_agent(request: MarketplaceRequest) -> dict:
    """
    Detects common scam patterns and red flags.

    Checks:
    - Payment outside platform requests
    - Shipping-only for local marketplace
    - Contact info in description (bypassing FB)
    - Common scam phrases
    - Location mismatches
    """
    flags = []
    details = {}
    score_impact = 0

    listing = request.listing
    description = (listing.description if listing else "") or ""
    title = (listing.title if listing else "") or ""
    combined_text = f"{title} {description}".lower()

    # Payment red flags
    payment_red_flags = [
        ('zelle', 'Menciona Zelle (pago fuera de plataforma)'),
        ('venmo', 'Menciona Venmo (pago fuera de plataforma)'),
        ('cashapp', 'Menciona CashApp (pago fuera de plataforma)'),
        ('cash app', 'Menciona Cash App (pago fuera de plataforma)'),
        ('wire transfer', 'Solicita transferencia bancaria'),
        ('transferencia', 'Solicita transferencia bancaria'),
        ('gift card', 'Menciona tarjetas de regalo (común en estafas)'),
        ('tarjeta de regalo', 'Menciona tarjetas de regalo (común en estafas)'),
        ('crypto', 'Solicita pago en criptomonedas'),
        ('bitcoin', 'Solicita pago en Bitcoin'),
    ]

    for pattern, message in payment_red_flags:
        if pattern in combined_text:
            flags.append(Flag(type="critical", msg=message))
            score_impact += 20
            details["payment_red_flag"] = pattern
            break  # Only flag once for payment

    # Contact bypass red flags
    contact_red_flags = [
        ('whatsapp', 'Solicita contacto por WhatsApp (evita registro de FB)'),
        ('telegram', 'Solicita contacto por Telegram'),
        ('text me', 'Solicita contacto directo por texto'),
        ('call me', 'Solicita llamada directa'),
        ('escríbeme al', 'Solicita contacto fuera de Facebook'),
    ]

    for pattern, message in contact_red_flags:
        if pattern in combined_text:
            flags.append(Flag(type="warning", msg=message))
            score_impact += 10
            details["contact_bypass"] = pattern
            break

    # Email in description
    email_pattern = re.search(r'\b[\w.-]+@[\w.-]+\.\w+\b', combined_text)
    if email_pattern:
        flags.append(Flag(type="warning", msg="Email en la descripción"))
        score_impact += 5
        details["email_in_description"] = True

    # Scam phrases
    scam_phrases = [
        ('serious buyers only', 'Frase común en estafas: "serious buyers only"'),
        ('solo compradores serios', 'Frase común en estafas: "solo compradores serios"'),
        ('no lowballers', 'Frase defensiva común'),
        ('price is firm', 'Precio no negociable puede indicar urgencia'),
        ('send deposit', 'Solicita depósito por adelantado'),
        ('deposito', 'Solicita depósito por adelantado'),
        ('shipping only', 'Solo envío (no permite verificar en persona)'),
        ('solo envio', 'Solo envío (no permite verificar en persona)'),
    ]

    for pattern, message in scam_phrases:
        if pattern in combined_text:
            flags.append(Flag(type="info", msg=message))
            # Lower impact for these - they're suspicious but not definitive
            score_impact += 3

    # Location mismatch check
    if listing and listing.location and request.seller and request.seller.location:
        if listing.location.lower() != request.seller.location.lower():
            flags.append(Flag(
                type="warning",
                msg=f"Ubicación del artículo ({listing.location}) diferente al vendedor ({request.seller.location})"
            ))
            score_impact += 10
            details["location_mismatch"] = True

    # Check listing age
    if listing and listing.posted_date:
        days_posted = parse_posted_days(listing.posted_date)
        if days_posted is not None:
            details["days_posted"] = days_posted
            # days_posted tracked in details, no need for flag

    return {
        "flags": flags,
        "details": details,
        "score_impact": score_impact
    }


async def description_quality_agent(request: MarketplaceRequest) -> dict:
    """
    Analyzes listing description quality and completeness.

    Checks:
    - Description length (too short = suspicious)
    - Presence of key details (brand, model, condition specifics)
    - Grammar and spelling quality indicators
    - Generic/copy-paste patterns
    - ALL CAPS usage
    - Excessive punctuation/emojis
    - Vague language
    """
    flags = []
    details = {}
    score_impact = 0

    listing = request.listing
    description = (listing.description if listing else "") or ""
    title = (listing.title if listing else "") or ""

    details["has_description"] = bool(description.strip())
    details["description_length"] = len(description)

    # Empty or no description
    if not description.strip():
        flags.append(Flag(type="warning", msg="Publicación sin descripción"))
        score_impact += 15
        details["quality_score"] = 0
        return {"flags": flags, "details": details, "score_impact": score_impact}

    # Description length analysis
    desc_len = len(description)
    if desc_len < 20:
        flags.append(Flag(type="warning", msg="Descripción muy corta (menos de 20 caracteres)"))
        score_impact += 10
        details["length_rating"] = "very_short"
    elif desc_len < 50:
        score_impact += 5
        details["length_rating"] = "short"
    elif desc_len >= 150:
        score_impact -= 5  # Positive signal
        details["length_rating"] = "detailed"
    else:
        details["length_rating"] = "adequate"

    # Check for ALL CAPS (suspicious)
    upper_ratio = sum(1 for c in description if c.isupper()) / max(len(description), 1)
    details["uppercase_ratio"] = round(upper_ratio, 2)
    if upper_ratio > 0.5 and desc_len > 20:
        flags.append(Flag(type="warning", msg="Descripción mayormente en MAYÚSCULAS"))
        score_impact += 5

    # Check for excessive punctuation/emojis
    punctuation_count = len(re.findall(r'[!?]{2,}', description))
    emoji_count = len(re.findall(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF]', description))
    details["excessive_punctuation"] = punctuation_count
    details["emoji_count"] = emoji_count

    if punctuation_count > 3:
        score_impact += 3

    # Check for vague/uninformative language
    vague_patterns = [
        (r'contacta?r?\s*(para|for)\s*(más|more|m[aá]s)\s*(info|información|details)', 'Información vaga: "contactar para más info"'),
        (r'pregunt[ae]r?\s*(por|for)', 'Información vaga: "preguntar por detalles"'),
        (r'no\s+preguntas?\s+tontas?', 'Lenguaje hostil hacia compradores'),
        (r'solo\s+interesados?', 'Filtro de compradores'),
    ]

    for pattern, message in vague_patterns:
        if re.search(pattern, description.lower()):
            flags.append(Flag(type="info", msg=message))
            score_impact += 2

    # Check for specific details (positive signals)
    specificity_patterns = [
        (r'\b\d+\s*(gb|tb|inch|pulgadas?|cm|mm|kg|lb)\b', 'specs'),
        (r'\b(modelo|model|serie|series)\s*:?\s*\w+', 'model'),
        (r'\b(marca|brand)\s*:?\s*\w+', 'brand'),
        (r'\b\d{4}\b', 'year'),  # Year mention
        (r'\b(original|auténtico|genuine|authentic)\b', 'authenticity'),
        (r'\b(garant[ií]a|warranty)\b', 'warranty'),
        (r'\b(factura|receipt|invoice)\b', 'receipt'),
    ]

    specific_details_found = []
    for pattern, detail_type in specificity_patterns:
        if re.search(pattern, description.lower()):
            specific_details_found.append(detail_type)

    details["specific_details"] = specific_details_found
    details["specificity_count"] = len(specific_details_found)

    if len(specific_details_found) >= 3:
        flags.append(Flag(type="info", msg=f"Descripción con detalles específicos ({', '.join(specific_details_found[:3])})"))
        score_impact -= 5  # Positive signal
    # elif len(specific_details_found) >= 1: - Skip generic message

    # Check if description matches title (consistency)
    title_words = set(title.lower().split())
    desc_words = set(description.lower().split())
    common_words = title_words & desc_words
    relevance_score = len(common_words) / max(len(title_words), 1)
    details["title_description_relevance"] = round(relevance_score, 2)

    # Calculate overall quality score (0-100)
    quality_score = 50  # Base score
    quality_score += min(desc_len / 5, 20)  # Up to +20 for length
    quality_score += len(specific_details_found) * 5  # Up to +35 for details
    quality_score -= score_impact  # Subtract penalties
    quality_score = max(0, min(100, quality_score))

    details["quality_score"] = round(quality_score)

    return {
        "flags": flags,
        "details": details,
        "score_impact": score_impact
    }


async def seller_history_agent(request: MarketplaceRequest) -> dict:
    """
    Analyzes seller's posting history and activity patterns.

    Checks:
    - Number of previous posts
    - First-time seller detection
    - Activity consistency
    - Post frequency patterns
    """
    flags = []
    details = {}
    score_impact = 0

    seller = request.seller
    if not seller:
        return {"flags": flags, "details": details, "score_impact": 0}

    # Parse listings count
    listings_count = parse_listings_count(seller.listings_count)
    details["listings_count_parsed"] = listings_count

    if listings_count is not None:
        details["has_listing_history"] = listings_count > 0

        # Granular post count scoring
        if listings_count == 0:
            flags.append(Flag(type="critical", msg="Primera publicación del vendedor (sin historial)"))
            score_impact += 25
            details["seller_experience"] = "first_time"
        elif listings_count <= 2:
            flags.append(Flag(type="warning", msg=f"Vendedor con muy pocas publicaciones ({listings_count})"))
            score_impact += 15
            details["seller_experience"] = "beginner"
        elif listings_count <= 5:
            flags.append(Flag(type="info", msg=f"Vendedor con pocas publicaciones ({listings_count})"))
            score_impact += 5
            details["seller_experience"] = "novice"
        elif listings_count <= 20:
            flags.append(Flag(type="info", msg=f"Vendedor con historial moderado ({listings_count}+ publicaciones)"))
            details["seller_experience"] = "moderate"
        elif listings_count <= 50:
            flags.append(Flag(type="info", msg=f"Vendedor experimentado ({listings_count}+ publicaciones)"))
            score_impact -= 10  # Positive
            details["seller_experience"] = "experienced"
        else:
            flags.append(Flag(type="info", msg=f"Vendedor muy activo ({listings_count}+ publicaciones)"))
            score_impact -= 15  # Strong positive
            details["seller_experience"] = "power_seller"
    else:
        # No listing history available - skip silently
        details["has_listing_history"] = None

    # Check other_listings_count as fallback
    if seller.other_listings_count is not None and listings_count is None:
        details["other_listings_count"] = seller.other_listings_count
        if seller.other_listings_count == 0:
            flags.append(Flag(type="warning", msg="Este es el único artículo del vendedor"))
            score_impact += 10

    return {
        "flags": flags,
        "details": details,
        "score_impact": score_impact
    }


class SupplierConfidenceResult(BaseModel):
    """Structured response from the LLM for supplier confidence analysis."""
    confidence_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Confidence score from 0-100. 0 = definitely a scam, 100 = completely trustworthy seller."
    )
    risk_level: str = Field(
        ...,
        description="One of: 'safe', 'suspicious', 'dangerous'"
    )
    verdict_title: str = Field(
        ...,
        description="Short catchy verdict title in Spanish (max 10 words). Be creative and slightly cynical."
    )
    verdict_message: str = Field(
        ...,
        description="Detailed explanation in Spanish (2-4 sentences) explaining the score and key concerns/positives."
    )
    key_concerns: List[str] = Field(
        default=[],
        description="List of main red flags or concerns identified (in Spanish)"
    )
    positive_signals: List[str] = Field(
        default=[],
        description="List of positive trust signals identified (in Spanish)"
    )


def _build_seller_summary(request: MarketplaceRequest) -> str:
    """Build a text summary of seller data for the LLM."""
    seller = request.seller
    if not seller:
        return "No se pudo obtener información del vendedor."

    parts = []

    if seller.name:
        parts.append(f"- Nombre: {seller.name}")
    if seller.join_date:
        parts.append(f"- Fecha de ingreso: {seller.join_date}")
        join_year = parse_join_year(seller.join_date)
        if join_year:
            years_on_platform = datetime.now().year - join_year
            parts.append(f"- Años en la plataforma: {years_on_platform}")
    if seller.location:
        parts.append(f"- Ubicación del vendedor: {seller.location}")
    if seller.listings_count:
        parts.append(f"- Número de publicaciones: {seller.listings_count}")
    if seller.followers_count is not None:
        parts.append(f"- Seguidores: {seller.followers_count}")
    if seller.ratings_count is not None:
        parts.append(f"- Número de calificaciones: {seller.ratings_count}")
    if seller.ratings_average is not None:
        parts.append(f"- Calificación promedio: {seller.ratings_average} estrellas")
    if seller.badges:
        parts.append(f"- Insignias: {', '.join(seller.badges)}")
    if seller.strengths:
        parts.append(f"- Fortalezas: {', '.join(seller.strengths)}")
    if seller.response_rate:
        parts.append(f"- Tasa de respuesta: {seller.response_rate}")

    return "\n".join(parts) if parts else "Información del vendedor no disponible."


def _build_listing_summary(request: MarketplaceRequest) -> str:
    """Build a text summary of listing data for the LLM."""
    listing = request.listing
    if not listing:
        return "No se pudo obtener información de la publicación."

    parts = []

    if listing.title:
        parts.append(f"- Título: {listing.title}")
    if listing.price:
        parts.append(f"- Precio: {listing.price}")
    if listing.description:
        # Truncate long descriptions
        desc = listing.description[:500] + "..." if len(listing.description) > 500 else listing.description
        parts.append(f"- Descripción: {desc}")
    if listing.condition:
        parts.append(f"- Condición: {listing.condition}")
    if listing.location:
        parts.append(f"- Ubicación del artículo: {listing.location}")
    if listing.posted_date:
        parts.append(f"- Fecha de publicación: {listing.posted_date}")
    if listing.image_count is not None:
        parts.append(f"- Número de imágenes: {listing.image_count}")

    return "\n".join(parts) if parts else "Información de la publicación no disponible."


def _build_flags_summary(flags: List[Flag]) -> str:
    """Build a summary of detected flags for the LLM."""
    if not flags:
        return "No se detectaron banderas de alerta."

    critical = [f.msg for f in flags if f.type == "critical"]
    warnings = [f.msg for f in flags if f.type == "warning"]
    info = [f.msg for f in flags if f.type == "info"]

    parts = []
    if critical:
        parts.append(f"ALERTAS CRÍTICAS:\n" + "\n".join(f"  - {m}" for m in critical))
    if warnings:
        parts.append(f"ADVERTENCIAS:\n" + "\n".join(f"  - {m}" for m in warnings))
    if info:
        parts.append(f"INFORMACIÓN:\n" + "\n".join(f"  - {m}" for m in info))

    return "\n\n".join(parts)


async def supplier_confidence_agent(
    request: MarketplaceRequest,
    rule_based_flags: List[Flag] = None,
    image_analysis: dict = None
) -> dict:
    """
    LLM-based agent that analyzes ALL seller/listing data holistically.

    This agent receives:
    - All scraped seller information (name, join date, ratings, badges, etc.)
    - All listing information (title, price, description, images, etc.)
    - Screenshots (listing and seller profile)
    - Flags from rule-based agents

    Returns:
    - confidence_score: 0-100 score determined by the LLM
    - verdict_title: Creative Spanish title
    - verdict_message: Detailed explanation
    - key_concerns: List of red flags
    - positive_signals: List of trust signals
    """

    seller_summary = _build_seller_summary(request)
    listing_summary = _build_listing_summary(request)
    flags_summary = _build_flags_summary(rule_based_flags or [])

    # Build image analysis summary
    image_summary = "No se analizaron imágenes."
    if image_analysis:
        img_parts = []
        if image_analysis.get("product_description"):
            img_parts.append(f"- Descripción visual: {image_analysis['product_description']}")
        if image_analysis.get("apparent_condition"):
            img_parts.append(f"- Estado aparente: {image_analysis['apparent_condition']}")
        if image_analysis.get("is_stock_photo") is not None:
            img_parts.append(f"- ¿Foto de stock/internet?: {'Sí ⚠️' if image_analysis['is_stock_photo'] else 'No ✓'}")
        if image_analysis.get("has_watermark") is not None:
            img_parts.append(f"- ¿Tiene marca de agua?: {'Sí ⚠️' if image_analysis['has_watermark'] else 'No ✓'}")
        if image_analysis.get("shows_actual_product") is not None:
            img_parts.append(f"- ¿Muestra producto real?: {'Sí ✓' if image_analysis['shows_actual_product'] else 'No ⚠️'}")
        if image_analysis.get("confidence") is not None:
            img_parts.append(f"- Confianza en autenticidad: {image_analysis['confidence']}%")
        if img_parts:
            image_summary = "\n".join(img_parts)

    # Build the prompt with Chilean tone and detailed explanations
    user_content = []

    analysis_text = f"""Analiza esta publicación de Facebook Marketplace:

VENDEDOR:
{seller_summary}

PUBLICACIÓN:
{listing_summary}

ANÁLISIS DE IMÁGENES:
{image_summary}

ALERTAS DETECTADAS:
{flags_summary}

Necesito que:
1. Evalúes la confiabilidad del vendedor (score 0-100)
2. Expliques EN DETALLE por qué es o no confiable, INCLUYENDO observaciones sobre las imágenes
3. Menciones las señales positivas y negativas específicas
4. Comenta sobre el estado del producto según las imágenes
5. Des un veredicto completo que integre TODO: vendedor, precio, descripción E IMÁGENES"""
    user_content.append({"type": "text", "text": analysis_text})

    messages = [
        {
            "role": "system",
            "content": """Eres un experto chileno en detectar estafas en Facebook Marketplace. Tu personalidad:

ESTILO:
- Eres directo y sin rodeos, pero explicativo
- Tienes un humor negro y eres ligeramente cínico
- Te preocupas genuinamente por proteger al comprador

TÍTULOS CREATIVOS (ejemplos):
- "Huele a humo... y no es asado"
- "Este vendedor brilla más que el sol"
- "No le compraría ni chicle a este compadre"
- "Procede con ojo, puede ser trucho"
- "La firme, se ve legit"

TU ANÁLISIS DEBE INCLUIR:
1. verdict_message: Explicación DETALLADA (4-5 oraciones) que DEBE mencionar:
   - Información del vendedor (antigüedad, calificaciones)
   - Análisis del precio (¿razonable o sospechoso?)
   - DESCRIPCIÓN DE LAS IMÁGENES: qué se ve, estado del producto, si parecen auténticas
   - Conclusión y recomendación

2. key_concerns: Lista preocupaciones específicas incluyendo sobre las imágenes si aplica
   (ej: "Fotos parecen de catálogo", "Producto se ve muy usado para el precio")

3. positive_signals: Lista señales positivas incluyendo sobre las imágenes
   (ej: "Fotos reales tomadas en casa", "Se ve el producto desde varios ángulos")

CRITERIOS DE SCORE:
- 80-100: Vendedor confiable, bajo riesgo (cuenta antigua, buenas reviews, precio razonable, fotos auténticas)
- 50-79: Sospechoso, proceder con precaución (algunos red flags pero no definitivos)
- 0-49: Alto riesgo de estafa (cuenta nueva, precio irreal, fotos de stock, señales claras de scam)"""
        },
        {
            "role": "user",
            "content": user_content
        }
    ]

    result = await call_structured_llm(messages, SupplierConfidenceResult, max_tokens=1500)

    if result:
        # Convert LLM concerns/positives to flags
        flags = []
        for concern in result.key_concerns:
            flags.append(Flag(type="warning", msg=concern))
        for positive in result.positive_signals:
            flags.append(Flag(type="info", msg=f"✓ {positive}"))

        return {
            "flags": flags,
            "details": {
                "confidence_score": result.confidence_score,
                "risk_level": result.risk_level,
                "key_concerns": result.key_concerns,
                "positive_signals": result.positive_signals,
                "analysis_method": "llm"
            },
            "score": result.confidence_score,  # Direct LLM score
            "risk_level": result.risk_level,
            "verdict_title": result.verdict_title,
            "verdict_message": result.verdict_message
        }
    else:
        # Fallback if LLM fails
        return {
            "flags": [Flag(type="warning", msg="No se pudo completar el análisis de IA")],
            "details": {"analysis_method": "fallback"},
            "score": 50,  # Neutral score on failure
            "risk_level": "suspicious",
            "verdict_title": "Análisis incompleto",
            "verdict_message": "No pudimos analizar completamente esta publicación. Procede con precaución."
        }


# Keep the old function name as alias for backwards compatibility
async def marketplace_ai_verdict_agent(request: MarketplaceRequest) -> dict:
    """Deprecated: Use supplier_confidence_agent instead."""
    return await supplier_confidence_agent(request, [])
