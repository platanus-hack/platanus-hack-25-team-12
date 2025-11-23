import re
import time
import logging
from typing import Optional, Dict
from pydantic import BaseModel, Field
from schemas import AnalysisRequest, Flag
from llm import call_structured_llm

logger = logging.getLogger(__name__)

# --- Result Schemas ---

class VisualSecurityCheck(BaseModel):
    phishing_detected: bool = Field(..., description="True if the site visually mimics a known brand but URL is different.")
    phishing_reasoning: str = Field(..., description="Explanation of why phishing is suspected or not.")
    purchase_button_present: bool = Field(..., description="True if a functional 'Buy', 'Add to Cart', or similar button is visible.")
    purchase_reasoning: str = Field(..., description="Details about the purchase element found or missing.")

class HtmlSecurityCheck(BaseModel):
    """Combined iframe and CSRF security check"""
    iframe_risk_detected: bool = Field(..., description="True if iframes are missing sandbox or are too permissive.")
    iframe_reasoning: str = Field(..., description="Details on the vulnerable iframes found.")
    csrf_risk_detected: bool = Field(..., description="True if critical forms (login/payment) lack CSRF protection.")
    csrf_reasoning: str = Field(..., description="Details on the missing CSRF tokens.")

class PriceSecurityCheck(BaseModel):
    suspiciously_low_price: bool = Field(..., description="True if the identified price is absurdly low for the product description.")
    reasoning: str = Field(..., description="Reasoning for why the price is considered suspicious or normal.")

# --- Extraction Helper ---

def extract_security_elements(html_content: str) -> Dict[str, str]:
    """
    Parses HTML to extract specific security-relevant sections.
    Returns a dict with 'iframes', 'forms', 'meta', 'price_context'.
    """
    elements = {
        "iframes": [],
        "forms": [],
        "meta": [],
        "price_context": []
    }
    
    # Extract IFRAMES
    iframe_pattern = r'<iframe[^>]*>.*?</iframe>|<iframe[^>]*/>'
    iframes = re.findall(iframe_pattern, html_content, re.IGNORECASE | re.DOTALL)
    for idx, iframe in enumerate(iframes[:20], 1):
        # Truncate content inside iframe
        iframe_short = re.sub(r'>.*?</iframe>', '>[...]</iframe>', iframe, flags=re.DOTALL)
        elements["iframes"].append(f"iframe_{idx}: {iframe_short[:500]}")
    
    # Extract FORMS
    form_pattern = r'<form[^>]*>.*?</form>'
    forms = re.findall(form_pattern, html_content, re.IGNORECASE | re.DOTALL)
    for idx, form in enumerate(forms[:15], 1):
        form_details = []
        form_tag = re.search(r'<form[^>]*>', form, re.IGNORECASE)
        if form_tag:
            form_details.append(f"tag: {form_tag.group()}")
        
        # Inputs
        inputs = re.findall(r'<input[^>]*>', form, re.IGNORECASE)
        hidden_inputs = [inp for inp in inputs if 'hidden' in inp.lower()]
        
        if hidden_inputs:
            form_details.append("hidden_inputs: " + ", ".join(hidden_inputs[:10]))
            
        critical_inputs = [inp for inp in inputs if any(t in inp.lower() for t in ['password', 'email', 'card', 'cvv', 'payment'])]
        if critical_inputs:
            form_details.append("critical_inputs: " + ", ".join(critical_inputs[:5]))
            
        elements["forms"].append(f"form_{idx}: " + " | ".join(form_details))

    # Extract META
    meta_pattern = r'<meta[^>]*(?:security|csp|x-frame|cors|og:title|og:price|product:price)[^>]*>'
    meta_tags = re.findall(meta_pattern, html_content, re.IGNORECASE)
    elements["meta"] = meta_tags[:15]

    # Extract PRICE & PRODUCT Context
    # 0. Look for JSON-LD (Best source for structured product data)
    json_ld_pattern = r'<script type="application/ld\+json"[^>]*>(.*?)</script>'
    json_ld_scripts = re.findall(json_ld_pattern, html_content, re.IGNORECASE | re.DOTALL)
    
    # 1. Look for currency symbols with numbers near them
    price_pattern = r'[\$€£¥]\s?\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{2})?'
    # Find prices with some context to distinguish main price from others
    # We capture 50 chars of context before and after
    prices_with_context = re.findall(r'(.{0,50})(' + price_pattern + r')(.{0,50})', html_content)
    
    # 2. Look for elements likely containing product names (h1, h2, classes with 'title', 'name')
    # Simple heuristic: grab h1 tags
    h1_tags = re.findall(r'<h1[^>]*>.*?</h1>', html_content, re.IGNORECASE | re.DOTALL)
    
    # 3. Look for elements with class/id related to price
    price_elements = re.findall(r'<[^>]*class=["\'][^"\']*(?:price|amount|cost)[^"\']*["\'][^>]*>.*?<', html_content, re.IGNORECASE)

    if json_ld_scripts:
        # Filter for scripts that mention "Product" or "Offer"
        relevant_scripts = [script for script in json_ld_scripts if '"Product"' in script or '"Offer"' in script]
        if relevant_scripts:
             elements["price_context"].append("JSON-LD Structured Data (HIGH RELIABILITY):\n" + "\n---\n".join(relevant_scripts[:2]))

    if h1_tags:
        elements["price_context"].append("Possible Product Titles: " + " | ".join([re.sub(r'<[^>]+>', '', t).strip() for t in h1_tags[:3]]))
    
    # Add meta tags relevant to product/price to context
    product_meta = [m for m in meta_tags if 'og:title' in m or 'price' in m]
    if product_meta:
        elements["price_context"].append("Meta Info (HIGH RELIABILITY): " + " | ".join(product_meta))

    if price_elements:
        # Clean tags to just show text content
        clean_prices = [re.sub(r'<[^>]+>', '', p).strip() for p in price_elements[:5]]
        elements["price_context"].append("Price Elements Content: " + ", ".join([p for p in clean_prices if p]))
        
    if prices_with_context:
        # Limit to first 15 prices to avoid token overflow, but provide context
        formatted_prices = []
        for pre, price, post in prices_with_context[:15]:
             clean_pre = re.sub(r'<[^>]+>', ' ', pre).strip()
             clean_post = re.sub(r'<[^>]+>', ' ', post).strip()
             formatted_prices.append(f"...{clean_pre} [ {price} ] {clean_post}...")
        elements["price_context"].append("Visible Prices with Context: " + "\n".join(formatted_prices))

    return {
        "iframes": "\n".join(elements["iframes"]),
        "forms": "\n".join(elements["forms"]),
        "meta": "\n".join(elements["meta"]),
        "price_context": "\n".join(elements["price_context"])
    }

class FullSecurityAnalysis(BaseModel):
    visual: VisualSecurityCheck
    html: HtmlSecurityCheck
    price: PriceSecurityCheck

# --- Check Functions ---

async def check_full_security(
    url: str, 
    screenshot_base64: Optional[str], 
    iframe_text: str, 
    form_text: str, 
    price_context: str
) -> FullSecurityAnalysis:
    """
    Combined security check (Visual + HTML + Price) in a single LLM call to save API requests.
    """
    
    # 1. Prepare Content Parts
    content_parts = []
    
    # Text Analysis Content
    text_content = f"Analyze webpage hosted at '{url}'.\n\n"
    
    if iframe_text.strip():
        text_content += f"=== IFRAMES ===\n{iframe_text}\n\n"
    else:
        text_content += "=== IFRAMES ===\nNo iframes detected.\n\n"
    
    if form_text.strip():
        text_content += f"=== FORMS ===\n{form_text}\n\n"
    else:
        text_content += "=== FORMS ===\nNo forms detected.\n\n"
        
    if price_context.strip():
        text_content += f"=== PRICE/PRODUCT CONTEXT ===\n{price_context}\n\n"
    else:
        text_content += "=== PRICE/PRODUCT CONTEXT ===\nNo price information detected.\n\n"
        
    text_content += (
        "Perform a comprehensive security analysis covering:\n"
        "1. Visual Phishing (Logo/Layout mimicry)\n"
        "2. Purchase Validation (Visible 'Buy' buttons)\n"
        "3. HTML Risks (Iframes/CSRF)\n"
        "4. Price Logic (Too good to be true scams)\n\n"
        "If no screenshot is provided, set visual fields to False/Safe."
    )
    
    content_parts.append({"type": "text", "text": text_content})
    
    # Add image if available
    if screenshot_base64:
        content_parts.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": screenshot_base64
            }
        })

    messages = [
        {
            "role": "system",
            "content": (
                "You are an elite e-commerce security expert. Perform a multi-modal analysis of this webpage. "
                "Analyze Visuals, HTML structure, and Pricing logic simultaneously to detect scams, phishing, or vulnerabilities."
            )
        },
        {
            "role": "user",
            "content": content_parts
        }
    ]

    # Use Sonnet for critical security analysis (better reasoning for phishing/scam detection)
    return await call_structured_llm(messages, FullSecurityAnalysis, model="claude-sonnet-4-5-20250929")

# --- Main Agent ---

async def ecommerce_guard_agent(request: AnalysisRequest):
    """
    Performs S1 (Phishing), S2 (Iframe), S3 (CSRF), S4 (Purchase Validation), S5 (Price Logic) 
    using a SINGLE combined LLM call to optimize speed and API usage.
    """
    start_time = time.time()
    logger.info("🛡️ [GUARD] Starting security analysis...")
    
    # 1. Prepare Data
    extract_start = time.time()
    security_elements = extract_security_elements(request.html_content)
    logger.info(f"✓ HTML extraction ({time.time() - extract_start:.2f}s)")
    
    # 2. Single Combined Check
    checks_start = time.time()
    
    try:
        full_analysis = await check_full_security(
            url=request.url,
            screenshot_base64=request.screenshot_base64,
            iframe_text=security_elements["iframes"],
            form_text=security_elements["forms"],
            price_context=security_elements["price_context"]
        )
        
        # Unpack results
        if full_analysis:
            visual_res = full_analysis.visual
            html_res = full_analysis.html
            price_res = full_analysis.price
        else:
            raise Exception("Combined analysis returned None")
            
    except Exception as e:
        logger.error(f"Combined check failed: {e}")
        # Fallback to empty/safe defaults if analysis fails completely
        visual_res = None
        html_res = None
        price_res = None

    logger.info(f"✓ Security checks complete ({time.time() - checks_start:.2f}s)")

    flags = []
    score_impact = 0
    
    # -- Process Visual Results --
    purchase_active = False
    
    if visual_res:
        # S1: Phishing
        if visual_res.phishing_detected:
            flags.append(Flag(type="critical", msg=f"Posible Phishing detectado: {visual_res.phishing_reasoning}"))
            score_impact += 100
        else:
            flags.append(Flag(type="info", msg="No se detectó phishing visual obvio."))

        # S4: Purchase Button
        if visual_res.purchase_button_present:
            purchase_active = True
            flags.append(Flag(type="info", msg="Botón de compra detectado."))
        else:
            flags.append(Flag(type="warning", msg="No se detectó botón de compra activo."))
    else:
        flags.append(Flag(type="warning", msg="No se pudo realizar análisis visual (falta screenshot)."))

    # -- Process HTML Security Results (combined iframe + CSRF) --
    
    # S2: Iframes
    if html_res and html_res.iframe_risk_detected:
        severity = "critical" if purchase_active else "warning"
        impact = 20 if purchase_active else 10
        flags.append(Flag(type=severity, msg=f"Riesgo de Iframe: {html_res.iframe_reasoning}"))
        score_impact += impact
    else:
        flags.append(Flag(type="info", msg="Iframes seguros o ausentes."))

    # S3: CSRF
    if html_res and html_res.csrf_risk_detected:
        severity = "critical" if purchase_active else "warning"
        impact = 20 if purchase_active else 10
        flags.append(Flag(type=severity, msg=f"Falta protección Anti-CSRF: {html_res.csrf_reasoning}"))
        score_impact += impact
    else:
        flags.append(Flag(type="info", msg="Formularios seguros o ausentes."))

    # -- Process Logic Results --
    
    # S5: Price Check
    if price_res and price_res.suspiciously_low_price:
        flags.append(Flag(type="critical", msg=f"Precio sospechosamente bajo: {price_res.reasoning}"))
        score_impact += 40
    elif price_res:
         flags.append(Flag(type="info", msg=f"Análisis de precio: {price_res.reasoning}"))

    total_time = time.time() - start_time
    logger.info(f"✓ Guard analysis complete: {len(flags)} flags, score_impact={score_impact} ({total_time:.2f}s)")

    return {
        "flags": flags,
        "details": {
            "visual_analysis": visual_res.model_dump() if visual_res else None,
            "html_security": html_res.model_dump() if html_res else None,
            "price_analysis": price_res.model_dump() if price_res else None
        },
        "score_impact": min(100, score_impact)
    }
