from enum import Enum

from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class RiskLevel(str, Enum):
    SAFE = "safe"
    SUSPICIOUS = "suspicious"
    DANGEROUS = "dangerous"


class LinkStats(BaseModel):
    total: int
    internal: int
    external: int


class AnalysisRequest(BaseModel):
    # Core fields as per README
    url: str
    html_content: str
    screenshot_base64: Optional[str] = None
    
    # Additional metadata from extension
    title: Optional[str] = None
    metaDescription: Optional[str] = None
    metaKeywords: Optional[str] = None
    scripts: Optional[int] = None
    externalScripts: Optional[int] = None
    links: Optional[LinkStats] = None
    images: Optional[int] = None
    loadTime: Optional[str] = None
    charset: Optional[str] = None
    language: Optional[str] = None
    forms: Optional[str] = None
    iframes: Optional[str] = None
    protocol: Optional[str] = None


class Flag(BaseModel):
    type: str  # critical, warning, info
    msg: str


class ScoreBreakdown(BaseModel):
    """Detailed breakdown of how the final score was calculated."""
    base_score: int = 100
    seller_longevity: int = 0  # Impact from account age
    post_history: int = 0  # Impact from number of previous posts
    description_quality: int = 0  # Impact from description analysis
    image_analysis: int = 0  # Impact from image authenticity
    price_analysis: int = 0  # Impact from price vs market comparison
    red_flags: int = 0  # Impact from scam patterns detected
    response_patterns: int = 0  # Impact from seller response rate/badges
    ratings_impact: int = 0  # Impact from seller ratings

    @property
    def total(self) -> int:
        """Calculate total score from all components."""
        total = self.base_score
        total += self.seller_longevity
        total += self.post_history
        total += self.description_quality
        total += self.image_analysis
        total += self.price_analysis
        total += self.red_flags
        total += self.response_patterns
        total += self.ratings_impact
        return max(0, min(100, total))


class AnalysisResult(BaseModel):
    score: int
    risk_level: RiskLevel
    verdict_title: str
    verdict_message: str
    flags: List[Flag]
    details: Dict[str, Any]
    agent_outputs: Optional[Dict[str, Any]] = None
    score_breakdown: Optional[ScoreBreakdown] = None  # Detailed score components


# ============================================
# Facebook Marketplace Schemas
# ============================================

class MarketplaceSellerInfo(BaseModel):
    """Seller profile information extracted from FB Marketplace"""
    name: Optional[str] = None
    profile_url: Optional[str] = None
    join_date: Optional[str] = None  # e.g., "Se unió a Facebook en 2008"
    location: Optional[str] = None
    rating: Optional[str] = None  # If available
    response_rate: Optional[str] = None  # e.g., "Responds to 90% of messages"
    other_listings_count: Optional[int] = None

    # Extended fields from deep investigation
    listings_count: Optional[str] = None  # e.g., "20+"
    followers_count: Optional[int] = None
    ratings_count: Optional[int] = None  # e.g., 22 calificaciones
    ratings_average: Optional[float] = None  # e.g., 4.5 stars
    badges: List[str] = []  # e.g., ["Buena calificación", "Responde rápido"]
    strengths: List[str] = []  # e.g., ["Comunicación (13)", "Puntualidad (5)"]
    profile_screenshot: Optional[str] = None  # Base64 screenshot of seller profile

    # New enhanced fields for deeper analysis
    response_time: Optional[str] = None  # e.g., "Usually responds within 1 hour"
    verified_identity: bool = False  # Whether identity is verified
    mutual_friends: Optional[int] = None  # Number of mutual friends with buyer
    recent_activity: Optional[str] = None  # Last activity indicator
    seller_since: Optional[str] = None  # Year started selling
    total_sales: Optional[int] = None  # Total completed sales
    profile_completeness: Optional[int] = None  # 0-100 score of profile completeness


class MarketplaceListingInfo(BaseModel):
    """Listing details from FB Marketplace"""
    title: Optional[str] = None
    price: Optional[str] = None  # Keep as string to handle "Free", "$100", etc.
    description: Optional[str] = None
    condition: Optional[str] = None  # "New", "Used - Like New", etc.
    location: Optional[str] = None
    posted_date: Optional[str] = None  # "Listed 2 days ago"
    category: Optional[str] = None
    image_count: Optional[int] = None


class MarketplaceRequest(BaseModel):
    """Request schema for Facebook Marketplace analysis"""
    url: str
    platform: str = "facebook_marketplace"
    screenshot_base64: Optional[str] = None
    html_content: Optional[str] = None  # Raw HTML for fallback parsing

    # Structured data extracted by extension
    listing: Optional[MarketplaceListingInfo] = None
    seller: Optional[MarketplaceSellerInfo] = None

    # Raw extracted images (base64 or URLs)
    listing_images: List[str] = []

    # Additional context
    seller_other_listings: List[str] = []  # URLs or titles of other listings

