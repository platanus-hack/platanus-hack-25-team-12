import asyncio
import os
from typing import Any, Dict, List, Sequence, Tuple
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file BEFORE importing agents
# (agents import llm.py which needs ANTHROPIC_API_KEY at module load time)
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from schemas import AnalysisRequest, AnalysisResult, RiskLevel, Flag, MarketplaceRequest, ScoreBreakdown
from agents import ecommerce_guard_agent, reviews_agent, price_comparison_agent
from marketplace_agents import (
    seller_trust_agent,
    pricing_agent,
    price_analysis_agent,
    image_analysis_agent,
    red_flags_agent,
    description_quality_agent,
    seller_history_agent,
    supplier_confidence_agent
)

if not os.getenv("ANTHROPIC_API_KEY"):
    print("⚠️  WARNING: ANTHROPIC_API_KEY not set. LLM-based analysis will fail.")
    print("   Create a .env file in backend/ directory with: ANTHROPIC_API_KEY=your_key_here")

app = FastAPI(title="BodyCart Backend")

# Allow CORS for browser extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to extension ID
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _collect_flags(*responses: Sequence[Dict[str, Any]]) -> List[Flag]:
    """Flatten flags returned by each agent while tolerating missing data."""
    aggregated: List[Flag] = []
    for resp in responses:
        aggregated.extend(resp.get("flags") or [])
    return aggregated


def _collect_details(*responses: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Merge detail dictionaries; later responses can override earlier keys."""
    aggregated: Dict[str, Any] = {}
    for resp in responses:
        details = resp.get("details")
        if details:
            aggregated.update(details)
    return aggregated


def _assess_risk(score: int) -> Tuple[RiskLevel, str]:
    """Map a score to a risk level and a default verdict title."""
    if score >= 80:
        return (
            RiskLevel.SAFE,
            "Todo limpio, procede a gastar tu dinero."
        )
    if score >= 50:
        return (
            RiskLevel.SUSPICIOUS,
            "Huele a humo... mira estos detalles."
        )
    return (
        RiskLevel.DANGEROUS,
        "¡FUEGO! Saca tu tarjeta de aquí."
    )


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_page(request: AnalysisRequest):
    """
    Analyze an e-commerce page for security threats.
    
    Note: The frontend shows progress messages during analysis.
    Future enhancement: Agents could send progress updates via SSE or websockets.
    For now, frontend uses hardcoded messages that cycle automatically.
    """
    # Run agents in parallel
    ai_res, reviews_res, price_res = await asyncio.gather(
        ecommerce_guard_agent(request),
        reviews_agent(request),
        price_comparison_agent(request)
    )

    # Aggregate score contributions
    final_score = 100
    final_score -= ai_res.get("score_impact", 0)
    final_score -= reviews_res.get("score_impact", 0)
    final_score = max(0, min(100, final_score))

    risk_level, default_title = _assess_risk(final_score)
    verdict_title = ai_res.get("verdict_title") or default_title
    verdict_message = ai_res.get("verdict_message", "Revise los detalles a continuación.")

    # Collect agent outputs for detailed display
    agent_outputs = {
        "ecommerce_guard": ai_res,
        "reviews": reviews_res,
        "price_comparison": price_res
    }

    return AnalysisResult(
        score=final_score,
        risk_level=risk_level,
        verdict_title=verdict_title,
        verdict_message=verdict_message,
        flags=_collect_flags(ai_res, reviews_res, price_res),
        details=_collect_details(ai_res, reviews_res, price_res),
        agent_outputs=agent_outputs
    )

@app.post("/analyze/marketplace", response_model=AnalysisResult)
async def analyze_marketplace(request: MarketplaceRequest):
    """
    Analyze a Facebook Marketplace listing for potential scams.

    Multi-phase analysis:
    1. Rule-based agents run in parallel for quick flag detection
    2. LLM-based supplier_confidence_agent analyzes ALL data holistically
       and produces the final score (0-100)

    The final score is determined by the LLM based on:
    - All scraped seller data (name, join date, ratings, badges, followers, etc.)
    - All listing data (title, price, description, images, etc.)
    - Screenshots (listing + seller profile)
    - Flags detected by rule-based agents

    Returns a detailed score breakdown showing contribution of each factor.
    """
    # Phase 1: Run ALL rule-based agents in parallel
    (
        seller_res,
        seller_history_res,
        pricing_res,
        price_analysis_res,
        image_res,
        red_flags_res,
        description_res
    ) = await asyncio.gather(
        seller_trust_agent(request),
        seller_history_agent(request),
        pricing_agent(request),
        price_analysis_agent(request),
        image_analysis_agent(request),
        red_flags_agent(request),
        description_quality_agent(request)
    )

    # Collect all flags from rule-based agents
    rule_based_flags = []
    rule_based_flags.extend(seller_res.get("flags", []))
    rule_based_flags.extend(seller_history_res.get("flags", []))
    rule_based_flags.extend(pricing_res.get("flags", []))
    rule_based_flags.extend(price_analysis_res.get("flags", []))
    rule_based_flags.extend(image_res.get("flags", []))
    rule_based_flags.extend(red_flags_res.get("flags", []))
    rule_based_flags.extend(description_res.get("flags", []))

    # Build score breakdown from agent impacts
    score_breakdown = ScoreBreakdown(
        base_score=100,
        seller_longevity=-seller_res.get("score_impact", 0),  # Negate because impact is subtracted
        post_history=-seller_history_res.get("score_impact", 0),
        description_quality=-description_res.get("score_impact", 0),
        image_analysis=-image_res.get("score_impact", 0),
        price_analysis=-(pricing_res.get("score_impact", 0) + price_analysis_res.get("score_impact", 0)),
        red_flags=-red_flags_res.get("score_impact", 0),
        # Extract ratings impact from seller_res details if available
        ratings_impact=0  # Will be adjusted by LLM
    )

    # Phase 2: LLM-based holistic analysis with all data
    # The LLM determines the final score based on ALL available information
    # Pass image analysis details for more context
    image_analysis_details = image_res.get("details", {}).get("ai_analysis", {})
    ai_res = await supplier_confidence_agent(request, rule_based_flags, image_analysis_details)

    # Use LLM's score directly (not calculated from impacts)
    final_score = ai_res.get("score", 50)
    final_score = max(0, min(100, final_score))

    # Use LLM's risk level or determine from score
    risk_level = ai_res.get("risk_level")
    if not risk_level:
        if final_score >= 80:
            risk_level = "safe"
        elif final_score >= 50:
            risk_level = "suspicious"
        else:
            risk_level = "dangerous"

    # Combine flags: rule-based + LLM-generated
    all_flags = rule_based_flags + ai_res.get("flags", [])

    # Collect all details with enhanced breakdown
    all_details = {
        "platform": "facebook_marketplace",
        "seller": seller_res.get("details", {}),
        "seller_history": seller_history_res.get("details", {}),
        "pricing": pricing_res.get("details", {}),
        "price_analysis": price_analysis_res.get("details", {}),
        "description": description_res.get("details", {}),
        "images": image_res.get("details", {}),
        "red_flags": red_flags_res.get("details", {}),
        "ai_analysis": ai_res.get("details", {})
    }

    # Collect agent outputs for detailed display
    agent_outputs = {
        "seller_trust": seller_res,
        "seller_history": seller_history_res,
        "pricing": pricing_res,
        "price_analysis": price_analysis_res,
        "description_quality": description_res,
        "image_analysis": image_res,
        "red_flags": red_flags_res,
        "supplier_confidence": ai_res
    }

    # Use AI verdict
    verdict_title = ai_res.get("verdict_title", "Análisis completado")
    verdict_message = ai_res.get("verdict_message", "Revisa las banderas de alerta arriba.")

    return AnalysisResult(
        score=final_score,
        risk_level=risk_level,
        verdict_title=verdict_title,
        verdict_message=verdict_message,
        flags=all_flags,
        details=all_details,
        agent_outputs=agent_outputs,
        score_breakdown=score_breakdown
    )

@app.get("/")
def read_root():
    """Health check endpoint that shows API key configuration status."""
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    tavily_key = os.getenv("TAVILY_API_KEY")

    return {
        "status": "ok",
        "service": "BodyCart API",
        "config": {
            "ANTHROPIC_API_KEY": "✓ configured" if anthropic_key and not anthropic_key.startswith("your_") else "✗ missing",
            "TAVILY_API_KEY": "✓ configured" if tavily_key and not tavily_key.startswith("your_") else "✗ missing"
        }
    }
