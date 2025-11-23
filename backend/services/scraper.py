"""
Facebook Marketplace Scraper Service

This service provides advanced web scraping capabilities using Playwright.
It can be used as a fallback when the Chrome extension can't scrape data,
or for batch analysis of multiple listings.

NOTE: Facebook requires authentication for Marketplace access.
This scraper works best with cookie-based authentication or in scenarios
where the pages are publicly accessible.

To use this service, install playwright:
    pip install playwright
    playwright install chromium

Usage:
    from services.scraper import MarketplaceScraper

    async with MarketplaceScraper() as scraper:
        listing_data = await scraper.scrape_listing("https://facebook.com/marketplace/item/123")
        seller_data = await scraper.scrape_seller_profile("https://facebook.com/marketplace/profile/456")
"""

import asyncio
import re
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime

# Conditional import - service degrades gracefully if playwright not installed
try:
    from playwright.async_api import async_playwright, Browser, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("[WARNING] Playwright not installed. Backend scraping disabled.")
    print("          Install with: pip install playwright && playwright install chromium")


@dataclass
class ScrapedListingData:
    """Data scraped from a Facebook Marketplace listing"""
    url: str
    title: Optional[str] = None
    price: Optional[str] = None
    description: Optional[str] = None
    condition: Optional[str] = None
    location: Optional[str] = None
    posted_date: Optional[str] = None
    image_count: int = 0
    image_urls: List[str] = field(default_factory=list)
    seller_name: Optional[str] = None
    seller_profile_url: Optional[str] = None
    screenshot_base64: Optional[str] = None
    raw_html: Optional[str] = None
    scraped_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ScrapedSellerData:
    """Data scraped from a Facebook Marketplace seller profile"""
    profile_url: str
    name: Optional[str] = None
    join_date: Optional[str] = None
    listings_count: Optional[str] = None
    followers_count: Optional[int] = None
    location: Optional[str] = None
    ratings_count: Optional[int] = None
    ratings_average: Optional[float] = None
    badges: List[str] = field(default_factory=list)
    strengths: List[str] = field(default_factory=list)
    response_rate: Optional[str] = None
    response_time: Optional[str] = None
    verified_identity: bool = False
    total_sales: Optional[int] = None
    profile_completeness: int = 0
    screenshot_base64: Optional[str] = None
    scraped_at: str = field(default_factory=lambda: datetime.now().isoformat())


class MarketplaceScraper:
    """
    Playwright-based scraper for Facebook Marketplace.

    Usage:
        async with MarketplaceScraper() as scraper:
            data = await scraper.scrape_listing(url)
    """

    def __init__(self, headless: bool = True, timeout: int = 30000):
        """
        Initialize the scraper.

        Args:
            headless: Run browser in headless mode (default: True)
            timeout: Default timeout for page operations in ms (default: 30s)
        """
        self.headless = headless
        self.timeout = timeout
        self._playwright = None
        self._browser: Optional[Browser] = None

    async def __aenter__(self):
        """Async context manager entry - starts browser"""
        if not PLAYWRIGHT_AVAILABLE:
            raise RuntimeError("Playwright not installed. Run: pip install playwright && playwright install chromium")

        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=self.headless,
            args=['--disable-blink-features=AutomationControlled']
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - closes browser"""
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def _create_page(self) -> Page:
        """Create a new page with anti-detection measures"""
        context = await self._browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='es-CL'
        )
        page = await context.new_page()
        page.set_default_timeout(self.timeout)

        # Remove webdriver flag
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)

        return page

    async def scrape_listing(self, url: str) -> ScrapedListingData:
        """
        Scrape data from a Facebook Marketplace listing.

        Args:
            url: Full URL to the marketplace listing

        Returns:
            ScrapedListingData object with extracted information
        """
        if not self._browser:
            raise RuntimeError("Scraper not initialized. Use 'async with MarketplaceScraper() as scraper:'")

        page = await self._create_page()
        data = ScrapedListingData(url=url)

        try:
            await page.goto(url, wait_until='networkidle')
            await asyncio.sleep(2)  # Wait for dynamic content

            # Scroll to load lazy content
            await self._scroll_page(page)

            # Extract listing data
            data.title = await self._extract_text(page, 'h1')
            data.price = await self._extract_price(page)
            data.description = await self._extract_description(page)
            data.condition = await self._extract_condition(page)
            data.location = await self._extract_location(page)
            data.posted_date = await self._extract_posted_date(page)

            # Extract images
            data.image_urls = await self._extract_image_urls(page)
            data.image_count = len(data.image_urls)

            # Extract seller info
            seller_link = await page.query_selector('a[href*="/marketplace/profile/"]')
            if seller_link:
                data.seller_name = await seller_link.inner_text()
                data.seller_profile_url = await seller_link.get_attribute('href')

            # Capture screenshot
            screenshot = await page.screenshot(type='png')
            import base64
            data.screenshot_base64 = base64.b64encode(screenshot).decode('utf-8')

            # Get raw HTML for fallback parsing
            data.raw_html = await page.content()

        except Exception as e:
            print(f"[ERROR] Scraping listing failed: {e}")
        finally:
            await page.close()

        return data

    async def scrape_seller_profile(self, profile_url: str) -> ScrapedSellerData:
        """
        Scrape data from a Facebook Marketplace seller profile.

        Args:
            profile_url: Full URL to the seller's marketplace profile

        Returns:
            ScrapedSellerData object with extracted information
        """
        if not self._browser:
            raise RuntimeError("Scraper not initialized. Use 'async with MarketplaceScraper() as scraper:'")

        page = await self._create_page()
        data = ScrapedSellerData(profile_url=profile_url)

        try:
            await page.goto(profile_url, wait_until='networkidle')
            await asyncio.sleep(2)

            # Scroll to load content
            await self._scroll_page(page)

            # Extract profile data
            data.name = await self._extract_text(page, 'h1')

            # Get all text for pattern matching
            page_text = await page.inner_text('body')

            # Join date
            join_match = re.search(r'(se\s+unió\s+a?\s*facebook\s+(en\s+)?\d{4}|joined\s+(facebook\s+)?(in\s+)?\d{4})', page_text, re.I)
            if join_match:
                data.join_date = join_match.group(0)
                data.profile_completeness += 15

            # Listings count
            listings_match = re.search(r'(\d+)\+?\s*(publicaciones?|listings?)', page_text, re.I)
            if listings_match:
                data.listings_count = listings_match.group(1) + '+'
                data.profile_completeness += 10

            # Followers
            followers_match = re.search(r'(\d+)\s*(seguidores|followers)', page_text, re.I)
            if followers_match:
                data.followers_count = int(followers_match.group(1))
                data.profile_completeness += 10

            # Ratings count
            ratings_match = re.search(r'(\d+)\s*(calificaciones?|ratings?|reviews?)', page_text, re.I)
            if ratings_match:
                data.ratings_count = int(ratings_match.group(1))
                data.profile_completeness += 15

            # Location
            location_match = re.search(r'(vive\s+en|lives\s+in)\s+([^,\n]+)', page_text, re.I)
            if location_match:
                data.location = location_match.group(2).strip()
                data.profile_completeness += 5

            # Badges
            if re.search(r'buena\s+calificaci[oó]n|good\s+rating', page_text, re.I):
                data.badges.append('Buena calificación')
                data.profile_completeness += 5
            if re.search(r'responde\s+r[aá]pido|responds?\s+(quickly|fast)', page_text, re.I):
                data.badges.append('Responde rápido')
                data.profile_completeness += 5
            if re.search(r'vendedor\s+(destacado|top)|top\s+seller', page_text, re.I):
                data.badges.append('Vendedor destacado')
                data.profile_completeness += 5

            # Strengths
            for match in re.finditer(r'(comunicaci[oó]n|puntualidad|descripci[oó]n|precio)\s*\((\d+)\)', page_text, re.I):
                data.strengths.append(f"{match.group(1)} ({match.group(2)})")

            # Capture screenshot
            screenshot = await page.screenshot(type='png')
            import base64
            data.screenshot_base64 = base64.b64encode(screenshot).decode('utf-8')

            # Cap completeness
            data.profile_completeness = min(100, data.profile_completeness)

        except Exception as e:
            print(f"[ERROR] Scraping seller profile failed: {e}")
        finally:
            await page.close()

        return data

    async def _scroll_page(self, page: Page, scrolls: int = 5) -> None:
        """Scroll page to trigger lazy loading"""
        for _ in range(scrolls):
            await page.evaluate('window.scrollBy(0, 500)')
            await asyncio.sleep(0.3)
        # Scroll back to top
        await page.evaluate('window.scrollTo(0, 0)')

    async def _extract_text(self, page: Page, selector: str) -> Optional[str]:
        """Safely extract text from an element"""
        try:
            element = await page.query_selector(selector)
            if element:
                return (await element.inner_text()).strip()
        except Exception:
            pass
        return None

    async def _extract_price(self, page: Page) -> Optional[str]:
        """Extract price from listing"""
        # Try various price patterns
        patterns = [
            r'\$\s*[\d,]+',
            r'[\d\s]+\s*\$',
            r'gratis|free',
        ]

        text = await page.inner_text('body')
        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(0).strip()
        return None

    async def _extract_description(self, page: Page) -> Optional[str]:
        """Extract listing description"""
        # Look for description section
        text = await page.inner_text('body')

        # Try to find description after "Detalles" or "Details"
        match = re.search(r'(detalles|details)\s*[\n:]\s*(.{10,500})', text, re.I | re.S)
        if match:
            return match.group(2).strip()
        return None

    async def _extract_condition(self, page: Page) -> Optional[str]:
        """Extract item condition"""
        conditions = ['new', 'used', 'like new', 'good', 'fair',
                     'nuevo', 'usado', 'como nuevo', 'buen estado']

        text = (await page.inner_text('body')).lower()
        for condition in conditions:
            if condition in text:
                return condition.title()
        return None

    async def _extract_location(self, page: Page) -> Optional[str]:
        """Extract listing location"""
        text = await page.inner_text('body')

        match = re.search(r'(publicado\s+en|listed\s+in)\s+([^,\n]+)', text, re.I)
        if match:
            return match.group(2).strip()
        return None

    async def _extract_posted_date(self, page: Page) -> Optional[str]:
        """Extract when listing was posted"""
        text = await page.inner_text('body')

        patterns = [
            r'(hace\s+\d+\s+(?:día|días|hora|horas|semana|semanas|mes|meses))',
            r'(\d+\s+(?:day|days|hour|hours|week|weeks|month|months)\s+ago)',
            r'(ayer|yesterday|hoy|today)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(1).strip()
        return None

    async def _extract_image_urls(self, page: Page) -> List[str]:
        """Extract all listing image URLs"""
        images = await page.query_selector_all('img[src*="scontent"], img[src*="fbcdn"]')
        urls = []

        for img in images:
            src = await img.get_attribute('src')
            if src and src not in urls:
                # Filter out tiny images (icons, etc.)
                width = await img.get_attribute('width')
                if not width or int(width) > 100:
                    urls.append(src)

        return urls[:10]  # Limit to 10 images


# Utility function for one-off scraping
async def scrape_marketplace_url(url: str) -> Dict[str, Any]:
    """
    Convenience function to scrape a single marketplace URL.

    Args:
        url: Facebook Marketplace URL (listing or profile)

    Returns:
        Dictionary with scraped data
    """
    if not PLAYWRIGHT_AVAILABLE:
        return {"error": "Playwright not installed"}

    async with MarketplaceScraper() as scraper:
        if '/profile/' in url:
            data = await scraper.scrape_seller_profile(url)
        else:
            data = await scraper.scrape_listing(url)

        # Convert dataclass to dict
        from dataclasses import asdict
        return asdict(data)
