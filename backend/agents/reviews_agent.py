import asyncio
import os
import re
import time
from typing import Dict, Any, List
from urllib.parse import urlparse

from tavily import TavilyClient

from schemas import AnalysisRequest, Flag
from llm import call_llm

# Enable logging
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def extract_domain(url: str) -> str:
    """Extract the domain name from a URL."""
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.path
    # Remove www. prefix if present
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def extract_business_name(request: AnalysisRequest) -> str:
    """
    Try to extract a business name from the request data.
    Priority: Brand name from title suffix > domain name
    """
    domain = extract_domain(request.url)
    domain_name = domain.split('.')[0]

    if request.title:
        separators = [' | ', ' - ', ' – ', ' — ']
        for sep in separators:
            if sep in request.title:
                parts = request.title.split(sep)
                if len(parts) >= 2:
                    brand = parts[-1].strip()
                    brand = re.sub(r'\s*(Chile|México|Argentina|España|Colombia|Online|Store|Shop|Tienda).*$', '', brand, flags=re.IGNORECASE).strip()
                    if brand and len(brand) > 2:
                        return brand

    return domain_name.capitalize()


async def reviews_agent(request: AnalysisRequest) -> Dict[str, Any]:
    """
    Search for Google Business reviews and online reputation of the website.

    Features:
    - Searches for the Google Business listing associated with the website
    - Fetches actual reviews from Trustpilot and Google
    - Uses AI to summarize reviews and assess trustworthiness
    - Returns up to 5 reviews for display in a collapsible UI
    """
    start_time = time.time()
    logger.info("🔍 [REVIEWS] Starting analysis...")

    tavily_api_key = os.getenv("TAVILY_API_KEY")

    if not tavily_api_key:
        return {
            "flags": [Flag(type="info", msg="Review search skipped (TAVILY_API_KEY not configured)")],
            "details": {"reviews_checked": False, "reason": "API key not configured"},
            "score_impact": 0
        }

    try:
        client = TavilyClient(api_key=tavily_api_key)

        domain = extract_domain(request.url)
        business_name = extract_business_name(request)

        # Get base domain for filtering (e.g., "salomon" from "salomon.cl")
        domain_base = domain.split('.')[0]
        domain_tld = '.' + domain.split('.')[-1]

        # ============================================
        # PARALLEL SEARCHES: Google, Trustpilot, and General
        # ============================================
        searches_start = time.time()

        # Define search functions for parallel execution
        async def search_google():
            try:
                google_query = f'site:google.com/maps "{business_name}" OR "{domain}" reviews'
                return await asyncio.to_thread(
                    client.search,
                    query=google_query,
                search_depth="advanced",
                max_results=5,
                include_answer=True
            )
            except Exception as e:
                logger.error(f"✗ Google search failed: {str(e)}")
                return None
        
        async def search_trustpilot():
            try:
                tp_query = f'site:trustpilot.com "{domain}"'
                return await asyncio.to_thread(
                    client.search,
                    query=tp_query,
                    search_depth="advanced",
                    max_results=5,
                    include_answer=True
                )
            except Exception as e:
                logger.error(f"✗ Trustpilot search failed: {str(e)}")
                return None
        
        async def search_general():
            try:
                review_query = f'"{domain}" opiniones reseñas experiencia compra -"{domain_base}.com"'
                return await asyncio.to_thread(
                    client.search,
                    query=review_query,
                    search_depth="advanced",
                    max_results=5,
                    include_answer=True
                )
            except Exception as e:
                logger.error(f"✗ General search failed: {str(e)}")
                return None
        
        # Run all searches in parallel
        google_response, tp_response, review_response = await asyncio.gather(
            search_google(),
            search_trustpilot(),
            search_general()
        )
        
        logger.info(f"✓ All searches complete ({time.time() - searches_start:.2f}s)")

        # ============================================
        # STEP 1: Process Google Reviews
        # ============================================
        google_business_info = None
        google_reviews: List[Dict[str, Any]] = []

        if google_response:
            if google_response.get("answer"):
                google_business_info = {
                    "found": True,
                    "summary": google_response.get("answer", "")[:500]
                }

            # Extract Google review results - filter to only include results about THIS domain
            for result in google_response.get("results", []):
                content = result.get("content", "")
                title = result.get("title", "")
                url = result.get("url", "")

                # Skip results that are about a DIFFERENT domain (e.g., .com when we want .cl)
                content_lower = content.lower()

                # Skip if it mentions .com version when we're analyzing .cl (or vice versa)
                other_tlds = ['.com', '.net', '.org', '.es', '.mx', '.ar']

                is_wrong_domain = False
                for tld in other_tlds:
                    if tld != domain_tld and f"{domain_base}{tld}" in content_lower:
                        is_wrong_domain = True
                        break

                if is_wrong_domain:
                    continue

                # Skip support/help pages - we want actual reviews
                url_lower = url.lower()
                if "support.google.com" in url_lower or "help.google.com" in url_lower:
                    continue

                if content and len(content) > 50:
                    # Better source labeling
                    source = "Google"
                    if "trustpilot.com" in url_lower:
                        source = "Trustpilot"
                    elif "google.com/maps" in url_lower:
                        source = "Google Maps"

                    google_reviews.append({
                        "source": source,
                        "title": title[:100] if title else "Google Review",
                        "content": content[:300],
                        "url": url
                    })

        logger.info(f"✓ Google search: {len(google_reviews)} reviews")

        # ============================================
        # STEP 2: Process Trustpilot reviews
        # ============================================
        trustpilot_reviews: List[Dict[str, Any]] = []
        trustpilot_rating = None
        trustpilot_url = None

        if tp_response:
            for result in tp_response.get("results", []):
                url = result.get("url", "").lower()
                content = result.get("content", "")
                title = result.get("title", "")

                if "trustpilot.com" not in url:
                    continue

                url_has_exact_domain = domain.lower() in url
                content_lower = (content + " " + title).lower()
                other_tlds = ['.com', '.net', '.org', '.es', '.mx', '.ar', '.co', '.us', '.uk']

                is_wrong_domain = False
                for tld in other_tlds:
                    if tld != domain_tld:
                        wrong_domain = f"{domain_base}{tld}"
                        if wrong_domain in url and domain.lower() not in url:
                            is_wrong_domain = True
                            break
                        if f"reviews of {wrong_domain}" in content_lower or f"review/{wrong_domain}" in url:
                            if domain.lower() not in url:
                                is_wrong_domain = True
                                break

                if is_wrong_domain:
                    continue

                if url_has_exact_domain or domain.lower() in content_lower:
                    if not trustpilot_url or url_has_exact_domain:
                        trustpilot_url = result.get("url", "")

                    rating_match = re.search(r'(\d[.,]\d)\s*(out of 5|/5|stars|estrellas|-star)', content, re.IGNORECASE)
                    if rating_match and not trustpilot_rating:
                        trustpilot_rating = rating_match.group(1).replace(',', '.')

                    if content and len(content) > 50:
                        trustpilot_reviews.append({
                            "source": "Trustpilot",
                            "title": title[:100] if title else "Trustpilot Review",
                            "content": content[:300],
                            "url": result.get("url", "")
                        })

        logger.info(f"✓ Trustpilot search: {len(trustpilot_reviews)} reviews")

        # ============================================
        # STEP 3: Process general reviews
        # ============================================
        general_reviews: List[Dict[str, Any]] = []

        if review_response:
            for result in review_response.get("results", []):
                url = result.get("url", "").lower()
                content = result.get("content", "")
                title = result.get("title", "")

                if "trustpilot.com" in url:
                    continue

                content_lower = (content + " " + title).lower()
                other_tlds = ['.com', '.net', '.org', '.es', '.mx', '.ar', '.co', '.us', '.uk']

                is_wrong_domain = False
                for tld in other_tlds:
                    if tld != domain_tld:
                        wrong_domain = f"{domain_base}{tld}"
                        if wrong_domain in content_lower and domain.lower() not in content_lower:
                            is_wrong_domain = True
                            break

                if is_wrong_domain:
                    continue

                source = "Web"
                if "google" in url:
                    source = "Google"
                elif "facebook" in url:
                    source = "Facebook"
                elif "yelp" in url:
                    source = "Yelp"
                elif "reddit" in url:
                    source = "Reddit"

                if content and len(content) > 50:
                    general_reviews.append({
                        "source": source,
                        "title": title[:100] if title else "Review",
                        "content": content[:300],
                        "url": result.get("url", "")
                    })

        logger.info(f"✓ General search: {len(general_reviews)} reviews")

        # ============================================
        # STEP 4: Combine and limit reviews (mix Google, Trustpilot, and general)
        # ============================================
        all_reviews = []
        all_reviews.extend(trustpilot_reviews)
        all_reviews.extend(google_reviews)
        all_reviews.extend(general_reviews)

        # Remove duplicates based on URL
        seen_urls = set()
        unique_reviews = []
        for review in all_reviews:
            url = review.get("url", "").lower()
            if url not in seen_urls:
                seen_urls.add(url)
                unique_reviews.append(review)

        all_reviews = unique_reviews
        display_reviews = all_reviews[:5]

        # ============================================
        # STEP 5: AI Summary of reviews (only if we have enough reviews)
        # ============================================
        ai_start = time.time()
        review_summary = None
        sentiment_score = 50  # Neutral default
        key_positives = []
        key_negatives = []
        trust_assessment = "neutral"

        # Only use AI for summary if we have 3+ reviews (otherwise not enough data for meaningful analysis)
        if len(all_reviews) >= 3:
            try:
                reviews_text = "\n\n".join([
                    f"[{r['source']}] {r['title']}: {r['content']}"
                    for r in all_reviews[:10]
                ])

                summary_prompt = f"""Analiza las siguientes reseñas y opiniones sobre "{business_name}" ({domain}):

{reviews_text}

Proporciona un JSON con:
1. "summary": Un resumen conciso (2-3 oraciones) de la reputación general del negocio basado en las reseñas
2. "sentiment": Un score de 0-100 donde 0=muy negativo, 50=neutral, 100=muy positivo
3. "key_positives": Lista de hasta 3 aspectos positivos mencionados
4. "key_negatives": Lista de hasta 3 aspectos negativos o preocupaciones mencionadas
5. "trust_assessment": "trustworthy", "neutral", o "suspicious" basado en las reseñas

Responde SOLO con el JSON válido, sin markdown."""

                summary_response = await call_llm(
                    messages=[
                        {"role": "system", "content": "Eres un analista de reputación de negocios. Analiza reseñas objetivamente. Siempre responde en JSON válido sin markdown."},
                        {"role": "user", "content": summary_prompt}
                    ]
                )

                if summary_response:
                    import json
                    try:
                        json_str = summary_response.strip()
                        if json_str.startswith("```json"):
                            json_str = json_str[7:]
                        elif json_str.startswith("```"):
                            json_str = json_str[3:]
                        if json_str.endswith("```"):
                            json_str = json_str[:-3]
                        json_str = json_str.strip()

                        summary_data = json.loads(json_str)
                        review_summary = summary_data.get("summary", "")
                        sentiment_score = summary_data.get("sentiment", 50)
                        key_positives = summary_data.get("key_positives", [])
                        key_negatives = summary_data.get("key_negatives", [])
                        trust_assessment = summary_data.get("trust_assessment", "neutral")

                    except json.JSONDecodeError:
                        review_summary = summary_response[:500]
                        key_positives = []
                        key_negatives = []
                        trust_assessment = "neutral"

                logger.info(f"✓ AI summary: sentiment={sentiment_score} ({time.time() - ai_start:.2f}s)")

            except Exception as e:
                logger.error(f"✗ AI summary failed: {str(e)}")

        # ============================================
        # STEP 6: Calculate score impact
        # ============================================
        flags: List[Flag] = []
        score_impact = 0

        # Score based on sentiment
        if sentiment_score >= 70:
            flags.append(Flag(
                type="info",
                msg=f"✓ Reputación positiva en línea (puntuación: {sentiment_score}/100)"
            ))
            score_impact -= 5
        elif sentiment_score <= 30:
            flags.append(Flag(
                type="warning",
                msg=f"⚠️ Reputación negativa en línea (puntuación: {sentiment_score}/100)"
            ))
            score_impact += 10

        # Trustpilot specific
        if trustpilot_rating:
            try:
                rating_float = float(trustpilot_rating)
                if rating_float >= 4.0:
                    flags.append(Flag(
                        type="info",
                        msg=f"✓ Trustpilot: {trustpilot_rating}/5 estrellas"
                    ))
                elif rating_float < 2.5:
                    flags.append(Flag(
                        type="warning",
                        msg=f"⚠️ Trustpilot: {trustpilot_rating}/5 estrellas (bajo)"
                    ))
            except ValueError:
                pass

        # Trust assessment from AI
        if trust_assessment == "suspicious":
            flags.append(Flag(
                type="warning",
                msg="Las reseñas sugieren precaución con este sitio"
            ))
        elif trust_assessment == "trustworthy":
            flags.append(Flag(
                type="info",
                msg="✓ Las reseñas sugieren que es un sitio confiable"
            ))

        # No reviews found
        if len(all_reviews) == 0:
            flags.append(Flag(
                type="warning",
                msg="No se encontraron reseñas en línea para este negocio"
            ))
        else:
            sources = list(set([r["source"] for r in all_reviews]))
            summary_msg = f"📊 Se encontraron {len(all_reviews)} reseñas de {', '.join(sources)}"
            flags.append(Flag(
                type="info",
                msg=summary_msg
            ))

        score_impact = max(0, score_impact)

        total_time = time.time() - start_time
        logger.info(f"✓ Reviews analysis complete: {len(all_reviews)} reviews, score_impact={score_impact} ({total_time:.2f}s)")

        return {
            "flags": flags,
            "details": {
                "reviews_checked": True,
                "business_name": business_name,
                "domain": domain,
                "google_business": google_business_info,
                "trustpilot_rating": trustpilot_rating,
                "trustpilot_url": trustpilot_url,
                "review_summary": review_summary,
                "sentiment_score": sentiment_score,
                "trust_assessment": trust_assessment,
                "key_positives": key_positives if 'key_positives' in dir() else [],
                "key_negatives": key_negatives if 'key_negatives' in dir() else [],
                "reviews_count": len(all_reviews),
                "reviews": display_reviews  # Top 5 reviews for collapsible display
            },
            "score_impact": score_impact
        }

    except Exception as e:
        logger.error(f"✗ Reviews agent failed: {str(e)}")
        return {
            "flags": [Flag(type="info", msg=f"No se pudo completar la búsqueda de reseñas: {str(e)}")],
            "details": {"reviews_checked": False, "error": str(e)},
            "score_impact": 0
        }
