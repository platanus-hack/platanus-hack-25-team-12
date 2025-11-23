// Page Analyzer - Content Script
(function () {
  "use strict";

  // Prevent multiple injections
  if (window.__pageAnalyzerInitialized) return;
  window.__pageAnalyzerInitialized = true;

  // Configuration - Change this to your deployed backend URL
  // const API_URL = 'https://backend-muddy-silence-3898.fly.dev';
  const API_URL = "http://localhost:8000";

  // Platform detection
  function detectPlatform() {
    const url = window.location.href;
    const hostname = window.location.hostname;

    // Facebook Marketplace
    if (hostname.includes("facebook.com") && url.includes("/marketplace/item/")) {
      return "facebook_marketplace";
    }

    // Generic Ecommerce Detection
    if (isGenericProductPage()) {
      return "ecommerce";
    }

    return null;
  }

  // Check if current page is a generic product page
  function isGenericProductPage() {
    // 1. Schema.org JSON-LD
    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const hasProductSchema = jsonLd.some(script => {
      try {
        const data = JSON.parse(script.textContent);
        const checkType = (obj) => {
          if (!obj || !obj['@type']) return false;
          const type = obj['@type'];
          return Array.isArray(type) ? type.includes('Product') : type === 'Product';
        };
        if (Array.isArray(data)) {
          return data.some(item => checkType(item));
        }
        return checkType(data);
      } catch (e) {
        return false;
      }
    });
    if (hasProductSchema) return true;

    // 2. Schema.org Microdata
    if (document.querySelector('[itemtype*="schema.org/Product"]')) return true;

    // 3. Open Graph Product
    const ogType = document.querySelector('meta[property="og:type"]');
    if (ogType && (ogType.content === 'product' || ogType.content.includes('product'))) return true;
    
    // 4. URL Patterns (Heuristics)
    const url = window.location.href;
    if (/\/product\/|\/item\/|\/p\/|\/dp\//i.test(url)) return true;

    return false;
  }

  // ============================================
  // SIMPLIFIED UI FUNCTIONS
  // ============================================

  // Loading messages for different analysis types
  // These cycle through automatically during analysis
  // Future enhancement: Backend agents could send custom progress messages
  const MARKETPLACE_MESSAGES = [
    "Analizando publicación...",
    "Buscando vendedor...",
    "Verificando perfil...",
    "Analizando imágenes...",
    "Evaluando precios...",
    "Detectando banderas rojas...",
    "Revisando historial...",
    "Generando reporte...",
  ];

  const ECOMMERCE_MESSAGES = [
    "Analizando página...",
    "Validando SSL...",
    "Verificando certificado...",
    "Analizando código...",
    "Detectando amenazas...",
    "Revisando scripts...",
    "Validando formularios...",
    "Generando reporte...",
  ];

  // Update progress message (can be called to show specific message)
  // This function can be used by agents to send custom progress updates
  // Example usage: window.BodyCart.updateProgress("Verificando identidad del vendedor...")
  function updateProgressMessage(message) {
    const msgElement = document.getElementById("bc-progress-msg");
    if (msgElement) {
      msgElement.style.opacity = "0";
      setTimeout(() => {
        msgElement.textContent = message;
        msgElement.style.opacity = "1";
      }, 200);
    }
  }

  // Expose updateProgressMessage for future agent integrations
  window.BodyCart = window.BodyCart || {};
  window.BodyCart.updateProgress = updateProgressMessage;

  // Show loading progress message
  function showLoadingProgress(platform) {
    // Remove any existing progress indicator
    const existing = document.getElementById("bc-progress");
    if (existing) {
      existing.remove();
    }

    const messages =
      platform === "facebook_marketplace"
        ? MARKETPLACE_MESSAGES
        : ECOMMERCE_MESSAGES;

    const progress = document.createElement("div");
    progress.id = "bc-progress";
    progress.className = "bc-progress";
    progress.innerHTML = `
      <div class="bc-progress-message" id="bc-progress-msg">${messages[0]}</div>
    `;

    document.body.appendChild(progress);

    // Animate in
    setTimeout(() => {
      progress.classList.add("bc-progress-show");
    }, 100);

    // Cycle through messages
    let currentIndex = 0;
    const messageInterval = setInterval(() => {
      currentIndex = (currentIndex + 1) % messages.length;
      updateProgressMessage(messages[currentIndex]);
    }, 2000); // Change message every 2 seconds

    // Store interval ID for cleanup
    progress.dataset.intervalId = messageInterval;

    return progress;
  }

  // Hide loading progress
  function hideLoadingProgress() {
    const progress = document.getElementById("bc-progress");
    if (progress) {
      // Clear interval
      if (progress.dataset.intervalId) {
        clearInterval(parseInt(progress.dataset.intervalId));
      }

      progress.classList.remove("bc-progress-show");
      setTimeout(() => progress.remove(), 300);
    }
  }

  // Show loading state in button
  function setButtonLoading(button, isLoading) {
    if (isLoading) {
      button.classList.add("bc-loading");
      button.innerHTML = `
        <div class="bc-spinner-circle"></div>
      `;
      button.disabled = true;
    } else {
      button.classList.remove("bc-loading");
      button.innerHTML = `
        <div class="bc-icon bc-icon-default">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
      `;
      button.disabled = false;
    }
  }

  // Show angry modal for dangerous results
  function showAngryModal(analysis) {
    const existing = document.getElementById("bc-angry-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "bc-angry-modal";
    modal.className = "bc-angry-modal";
    
    modal.innerHTML = `
      <div class="bc-angry-content">
        <div class="bc-angry-image-container">
          <div class="bc-icon bc-icon-angry">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <line x1="9" y1="9" x2="15" y2="15" stroke-width="2.5"/>
              <line x1="15" y1="9" x2="9" y2="15" stroke-width="2.5"/>
            </svg>
          </div>
        </div>
        <h1 class="bc-angry-title">¡NO COMPRES AQUÍ!</h1>
        <p class="bc-angry-subtitle">Hemos detectado señales de una posible estafa.</p>
        
        <p class="bc-angry-message">
          Existen múltiples banderas rojas en esta publicación. Te recomendamos fuertemente buscar otro vendedor o verificar cuidadosamente antes de realizar cualquier transacción.
        </p>

        <div class="bc-angry-actions">
            <button id="bc-angry-details" class="bc-angry-btn-secondary">Ver detalles</button>
            <button id="bc-angry-close" class="bc-angry-btn-primary">Entendido</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    setTimeout(() => modal.classList.add("bc-modal-show"), 10);

    // Event listeners
    document.getElementById("bc-angry-close").addEventListener("click", () => {
      modal.classList.remove("bc-modal-show");
      setTimeout(() => modal.remove(), 300);
    });

    document.getElementById("bc-angry-details").addEventListener("click", () => {
      modal.classList.remove("bc-modal-show");
      setTimeout(() => modal.remove(), 300);
      openDetailsSidebar(analysis);
    });
  }

  // Show happy badge for safe results - replaces the button icon
  function showHappyBadge() {
    const existing = document.getElementById("bc-happy-badge");
    if (existing) existing.remove();

    const btn = document.getElementById("page-analyzer-btn");
    if (!btn) return;

    // Hide the button
    btn.style.display = "none";

    const badge = document.createElement("div");
    badge.id = "bc-happy-badge";
    badge.className = "bc-happy-badge";
    
    badge.innerHTML = `
      <div class="bc-icon bc-icon-happy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 12 11 14 15 10" stroke-width="2.5"/>
        </svg>
      </div>
    `;
    
    // Replace the button background
    document.body.appendChild(badge);
    
    // Animate in
    setTimeout(() => badge.classList.add("bc-badge-show"), 10);
  }

  // Show mini result notification
  function showResultNotification(riskLevel, analysis) {
    // Remove any existing notification
    const existing = document.getElementById("bc-notification");
    if (existing) {
      existing.remove();
    }
    
    const existingBadge = document.getElementById("bc-happy-badge");
    if (existingBadge) existingBadge.remove();

    if (riskLevel === 'dangerous') {
        showAngryModal(analysis);
        return;
    }

    if (riskLevel === 'safe') {
        showHappyBadge();
        // Also show a small notification or just the badge?
        // "all checks passed, display small next to the icon"
        // I will display the standard notification briefly AND the persistent badge.
    }

    const riskConfig = {
      safe: {
        color: "#22c55e",
        icon: "✓",
        title: "Vendedor Confiable",
        gradient: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
      },
      suspicious: {
        color: "#f59e0b",
        icon: "!",
        title: "Vendedor Sospechoso",
        gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
      },
      dangerous: {
        color: "#ef4444",
        icon: "✕",
        title: "Vendedor Peligroso",
        gradient: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
      },
    };

    const config = riskConfig[riskLevel] || riskConfig.suspicious;

    // Get the verdict title if available
    const verdictTitle = analysis.verdict_title || config.title;

    const notification = document.createElement("div");
    notification.id = "bc-notification";
    notification.className = "bc-notification";
    notification.style.background = config.gradient;

    notification.innerHTML = `
      <div class="bc-notif-icon">${config.icon}</div>
      <div class="bc-notif-content">
        <div class="bc-notif-title">${escapeHtml(verdictTitle)}</div>
        <div class="bc-notif-score">
          <span class="bc-confidence-label">Confianza:</span>
          <span class="bc-confidence-value">${analysis.score}</span>
          <span class="bc-confidence-max">/100</span>
        </div>
      </div>
      <button class="bc-notif-details" id="bc-notif-details">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
      <button class="bc-notif-close" id="bc-notif-close">&times;</button>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.classList.add("bc-notif-show");
    }, 100);

    // Add event listeners
    document.getElementById("bc-notif-details").addEventListener("click", () => {
      notification.classList.remove("bc-notif-show");
      setTimeout(() => notification.remove(), 300);
      
      // Hide happy badge if present
      const badge = document.getElementById("bc-happy-badge");
      if (badge) {
        badge.classList.remove("bc-badge-show");
        setTimeout(() => badge.remove(), 300);
      }
      
      openDetailsSidebar(analysis);
    });

    document.getElementById("bc-notif-close").addEventListener("click", () => {
      notification.classList.remove("bc-notif-show");
      setTimeout(() => notification.remove(), 300);
    });

    // Auto-hide after 1 minute
    setTimeout(() => {
      if (notification.classList.contains("bc-notif-show")) {
        notification.classList.remove("bc-notif-show");
        setTimeout(() => notification.remove(), 300);
      }
    }, 60000);
  }

  // Attach event listeners to sidebar dynamic content
  function attachEventListenersToSidebar() {
    // Security details
    const securityToggles = document.querySelectorAll(".pa-security-details-toggle");
    securityToggles.forEach(toggle => {
      toggle.addEventListener("click", function() {
        this.parentElement.classList.toggle("pa-details-open");
      });
    });

    // Reputation details
    const reputationToggles = document.querySelectorAll(".pa-reputation-details-toggle");
    reputationToggles.forEach(toggle => {
      toggle.addEventListener("click", function() {
        this.parentElement.classList.toggle("pa-details-open");
      });
    });

    // Price comparison details
    const priceToggles = document.querySelectorAll(".pa-price-toggle");
    priceToggles.forEach(toggle => {
      toggle.addEventListener("click", function() {
        this.parentElement.classList.toggle("pa-price-open");
      });
    });
  }

  // Open detailed sidebar with agent outputs
  function openDetailsSidebar(analysis) {
    const panel = document.getElementById("page-analyzer-panel");
    const content = document.getElementById("pa-content");

    if (!panel || !content) return;

    // Render detailed analysis
    content.innerHTML = renderDetailedAnalysis(analysis);
    
    // Attach event listeners to the new content
    attachEventListenersToSidebar();

    // Show panel
    panel.classList.add("pa-open");
    const button = document.getElementById("page-analyzer-btn");
    if (button) {
      button.style.display = "none";
    }
    
    // Hide happy badge if present
    const badge = document.getElementById("bc-happy-badge");
    if (badge) {
      badge.classList.remove("bc-badge-show");
      setTimeout(() => badge.remove(), 300);
    }
  }

  // ============================================
  // PRODUCT CONTAINER DETECTION
  // ============================================

  /**
   * Find the correct product container to scope our DOM queries.
   * Facebook Marketplace can show products in:
   * 1. Modal/dialog overlay (when clicking from feed)
   * 2. Full page view (when opening in new tab) - has suggestions below
   *
   * We need to ignore the background feed and suggestions.
   */
  function findProductContainer() {
    // Strategy 1: Look for modal/dialog container (highest priority)
    // Facebook uses role="dialog" for modals
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      console.log("[BodyCart] Found modal dialog container");
      return dialog;
    }

    // Strategy 2: Full page view - find the main product section
    // The layout is typically: [Images on left] [Details on right]
    // Below that are suggestions we want to ignore
    const mainContent = document.querySelector('[role="main"]');
    if (mainContent) {
      // Look for the product detail container
      // It's usually the first large container with both images and price

      // Method A: Find container with seller profile link (unique to product detail)
      const sellerLink = mainContent.querySelector('a[href*="/marketplace/profile/"]');
      if (sellerLink) {
        // Walk up to find a reasonable parent container
        let container = sellerLink;
        for (let i = 0; i < 10; i++) {
          container = container.parentElement;
          if (!container || container === mainContent) break;

          const rect = container.getBoundingClientRect();
          // Product detail container should be:
          // - Wide enough (at least 600px)
          // - Start near top of page
          // - Not be the entire main content
          if (rect.width > 600 && rect.top < 300 && rect.height < window.innerHeight * 1.5) {
            // Verify it has price info
            const hasPrice = container.textContent.match(/\$|USD|CLP|gratis|free/i);
            if (hasPrice) {
              console.log("[BodyCart] Found product container via seller link");
              return container;
            }
          }
        }
      }

      // Method B: Find the first major section with price (before suggestions)
      // Suggestions typically appear after "También te puede gustar" or "You might also like"
      const allText = mainContent.textContent;
      const hasSuggestions = /también te puede|you might also|productos similares|similar items/i.test(allText);

      if (hasSuggestions) {
        // Find divs that appear BEFORE suggestions
        const allDivs = mainContent.querySelectorAll(':scope > div');
        for (const div of allDivs) {
          const rect = div.getBoundingClientRect();
          // First large container near top
          if (rect.top < 200 && rect.width > 500 && rect.height > 300) {
            const divText = div.textContent;
            const hasPrice = divText.match(/\$|USD|CLP|gratis|free/i);
            const hasSuggestionsInside = /también te puede|you might also|productos similares|similar items/i.test(divText);

            // Good container: has price but NOT suggestions text
            if (hasPrice && !hasSuggestionsInside) {
              console.log("[BodyCart] Found product container (before suggestions)");
              return div;
            }
          }
        }
      }

      // Method C: Use viewport-based detection
      // The main product is visible in the viewport initially
      const topContainers = [];
      const walkDOM = (element, depth = 0) => {
        if (depth > 5) return;
        for (const child of element.children) {
          const rect = child.getBoundingClientRect();
          // Containers in the top portion of the page
          if (rect.top >= 0 && rect.top < 400 && rect.width > 400 && rect.height > 200) {
            topContainers.push({ el: child, rect, depth });
          }
          walkDOM(child, depth + 1);
        }
      };
      walkDOM(mainContent);

      // Find the best container (largest area in top portion with price)
      topContainers.sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
      for (const { el } of topContainers) {
        const hasPrice = el.textContent.match(/\$|USD|CLP|gratis|free/i);
        const hasSuggestionsInside = /también te puede|you might also|productos similares|similar items/i.test(el.textContent);
        if (hasPrice && !hasSuggestionsInside) {
          console.log("[BodyCart] Found product container (viewport-based)");
          return el;
        }
      }

      // Fallback to main content but log warning
      console.warn("[BodyCart] Using main content - suggestions may be included");
      return mainContent;
    }

    // Strategy 3: Fallback to document
    console.warn("[BodyCart] Could not find specific container, using document");
    return document;
  }

  /**
   * Query elements within the product container only.
   * Filters out elements that appear to be from suggestions section.
   */
  function queryInContainer(container, selector) {
    if (container === document) {
      return Array.from(document.querySelectorAll(selector));
    }

    const elements = Array.from(container.querySelectorAll(selector));

    // Additional filter: exclude elements that are likely from suggestions
    return elements.filter(el => {
      // Check if this element is inside a "suggestions" section
      let parent = el.parentElement;
      for (let i = 0; i < 15; i++) {
        if (!parent) break;
        const text = parent.getAttribute('aria-label') || '';
        if (/también te puede|you might also|similar|recomendado/i.test(text)) {
          return false; // Exclude this element
        }
        parent = parent.parentElement;
      }
      return true;
    });
  }

  // ============================================
  // SILENT SCROLL FUNCTION
  // ============================================

  async function silentScroll() {
    // Check if we're in a modal first
    const dialog = document.querySelector('[role="dialog"]');

    if (dialog) {
      // In modal mode - scroll within the modal if needed
      console.log("[BodyCart] Scrolling within modal dialog");

      // Find scrollable container within the modal
      const modalScrollContainer = dialog.querySelector('[style*="overflow"]') ||
                                   dialog.querySelector('[class*="scroll"]') ||
                                   dialog;

      if (modalScrollContainer && modalScrollContainer.scrollHeight > modalScrollContainer.clientHeight) {
        const originalScrollTop = modalScrollContainer.scrollTop;
        const scrollStep = 300;
        let scrollCount = 0;

        while (scrollCount < 5) {
          modalScrollContainer.scrollTop += scrollStep;
          await new Promise((r) => setTimeout(r, 150));

          if (modalScrollContainer.scrollTop + modalScrollContainer.clientHeight >= modalScrollContainer.scrollHeight - 50) {
            break;
          }
          scrollCount++;
        }

        // Return to original position
        await new Promise((r) => setTimeout(r, 100));
        modalScrollContainer.scrollTop = originalScrollTop;
      }

      console.log("[BodyCart] Modal scroll completed");
      return;
    }

    // Not in modal - use standard scroll logic
    // Find the main scroll container (Facebook uses various containers)
    const scrollContainers = [
      document.querySelector('[role="main"]'),
      document.querySelector(".x1n2onr6"), // Facebook's common scroll container class
      document.documentElement,
      document.body,
    ];

    let scrollContainer = null;
    for (const container of scrollContainers) {
      if (container && container.scrollHeight > container.clientHeight) {
        scrollContainer = container;
        break;
      }
    }

    if (!scrollContainer) {
      scrollContainer = document.documentElement;
    }

    // Save original scroll position
    const originalScrollTop = scrollContainer.scrollTop || window.scrollY;

    // Scroll down to trigger lazy loading
    const scrollStep = 500;
    const maxScrolls = 10;
    let scrollCount = 0;

    while (scrollCount < maxScrolls) {
      const prevHeight = scrollContainer.scrollHeight;

      // Scroll down
      if (scrollContainer === document.documentElement) {
        window.scrollTo({
          top: window.scrollY + scrollStep,
          behavior: "instant",
        });
      } else {
        scrollContainer.scrollTop += scrollStep;
      }

      // Wait for content to load
      await new Promise((r) => setTimeout(r, 200));

      // Check if we've reached the bottom or content stopped growing
      const atBottom =
        scrollContainer === document.documentElement
          ? window.innerHeight + window.scrollY >=
            document.body.scrollHeight - 100
          : scrollContainer.scrollTop + scrollContainer.clientHeight >=
            scrollContainer.scrollHeight - 100;

      if (atBottom || scrollContainer.scrollHeight === prevHeight) {
        break;
      }

      scrollCount++;
    }

    // Return to original position so user doesn't notice
    await new Promise((r) => setTimeout(r, 100));
    if (scrollContainer === document.documentElement) {
      window.scrollTo({ top: originalScrollTop, behavior: "instant" });
    } else {
      scrollContainer.scrollTop = originalScrollTop;
    }

    console.log("[BodyCart] Silent scroll completed");
  }

  // ============================================
  // SELLER PROFILE EXTRACTION (via background)
  // ============================================

  async function extractSellerProfileFromBackground(sellerUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "EXTRACT_SELLER_PROFILE", url: sellerUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[BodyCart] Seller extraction error:",
              chrome.runtime.lastError
            );
            resolve(null);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  // ============================================
  // DEEP INVESTIGATION FLOW (OPTIMIZED)
  // ============================================

  async function deepInvestigateMarketplace() {
    console.log("[BodyCart] Starting optimized deep investigation...");
    const startTime = performance.now();

    // Check if we're in modal (skip scroll if so - content is already loaded)
    const isModal = !!document.querySelector('[role="dialog"]');

    // Step 1: Only scroll if NOT in modal (modal has content pre-loaded)
    if (!isModal) {
      await silentScroll();
    } else {
      console.log("[BodyCart] Modal detected - skipping scroll");
    }

    // Step 2: Run screenshot + initial data extraction in PARALLEL
    // Start extracting listing data immediately (no extra wait needed)
    const [screenshot, listingData] = await Promise.all([
      captureScreenshot(),
      collectMarketplaceDataFast() // Optimized version without extra waits
    ]);

    // Step 3: Extract seller profile in background (if URL available)
    // This runs while we already have enough data to proceed
    let sellerProfilePromise = null;
    if (listingData.seller?.profile_url) {
      console.log("[BodyCart] Fetching seller profile in parallel");
      sellerProfilePromise = extractSellerProfileFromBackground(
        listingData.seller.profile_url
      );
    }

    // Wait for seller profile (with timeout to not block too long)
    if (sellerProfilePromise) {
      try {
        const sellerProfileData = await Promise.race([
          sellerProfilePromise,
          new Promise((resolve) => setTimeout(() => resolve(null), 3000)) // 3s max wait
        ]);

        if (sellerProfileData && !sellerProfileData.error) {
          listingData.seller = {
            ...listingData.seller,
            ...sellerProfileData,
            profile_url: listingData.seller.profile_url,
          };
        }
      } catch (e) {
        console.log("[BodyCart] Seller profile fetch failed, continuing without it");
      }
    }

    // Add screenshot to data
    listingData.screenshot_base64 = screenshot;

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`[BodyCart] Deep investigation complete in ${elapsed}ms:`, listingData);
    return listingData;
  }

  // Fast marketplace data collection (no extra waits)
  async function collectMarketplaceDataFast() {
    // Minimal wait - just enough for React to hydrate
    await new Promise((resolve) => setTimeout(resolve, 500));

    const screenshot = null; // Will be added by caller

    // Find the correct container
    const container = findProductContainer();
    console.log("[BodyCart] Fast scraping within:", container.tagName || "document");

    // Reuse the main collection logic but scoped to container
    const getText = (selector) => {
      const el = container === document
        ? document.querySelector(selector)
        : container.querySelector(selector);
      return el ? el.textContent.trim() : null;
    };

    const allSpans = queryInContainer(container, "span");
    const allDivs = queryInContainer(container, "div");

    // === PRICE DETECTION (improved) ===
    let price = null;
    const pricePatterns = [
      /^[\d\s.,]+\s*\$\s*·?\s*(disponible)?$/i,  // "150.000 $" or "150.000 $ · disponible"
      /^\$\s*[\d\s.,]+$/,                         // "$150.000"
      /^[\d\s.,]+\s*\$$/,                         // "150.000 $"
      /^[\d\s.,]+\s*(USD|MXN|CLP|EUR|pesos?)$/i,  // "150.000 CLP"
      /^(gratis|free)$/i,                         // "Gratis"
      /^[\d,.]+\s*€$/,                            // "150€"
      /^CLP\s*[\d\s.,]+$/i,                       // "CLP 150.000"
    ];

    // Collect all price candidates with their positions
    const priceCandidates = [];
    for (const span of allSpans) {
      const text = span.textContent.trim();
      if (text.length > 35 || text.length < 1) continue;

      for (const pattern of pricePatterns) {
        if (pattern.test(text)) {
          const rect = span.getBoundingClientRect();
          priceCandidates.push({
            text: text.replace(/\s*·\s*(disponible|available).*$/i, "").trim(),
            top: rect.top,
            left: rect.left,
            fontSize: parseFloat(window.getComputedStyle(span).fontSize) || 12
          });
          break;
        }
      }
    }

    // Prioritize prices: larger font size + higher position = main product price
    if (priceCandidates.length > 0) {
      // Sort by: 1) larger font size, 2) higher position (smaller top value)
      priceCandidates.sort((a, b) => {
        // Prefer larger fonts (main price is usually bigger)
        if (Math.abs(a.fontSize - b.fontSize) > 2) {
          return b.fontSize - a.fontSize;
        }
        // If similar font size, prefer higher position
        return a.top - b.top;
      });

      price = priceCandidates[0].text;
      console.log(`[BodyCart] Price candidates: ${priceCandidates.length}, selected: "${price}" (fontSize: ${priceCandidates[0].fontSize}px, top: ${priceCandidates[0].top}px)`);
    }

    // === TITLE DETECTION ===
    let title = null;
    const excludedTitlePatterns = [
      /resultados/i, /búsqueda/i, /search/i, /marketplace/i,
      /facebook/i, /enviar\s+mensaje/i, /detalles/i, /vendedor/i,
      /^\d+\s*(photos?|fotos?)/i,
    ];

    const isValidTitle = (text) => {
      if (!text || text.length < 3 || text.length > 150) return false;
      return !excludedTitlePatterns.some(p => p.test(text));
    };

    const h1Text = getText("h1");
    if (isValidTitle(h1Text)) title = h1Text;

    if (!title) {
      for (const span of allSpans.slice(0, 50)) { // Limit search for speed
        const text = span.textContent.trim();
        const rect = span.getBoundingClientRect();
        if (isValidTitle(text) && rect.left > window.innerWidth * 0.4 &&
            rect.top > 50 && rect.top < 300 &&
            !/^\d/.test(text) && !/^\$/.test(text) && !text.includes("·")) {
          title = text;
          break;
        }
      }
    }

    if (!title) {
      let docTitle = document.title
        .replace(/\s*[-|·]\s*Facebook.*$/i, "")
        .replace(/\s*[-|·]\s*Marketplace.*$/i, "")
        .trim();
      if (isValidTitle(docTitle)) title = docTitle;
    }
    if (!title) title = "Publicación de Marketplace";

    // === POSTED DATE & LOCATION ===
    let postedDate = null, listingLocation = null;
    for (const span of allSpans.slice(0, 100)) {
      const text = span.textContent.trim();
      const match1 = text.match(/publicado\s+hace\s+(.+?)\s+en\s+(.+)/i);
      if (match1) { postedDate = match1[1]; listingLocation = match1[2]; continue; }
      const match2 = text.match(/publicado\s+en\s+(.+)/i);
      if (match2 && !listingLocation) { listingLocation = match2[1]; continue; }
      const match3 = text.match(/listed\s+(.+?)\s+(?:ago\s+)?in\s+(.+)/i);
      if (match3) { postedDate = match3[1]; listingLocation = match3[2]; continue; }
      if (!postedDate && /hace\s+\d+\s+(día|días|semana|semanas|hora|horas|mes|meses)/i.test(text)) {
        postedDate = text;
      }
    }

    // === CONDITION ===
    let condition = null;
    const conditionTerms = ["new", "used", "nuevo", "usado"];
    for (const span of allSpans.slice(0, 80)) {
      const text = span.textContent.trim().toLowerCase();
      if (conditionTerms.some(t => text.includes(t))) {
        condition = span.textContent.trim();
        break;
      }
    }

    // === DESCRIPTION ===
    let description = null;
    for (const span of allSpans.slice(0, 100)) {
      const text = span.textContent.trim().toLowerCase();
      if (text === "detalles" || text === "details") {
        const parent = span.closest("div");
        if (parent?.parentElement) {
          description = parent.parentElement.textContent.trim()
            .replace(/^(detalles|details)\s*/i, "").substring(0, 500);
          break;
        }
      }
    }

    // === SELLER INFO ===
    let sellerName = null, sellerJoinDate = null, sellerProfileUrl = null;
    const excludedSellerPatterns = [
      /detalles\s+del\s+vendedor/i, /seller/i, /ver\s+perfil/i,
      /marketplace/i, /enviar\s+mensaje/i, /^\d+\s*(listings?|publicaciones?)/i,
    ];

    const isValidSellerName = (name) => {
      if (!name || name.length < 2 || name.length > 60) return false;
      return !excludedSellerPatterns.some(p => p.test(name));
    };

    const profileLinks = queryInContainer(container,
      'a[href*="/marketplace/profile/"], a[href*="/user/"]'
    );
    for (const link of profileLinks.slice(0, 10)) {
      const name = link.textContent.trim();
      if (isValidSellerName(name)) {
        sellerName = name;
        sellerProfileUrl = link.href;
        break;
      }
    }

    for (const span of allSpans.slice(0, 100)) {
      const text = span.textContent.trim();
      if (/se\s+unió\s+(a\s+facebook\s+)?en\s+\d{4}/i.test(text) ||
          /joined\s+(facebook\s+)?in\s+\d{4}/i.test(text)) {
        sellerJoinDate = text;
        break;
      }
    }

    // === IMAGES - Better count detection ===
    let imageCount = 0;

    // Method 1: Look for carousel indicator "1/7", "3 de 7", "1 of 5"
    for (const span of allSpans.slice(0, 100)) {
      const text = span.textContent.trim();
      const countMatch = text.match(/^\d+\s*[\/de]\s*(\d+)$/i);
      if (countMatch) {
        imageCount = parseInt(countMatch[1]);
        break;
      }
      // Also match "7 photos" / "7 fotos"
      const photosMatch = text.match(/^(\d+)\s*(photos?|fotos?|imágenes?)$/i);
      if (photosMatch) {
        imageCount = parseInt(photosMatch[1]);
        break;
      }
    }

    // Method 2: Count thumbnail images in carousel (small clickable images)
    if (imageCount === 0) {
      const thumbnails = queryInContainer(container, 'div[role="button"] img, div[tabindex="0"] img');
      const uniqueSrcs = new Set();
      thumbnails.forEach(img => {
        const src = img.src || "";
        if ((src.includes("scontent") || src.includes("fbcdn"))) {
          const rect = img.getBoundingClientRect();
          if (rect.width > 30 && rect.width < 200) {
            uniqueSrcs.add(src.split("?")[0]); // Remove query params
          }
        }
      });
      if (uniqueSrcs.size > 0) imageCount = uniqueSrcs.size;
    }

    // Method 3: Count all listing images from Facebook CDN
    const allListingImages = queryInContainer(container, "img")
      .filter(img => {
        const src = img.src || "";
        const width = img.naturalWidth || img.width || 0;
        return (src.includes("scontent") || src.includes("fbcdn")) && width > 100;
      });

    if (imageCount === 0) {
      // Deduplicate by base URL
      const uniqueImages = new Set(allListingImages.map(img => img.src.split("?")[0]));
      imageCount = uniqueImages.size || 1;
    }

    // Only send first image URL for analysis (but report correct count)
    const listingImages = allListingImages.slice(0, 1);

    return {
      url: window.location.href,
      platform: "facebook_marketplace",
      screenshot_base64: screenshot,
      html_content: "", // Skip HTML to reduce payload
      listing: {
        title, price, description, condition,
        location: listingLocation, posted_date: postedDate,
        category: null, image_count: imageCount || listingImages.length || 1,
      },
      seller: {
        name: sellerName, profile_url: sellerProfileUrl,
        join_date: sellerJoinDate, location: listingLocation,
        rating: null, response_rate: null, other_listings_count: null,
      },
      listing_images: listingImages.map(img => img.src),
      seller_other_listings: [],
    };
  }

  // Create floating button
  function createButton() {
    const button = document.createElement("button");
    button.id = "page-analyzer-btn";
    button.className = ""; // Start without visible class for smooth transition
    button.innerHTML = `
      <div class="bc-icon bc-icon-default">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
    `;
    button.title = "BodyCart - Analizar Página";
    button.style.display = "none"; // Start hidden by default
    document.body.appendChild(button);
    return button;
  }

  // Create side panel
  function createSidePanel() {
    const panel = document.createElement("div");
    panel.id = "page-analyzer-panel";

    // Get logo image URL from extension
    const logoURL = chrome.runtime.getURL("icons/logo_cropped_white.png");

    // Arrow icon for the handle (chevron right)
    const handleArrowSVG = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    `;

    panel.innerHTML = `
      <div class="pa-panel-handle" id="pa-panel-handle" title="Cerrar panel">
        ${handleArrowSVG}
      </div>
      <div class="pa-panel-header">
        <div class="pa-header-title">
          <img src="${logoURL}" alt="BodyCart" class="pa-header-logo">
          <h2>BodyCart</h2>
        </div>
        <button id="pa-close-btn" title="Cerrar">&times;</button>
      </div>
      <div class="pa-panel-content" id="pa-content">
        <p class="pa-loading">Los detalles del análisis aparecerán aquí...</p>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  // Collect comprehensive page data for AI analysis
  async function collectPageData() {
    const scripts = Array.from(document.getElementsByTagName("script"));
    const externalScripts = scripts.filter(
      (s) => s.src && !s.src.startsWith(window.location.origin)
    ).length;

    const forms = Array.from(document.getElementsByTagName("form"));
    const formData = forms.map((f) => ({
      action: f.action || "none",
      method: f.method || "get",
      hasPasswordField: f.querySelector('input[type="password"]') !== null,
    }));

    const iframes = Array.from(document.getElementsByTagName("iframe"));
    const iframeData = iframes.map((f) => f.src || "no-src");

    // Capture screenshot
    const screenshot = await captureScreenshot();

    const pageData = {
      // Core fields as per backend requirements
      url: window.location.href,
      html_content: document.documentElement.outerHTML,
      screenshot_base64: screenshot,

      // Additional metadata
      title: document.title || "No title",
      metaDescription: getMetaContent("description"),
      metaKeywords: getMetaContent("keywords"),
      scripts: scripts.length,
      externalScripts: externalScripts,
      links: analyzeLinks(),
      images: document.getElementsByTagName("img").length,
      loadTime: Math.round(performance.now()) + "ms",
      charset: document.characterSet,
      language: document.documentElement.lang || "Not specified",
      forms: formData.length > 0 ? JSON.stringify(formData) : "No forms",
      iframes:
        iframeData.length > 0 ? JSON.stringify(iframeData) : "No iframes",
      protocol: window.location.protocol,
    };

    console.log("[Page Analyzer] Scraping complete:", pageData);
    return pageData;
  }

  // Collect Facebook Marketplace specific data
  async function collectMarketplaceData() {
    // Wait for dynamic content to load (Facebook is a React SPA)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const screenshot = await captureScreenshot();

    // Find the correct container (modal or main listing area)
    // This prevents scraping the background feed or suggestions
    const container = findProductContainer();
    console.log("[BodyCart] Scraping within container:", container.tagName || "document");

    // Helper to safely get text content within container
    const getText = (selector) => {
      const el = container === document
        ? document.querySelector(selector)
        : container.querySelector(selector);
      return el ? el.textContent.trim() : null;
    };

    // Get all text elements within the container only
    const allSpans = queryInContainer(container, "span");
    const allDivs = queryInContainer(container, "div");

    console.log(`[BodyCart] Found ${allSpans.length} spans and ${allDivs.length} divs in container`);

    // ============================================
    // PRICE DETECTION - Multiple formats
    // ============================================
    let price = null;

    // Price patterns to match
    const pricePatterns = [
      /^[\d\s.,]+\s*\$\s*·?\s*(disponible)?$/i, // 35 000 $ · Disponible or 35 000 $
      /^\$\s*[\d\s.,]+$/, // $1,500 or $ 1 500
      /^[\d\s.,]+\s*\$$/, // 90 000 $ (Chilean format)
      /^[\d\s.,]+\s*(USD|MXN|CLP|EUR|pesos?)$/i, // 1500 USD or 1500 pesos
      /^(gratis|free)$/i, // Free
      /^[\d,.]+\s*€$/, // European format
    ];

    for (const span of allSpans) {
      const text = span.textContent.trim();
      // Skip very long text (not a price) or very short
      if (text.length > 30 || text.length < 1) continue;

      for (const pattern of pricePatterns) {
        if (pattern.test(text)) {
          // Clean up the price - remove "· Disponible" suffix
          price = text.replace(/\s*·\s*(disponible|available).*$/i, "").trim();
          break;
        }
      }
      if (price) break;
    }

    // ============================================
    // TITLE DETECTION
    // ============================================
    let title = null;

    // Excluded title patterns (UI elements, not actual titles)
    const excludedTitlePatterns = [
      /resultados/i,
      /búsqueda/i,
      /search/i,
      /marketplace/i,
      /facebook/i,
      /enviar\s+mensaje/i,
      /detalles/i,
      /vendedor/i,
      /^\d+\s*(photos?|fotos?)/i,
    ];

    const isValidTitle = (text) => {
      if (!text || text.length < 3 || text.length > 150) return false;
      for (const pattern of excludedTitlePatterns) {
        if (pattern.test(text)) return false;
      }
      return true;
    };

    // Strategy 1: Look for h1
    const h1Text = getText("h1");
    if (isValidTitle(h1Text)) {
      title = h1Text;
    }

    // Strategy 2: Look for the main listing title in the right panel
    // Facebook's listing title is typically a prominent span early in the details section
    if (!title) {
      // Find spans that look like titles (substantial text, not too long)
      for (const span of allSpans) {
        const text = span.textContent.trim();
        const rect = span.getBoundingClientRect();

        // Title characteristics:
        // - In the right portion of screen (details panel)
        // - Near the top (but not at very top which is navigation)
        // - Reasonable length
        // - Not a price, not a UI element
        if (
          isValidTitle(text) &&
          rect.left > window.innerWidth * 0.5 &&
          rect.top > 50 &&
          rect.top < 250 &&
          !/^\d/.test(text) && // Doesn't start with number (likely price)
          !/^\$/.test(text) && // Not a price
          !text.includes("·") // Not price with status
        ) {
          title = text;
          break;
        }
      }
    }

    // Strategy 3: Fallback to document title (clean it up)
    if (!title) {
      let docTitle = document.title;
      // Remove common Facebook suffixes
      docTitle = docTitle
        .replace(/\s*[-|·]\s*Facebook.*$/i, "")
        .replace(/\s*[-|·]\s*Marketplace.*$/i, "")
        .replace(/Resultados de la búsqueda/i, "")
        .trim();

      if (isValidTitle(docTitle)) {
        title = docTitle;
      }
    }

    // Final fallback
    if (!title) {
      title = "Publicación de Marketplace";
    }

    // ============================================
    // POSTED DATE & LOCATION - Spanish and English
    // ============================================
    let postedDate = null;
    let listingLocation = null;

    for (const span of allSpans) {
      const text = span.textContent.trim();

      // Spanish: "Publicado hace 3 semanas en Santiago, RM"
      const spanishWithDateMatch = text.match(
        /publicado\s+hace\s+(.+?)\s+en\s+(.+)/i
      );
      if (spanishWithDateMatch) {
        postedDate = spanishWithDateMatch[1]; // "3 semanas"
        listingLocation = spanishWithDateMatch[2]; // "Santiago, RM"
        continue;
      }

      // Spanish without date: "Publicado en Quinta Normal, RM"
      const spanishLocationOnly = text.match(/publicado\s+en\s+(.+)/i);
      if (spanishLocationOnly && !listingLocation) {
        listingLocation = spanishLocationOnly[1];
        continue;
      }

      // English: "Listed 3 weeks ago in Miami, FL"
      const englishMatch = text.match(/listed\s+(.+?)\s+(?:ago\s+)?in\s+(.+)/i);
      if (englishMatch) {
        postedDate = englishMatch[1];
        listingLocation = englishMatch[2];
        continue;
      }

      // English location only: "Listed in Miami, FL"
      const englishLocationOnly = text.match(/listed\s+in\s+(.+)/i);
      if (englishLocationOnly && !listingLocation) {
        listingLocation = englishLocationOnly[1];
        continue;
      }

      // Time patterns (standalone)
      if (!postedDate) {
        // Spanish time patterns
        if (
          /hace\s+\d+\s+(día|días|semana|semanas|hora|horas|minuto|minutos|mes|meses)/i.test(
            text
          )
        ) {
          postedDate = text;
        }
        // English time patterns
        if (
          /^\d+\s+(day|days|week|weeks|hour|hours|minute|minutes|month|months)s?\s+ago$/i.test(
            text
          )
        ) {
          postedDate = text;
        }
        // "ayer" / "yesterday" / "hoy" / "today"
        if (/^(ayer|yesterday|hoy|today|just now|ahora)$/i.test(text)) {
          postedDate = text;
        }
      }
    }

    // ============================================
    // CONDITION - Spanish and English
    // ============================================
    let condition = null;
    const conditionTerms = [
      "new",
      "used - like new",
      "used - good",
      "used - fair",
      "used",
      "nuevo",
      "usado - como nuevo",
      "usado - buen estado",
      "usado - aceptable",
      "usado",
    ];

    for (const span of allSpans) {
      const text = span.textContent.trim().toLowerCase();
      if (conditionTerms.includes(text)) {
        condition = span.textContent.trim();
        break;
      }
    }

    // Also look for "Estado: Nuevo" pattern
    if (!condition) {
      for (const span of allSpans) {
        const text = span.textContent.trim();
        if (/^(estado|condition)\s*:?\s*/i.test(text)) {
          // The condition might be in a sibling element
          const parent = span.parentElement;
          if (parent) {
            const siblingText = parent.textContent.trim();
            const match = siblingText.match(
              /(nuevo|used|usado|like new|como nuevo|buen estado)/i
            );
            if (match) {
              condition = match[1];
              break;
            }
          }
        }
      }
    }

    // ============================================
    // DESCRIPTION - Look for the details section
    // ============================================
    let description = null;

    // Look for text after "Detalles" or "Details" heading
    for (let i = 0; i < allSpans.length; i++) {
      const span = allSpans[i];
      const text = span.textContent.trim().toLowerCase();
      if (text === "detalles" || text === "details") {
        // Get text from nearby elements
        const parent = span.closest("div");
        if (parent && parent.parentElement) {
          const containerText = parent.parentElement.textContent.trim();
          // Remove the "Detalles" header and extract description
          description = containerText
            .replace(/^(detalles|details)\s*/i, "")
            .substring(0, 500);
          break;
        }
      }
    }

    // Fallback: look for longer text blocks
    if (!description) {
      const descCandidates = allDivs.filter((div) => {
        const text = div.textContent.trim();
        const children = div.children.length;
        // Look for divs with substantial text but not too nested
        return text.length > 30 && text.length < 1000 && children < 5;
      });

      if (descCandidates.length > 0) {
        // Sort by text length and get a reasonable one
        descCandidates.sort(
          (a, b) => b.textContent.length - a.textContent.length
        );
        for (const candidate of descCandidates) {
          const text = candidate.textContent.trim();
          // Skip if it's just navigation or UI text
          if (!/^(marketplace|facebook|enviar|send|share)/i.test(text)) {
            description = text.substring(0, 500);
            break;
          }
        }
      }
    }

    // ============================================
    // SELLER INFO
    // ============================================
    let sellerName = null;
    let sellerJoinDate = null;
    let sellerProfileUrl = null;

    // Excluded seller name patterns (UI elements)
    const excludedSellerPatterns = [
      /detalles\s+del\s+vendedor/i,
      /seller\s+(details|info)/i,
      /ver\s+perfil/i,
      /view\s+profile/i,
      /marketplace/i,
      /enviar\s+mensaje/i,
      /send\s+message/i,
      /^\d+\s*(listings?|publicaciones?)/i,
    ];

    const isValidSellerName = (name) => {
      if (!name || name.length < 2 || name.length > 60) return false;
      for (const pattern of excludedSellerPatterns) {
        if (pattern.test(name)) return false;
      }
      // Should not be all caps UI text
      if (name === name.toUpperCase() && name.length > 10) return false;
      return true;
    };

    // Find seller profile links (within container)
    const profileLinks = queryInContainer(
      container,
      'a[href*="/marketplace/profile/"], a[href*="/user/"], a[href*="facebook.com/"][role="link"]'
    );
    for (const link of profileLinks) {
      const name = link.textContent.trim();
      if (isValidSellerName(name)) {
        sellerName = name;
        sellerProfileUrl = link.href;
        break;
      }
    }

    // If no seller name found in links, look for it near "Seller" or "Vendedor" text
    if (!sellerName) {
      for (let i = 0; i < allSpans.length; i++) {
        const span = allSpans[i];
        const text = span.textContent.trim().toLowerCase();

        // Found seller section header, look at next siblings
        if (
          text === "vendedor" ||
          text === "seller" ||
          text.includes("detalles del vendedor")
        ) {
          // Look at nearby elements for the actual name
          const parent = span.closest("div");
          if (parent && parent.parentElement) {
            const container = parent.parentElement;
            const links = container.querySelectorAll("a");
            for (const link of links) {
              const linkText = link.textContent.trim();
              if (isValidSellerName(linkText)) {
                sellerName = linkText;
                sellerProfileUrl = link.href;
                break;
              }
            }
          }
        }
        if (sellerName) break;
      }
    }

    // Look for join date - Spanish and English
    for (const span of allSpans) {
      const text = span.textContent.trim();
      // Spanish patterns:
      // - "Se unió a Facebook en 2021"
      // - "Se unió en 2019"
      // - "Miembro desde 2019"
      // English patterns:
      // - "Joined Facebook in 2019"
      // - "Joined in 2019"
      // - "Member since 2019"
      if (/se\s+unió\s+(a\s+facebook\s+)?en\s+\d{4}/i.test(text)) {
        sellerJoinDate = text;
        break;
      }
      if (/joined\s+(facebook\s+)?in\s+\d{4}/i.test(text)) {
        sellerJoinDate = text;
        break;
      }
      if (/^(miembro\s+desde|member\s+since)\s+\d{4}/i.test(text)) {
        sellerJoinDate = text;
        break;
      }
      // Also match just the year context
      if (/^(en|in)\s+facebook\s+desde\s+\d{4}/i.test(text)) {
        sellerJoinDate = text;
        break;
      }
    }

    // ============================================
    // IMAGES - Count thumbnails in the carousel (within container)
    // ============================================
    let imageCount = 0;

    // Method 1: Count thumbnail images in the carousel at the bottom
    // These are typically small clickable images in a row
    const thumbnailContainers = queryInContainer(
      container,
      'div[role="button"] img, div[tabindex="0"] img'
    );
    const seenSrcs = new Set();

    thumbnailContainers.forEach((img) => {
      const src = img.src || "";
      // Only count Facebook CDN images (scontent/fbcdn) that we haven't seen
      if (
        (src.includes("scontent") || src.includes("fbcdn")) &&
        !seenSrcs.has(src)
      ) {
        // Check if it looks like a thumbnail (smaller size or in a row)
        const rect = img.getBoundingClientRect();
        if (rect.width > 30 && rect.width < 200 && rect.height > 30) {
          seenSrcs.add(src);
        }
      }
    });

    if (seenSrcs.size > 0) {
      imageCount = seenSrcs.size;
    }

    // Method 2: Fallback - look for image indicators like "1/7" or navigation dots
    if (imageCount === 0) {
      for (const span of allSpans) {
        const text = span.textContent.trim();
        // Match patterns like "1/7", "3 de 7", "1 of 5"
        const countMatch = text.match(/^\d+\s*[\/de]\s*(\d+)$/i);
        if (countMatch) {
          imageCount = parseInt(countMatch[1]);
          break;
        }
      }
    }

    // Method 3: Count all unique listing images from Facebook CDN (within container)
    if (imageCount === 0) {
      const allImages = queryInContainer(container, "img");
      const listingImageSrcs = new Set();

      allImages.forEach((img) => {
        const src = img.src || "";
        const width = img.naturalWidth || img.width || 0;
        // Facebook CDN images that are reasonably sized (not icons)
        if (
          (src.includes("scontent") || src.includes("fbcdn")) &&
          width > 100
        ) {
          // Extract base URL without size params to avoid counting same image multiple times
          const baseSrc = src.split("?")[0];
          listingImageSrcs.add(baseSrc);
        }
      });

      imageCount = listingImageSrcs.size;
    }

    // Collect actual image URLs for the backend (within container)
    const listingImages = queryInContainer(container, "img").filter(
      (img) => {
        const src = img.src || "";
        const width = img.naturalWidth || img.width || 0;
        return (
          (src.includes("scontent") || src.includes("fbcdn")) && width > 100
        );
      }
    );

    // ============================================
    // BUILD RESULT
    // ============================================
    const marketplaceData = {
      url: window.location.href,
      platform: "facebook_marketplace",
      screenshot_base64: screenshot,
      html_content: document.documentElement.outerHTML,

      listing: {
        title: title,
        price: price,
        description: description,
        condition: condition,
        location: listingLocation,
        posted_date: postedDate,
        category: null,
        image_count: imageCount || listingImages.length || 1,
      },

      seller: {
        name: sellerName,
        profile_url: sellerProfileUrl,
        join_date: sellerJoinDate,
        location: listingLocation,
        rating: null,
        response_rate: null,
        other_listings_count: null,
      },

      listing_images: listingImages.slice(0, 5).map((img) => img.src),
      seller_other_listings: [],
    };

    console.log("[Page Analyzer] Marketplace data collected:", marketplaceData);
    return marketplaceData;
  }

  // Capture screenshot of the page
  async function captureScreenshot() {
    try {
      // Use chrome.tabs.captureVisibleTab API through background script
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "CAPTURE_SCREENSHOT" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Page Analyzer] Runtime error:",
                chrome.runtime.lastError.message
              );
              resolve(null);
              return;
            }

            if (response && response.screenshot) {
              console.log("[Page Analyzer] Screenshot captured successfully");
              resolve(response.screenshot);
            } else {
              const errorMsg = response?.error || "Unknown error";
              console.warn(
                "[Page Analyzer] Screenshot capture failed:",
                errorMsg
              );
              console.warn(
                "[Page Analyzer] This may be due to missing permissions. Check manifest.json for host_permissions."
              );
              resolve(null);
            }
          }
        );
      });
    } catch (error) {
      console.error("[Page Analyzer] Screenshot error:", error);
      return null;
    }
  }

  // Get meta tag content
  function getMetaContent(name) {
    const meta =
      document.querySelector(`meta[name="${name}"]`) ||
      document.querySelector(`meta[property="og:${name}"]`);
    return meta ? meta.getAttribute("content") : "Not specified";
  }

  // Analyze links on the page
  function analyzeLinks() {
    const links = Array.from(document.getElementsByTagName("a"));
    const currentHost = window.location.hostname;

    let internal = 0;
    let external = 0;

    links.forEach((link) => {
      try {
        const href = link.href;
        if (!href || href.startsWith("javascript:") || href.startsWith("#"))
          return;
        const url = new URL(href);
        if (url.hostname === currentHost) {
          internal++;
        } else {
          external++;
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    return { total: links.length, internal, external };
  }

  // Send data to backend for AI analysis
  async function analyzeWithAI(pageData, platform) {
    // Route to appropriate endpoint based on platform
    const endpoint =
      platform === "facebook_marketplace"
        ? `${API_URL}/analyze/marketplace`
        : `${API_URL}/analyze`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pageData),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }

  // Render detailed analysis for sidebar
  function renderDetailedAnalysis(analysis) {
    const riskColors = {
      safe: "#22c55e",
      suspicious: "#f59e0b",
      dangerous: "#ef4444",
    };

    const riskColor = riskColors[analysis.risk_level] || riskColors.suspicious;

    // Main verdict/briefing section
    let html = `
      <div class="pa-section pa-risk-section" style="border-left: 4px solid ${riskColor};">
        <div class="pa-risk-header">
          <span class="pa-risk-badge" style="background: ${riskColor};">
            ${analysis.risk_level.toUpperCase()}
          </span>
          <span class="pa-score">Score: ${analysis.score}/100</span>
        </div>
        <h3 class="pa-verdict-title">${escapeHtml(
          analysis.verdict_title || "Análisis Completo"
        )}</h3>
        <p class="pa-summary">${escapeHtml(analysis.verdict_message || "")}</p>
      </div>
    `;

    // Render agent outputs (skip redundant ones)
    if (analysis.agent_outputs) {
      for (const [agentName, agentData] of Object.entries(
        analysis.agent_outputs
      )) {
        // Skip redundant agents - data shown in other sections
        if (agentName === "seller_trust" || agentName === "seller_history" || agentName === "price_analysis" || agentName === "description_quality" || agentName === "pricing" || agentName === "image_analysis" || agentName === "red_flags" || agentName === "reviews") continue;

        // Special rendering for ecommerce_guard with friendly UX
        if (agentName === "ecommerce_guard") {
          html += renderEcommerceGuardSection(agentData);
        } else {
          html += renderAgentOutput(agentName, agentData);
        }
      }
    }

    // ============================================
    // DETAILED INFORMATION SECTIONS
    // ============================================
    const details = analysis.details || {};

    // Render seller details if available
    if (details.seller && Object.keys(details.seller).length > 0) {
      html += renderSellerDetails(details.seller);
    }

    // Pricing and image analysis details removed for cleaner UI

    // Render reviews section if available (from reviews_agent)
    if (details.reviews_checked) {
      html += renderReviewsSection(details);
    }

    // Render AI analysis details (key concerns, positive signals, confidence bar)
    if (details.ai_analysis && Object.keys(details.ai_analysis).length > 0) {
      html += renderAIAnalysisDetails(details.ai_analysis);
    }
    
    // Render price comparison section if available (from price_comparison_agent)
    if (details.checked) {
      html += renderPriceComparisonSection(details);
    }

    return html;
  }

  // Render individual agent output
  function renderAgentOutput(agentName, agentData) {
    const agentTitles = {
      seller_trust: "Análisis del Vendedor",
      pricing: "Análisis de Precios",
      image_analysis: "Análisis de Imágenes",
      red_flags: "Banderas Rojas",
      supplier_confidence: "Confianza del Proveedor (IA)",
      ecommerce_guard: "Seguridad de Comercio",
      visual_analysis: "Análisis Visual",
      code_analysis: "Análisis de Código",
    };

    const title = agentTitles[agentName] || agentName;

    let html = `
      <div class="pa-section pa-agent-section">
        <h3 class="pa-agent-title">${title}</h3>
    `;

    // Render flags if any
    if (agentData.flags && agentData.flags.length > 0) {
      html += '<ul class="pa-agent-flags">';
      for (const flag of agentData.flags) {
        const flagClass =
          flag.type === "critical"
            ? "pa-flag-red"
            : flag.type === "warning"
            ? "pa-flag-yellow"
            : "pa-flag-green";
        html += `
          <li class="pa-agent-flag ${flagClass}">
            <span class="pa-flag-icon">${
              flag.type === "critical"
                ? "✕"
                : flag.type === "warning"
                ? "!"
                : "✓"
            }</span>
            <span>${escapeHtml(flag.msg)}</span>
          </li>
        `;
      }
      html += "</ul>";
    }

    html += "</div>";
    return html;
  }

  // Render detailed seller information
  function renderSellerDetails(seller) {
    let html = `
      <div class="pa-section pa-details-section">
        <h3 class="pa-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          Detalles del Vendedor
        </h3>
        <div class="pa-details-grid">
    `;

    // Seller name
    if (seller.seller_name) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Nombre</span>
          <span class="pa-detail-value">${escapeHtml(seller.seller_name)}</span>
        </div>
      `;
    }

    // Account age
    if (seller.account_age_years !== undefined) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Antigüedad</span>
          <span class="pa-detail-value pa-detail-highlight">${seller.account_age_years} años</span>
        </div>
      `;
    }

    // Join year
    if (seller.join_year) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Miembro desde</span>
          <span class="pa-detail-value">${seller.join_year}</span>
        </div>
      `;
    }

    // Ratings average (stars)
    if (seller.ratings_average !== undefined) {
      const stars =
        "★".repeat(Math.round(seller.ratings_average)) +
        "☆".repeat(5 - Math.round(seller.ratings_average));
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Calificación</span>
          <span class="pa-detail-value">
            <span class="pa-stars-display">${stars}</span>
            <span class="pa-rating-number">${seller.ratings_average.toFixed(
              1
            )}</span>
          </span>
        </div>
      `;
    }

    // Ratings count
    if (seller.ratings_count !== undefined) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Reseñas</span>
          <span class="pa-detail-value">${seller.ratings_count} calificaciones</span>
        </div>
      `;
    }

    // Followers
    if (seller.followers_count !== undefined) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Seguidores</span>
          <span class="pa-detail-value">${seller.followers_count}</span>
        </div>
      `;
    }

    // Listings count
    if (seller.listings_count) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Publicaciones</span>
          <span class="pa-detail-value">${escapeHtml(
            seller.listings_count
          )}</span>
        </div>
      `;
    }

    // Other listings count (legacy)
    if (seller.other_listings_count !== undefined) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Otras publicaciones</span>
          <span class="pa-detail-value">${seller.other_listings_count}</span>
        </div>
      `;
    }

    // Response rate
    if (seller.response_rate) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Respuesta</span>
          <span class="pa-detail-value">${escapeHtml(
            seller.response_rate
          )}</span>
        </div>
      `;
    }

    html += `</div>`; // Close grid

    // Badges (full width)
    if (seller.badges && seller.badges.length > 0) {
      html += `
        <div class="pa-detail-badges">
          <span class="pa-detail-label">Insignias</span>
          <div class="pa-badges-container">
            ${seller.badges
              .map(
                (badge) => `
              <span class="pa-badge-item">${escapeHtml(badge)}</span>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    // Strengths (full width)
    if (seller.strengths && seller.strengths.length > 0) {
      html += `
        <div class="pa-detail-strengths">
          <span class="pa-detail-label">Fortalezas</span>
          <div class="pa-strengths-container">
            ${seller.strengths
              .map(
                (strength) => `
              <span class="pa-strength-item">${escapeHtml(strength)}</span>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    // Profile investigated indicator
    if (seller.profile_investigated) {
      html += `
        <div class="pa-profile-investigated">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Perfil investigado en profundidad
        </div>
      `;
    }

    html += `</div>`; // Close section
    return html;
  }

  // Render pricing details
  function renderPricingDetails(pricing) {
    let html = `
      <div class="pa-section pa-details-section">
        <h3 class="pa-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="1" x2="12" y2="23"/>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          Detalles del Precio
        </h3>
        <div class="pa-details-grid">
    `;

    // Raw price
    if (pricing.price_raw) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Precio publicado</span>
          <span class="pa-detail-value pa-price-display">${escapeHtml(
            pricing.price_raw
          )}</span>
        </div>
      `;
    }

    // Numeric price
    if (pricing.price_numeric !== undefined) {
      const formattedPrice = new Intl.NumberFormat("es-CL").format(
        pricing.price_numeric
      );
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Valor numérico</span>
          <span class="pa-detail-value">$${formattedPrice}</span>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
    return html;
  }

  // Render image analysis details
  function renderImageDetails(images) {
    let html = `
      <div class="pa-section pa-details-section">
        <h3 class="pa-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Análisis de Imágenes
        </h3>
        <div class="pa-details-grid">
    `;

    // Image count
    if (images.image_count !== undefined) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Cantidad</span>
          <span class="pa-detail-value">${images.image_count} ${
        images.image_count === 1 ? "imagen" : "imágenes"
      }</span>
        </div>
      `;
    }

    // Screenshot available
    html += `
      <div class="pa-detail-item">
        <span class="pa-detail-label">Screenshot</span>
        <span class="pa-detail-value">${
          images.screenshot_available ? "✓ Capturado" : "✗ No disponible"
        }</span>
      </div>
    `;

    html += `
        </div>
      </div>
    `;
    return html;
  }

  // Render ecommerce_guard section with friendly, non-technical UI
  function renderEcommerceGuardSection(guardData) {
    if (!guardData || !guardData.details) return '';

    const details = guardData.details;
    const flags = guardData.flags || [];
    const scoreImpact = guardData.score_impact || 0;
    
    // Calculate security score (100 - impact)
    const securityScore = Math.max(0, 100 - scoreImpact);
    
    // Determine category based on score
    let category, categoryColor, categoryIcon;
    if (securityScore >= 80) {
      category = "Seguro";
      categoryColor = "#22c55e";
      categoryIcon = "✓";
    } else if (securityScore >= 60) {
      category = "Precaución";
      categoryColor = "#f59e0b";
      categoryIcon = "!";
    } else {
      category = "Riesgoso";
      categoryColor = "#ef4444";
      categoryIcon = "✕";
    }
    
    // Get critical and warning flags only
    const criticalFlags = flags.filter(f => f.type === "critical");
    const warningFlags = flags.filter(f => f.type === "warning");
    const issuesCount = criticalFlags.length + warningFlags.length;
    
    // Generate simple explanation
    let explanation = "";
    if (issuesCount === 0) {
      explanation = "Este sitio web pasó todas nuestras verificaciones de seguridad. Puedes comprar con confianza.";
    } else if (issuesCount === 1) {
      explanation = "Encontramos un problema de seguridad que deberías revisar antes de comprar.";
    } else if (issuesCount <= 3) {
      explanation = `Encontramos ${issuesCount} problemas de seguridad que deberías revisar antes de comprar.`;
    } else {
      explanation = `Encontramos ${issuesCount} problemas de seguridad. Te recomendamos no comprar en este sitio.`;
    }
    
    let html = `
      <div class="pa-section pa-security-section">
        <!-- Big Score Display -->
        <div class="pa-security-header">
          <div class="pa-security-score-circle" style="border-color: ${categoryColor};">
            <div class="pa-security-score-number" style="color: ${categoryColor};">
              ${securityScore}
            </div>
            <div class="pa-security-score-label">de 100</div>
          </div>
          <div class="pa-security-category" style="background: ${categoryColor};">
            ${categoryIcon} ${category}
          </div>
        </div>
        
        <!-- Simple Explanation -->
        <div class="pa-security-explanation">
          <h3 class="pa-security-title">🛡️ Análisis de Seguridad</h3>
          <p class="pa-security-message">${explanation}</p>
        </div>
    `;
    
    // Collapsible "See More" for technical details
    const hasDetails = details.visual_analysis || details.html_security || details.price_analysis;
    if (hasDetails) {
      html += `
        <div class="pa-security-details-collapsible">
          <button class="pa-security-details-toggle">
            <span>Ver detalles técnicos</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="pa-security-details-content">
      `;
      
      // Visual Analysis Details
      if (details.visual_analysis) {
        const visual = details.visual_analysis;
        html += `
          <div class="pa-detail-block">
            <h4 class="pa-detail-block-title">Análisis Visual</h4>
            <div class="pa-detail-item">
              <span class="pa-detail-label">Phishing detectado:</span>
              <span class="pa-detail-value">${visual.phishing_detected ? 'Sí' : 'No'}</span>
            </div>
            ${visual.phishing_reasoning ? `
              <div class="pa-detail-item">
                <span class="pa-detail-label">Detalles:</span>
                <span class="pa-detail-value">${escapeHtml(visual.phishing_reasoning)}</span>
              </div>
            ` : ''}
            <div class="pa-detail-item">
              <span class="pa-detail-label">Botón de compra presente:</span>
              <span class="pa-detail-value">${visual.purchase_button_present ? 'Sí' : 'No'}</span>
            </div>
          </div>
        `;
      }
      
      // HTML Security Details
      if (details.html_security) {
        const htmlSec = details.html_security;
        html += `
          <div class="pa-detail-block">
            <h4 class="pa-detail-block-title">Seguridad del Código</h4>
            <div class="pa-detail-item">
              <span class="pa-detail-label">Riesgo de Iframes:</span>
              <span class="pa-detail-value">${htmlSec.iframe_risk_detected ? 'Sí' : 'No'}</span>
            </div>
            ${htmlSec.iframe_reasoning ? `
              <div class="pa-detail-item">
                <span class="pa-detail-label">Detalles:</span>
                <span class="pa-detail-value">${escapeHtml(htmlSec.iframe_reasoning)}</span>
              </div>
            ` : ''}
            <div class="pa-detail-item">
              <span class="pa-detail-label">Riesgo CSRF:</span>
              <span class="pa-detail-value">${htmlSec.csrf_risk_detected ? 'Sí' : 'No'}</span>
            </div>
            ${htmlSec.csrf_reasoning ? `
              <div class="pa-detail-item">
                <span class="pa-detail-label">Detalles:</span>
                <span class="pa-detail-value">${escapeHtml(htmlSec.csrf_reasoning)}</span>
              </div>
            ` : ''}
          </div>
        `;
      }
      
      // Price Analysis Details
      if (details.price_analysis) {
        const price = details.price_analysis;
        html += `
          <div class="pa-detail-block">
            <h4 class="pa-detail-block-title">Análisis de Precios</h4>
            <div class="pa-detail-item">
              <span class="pa-detail-label">Precio sospechosamente bajo:</span>
              <span class="pa-detail-value">${price.suspiciously_low_price ? 'Sí' : 'No'}</span>
            </div>
            ${price.reasoning ? `
              <div class="pa-detail-item">
                <span class="pa-detail-label">Análisis:</span>
                <span class="pa-detail-value">${escapeHtml(price.reasoning)}</span>
              </div>
            ` : ''}
          </div>
        `;
      }
      
      html += `
          </div>
        </div>
      `;
    }
    
    html += `</div>`;
    return html;
  }

  // Render reviews section with friendly, non-technical UI
  function renderReviewsSection(reviewsData) {
    if (!reviewsData || !reviewsData.reviews_checked) return '';

    const reviewsCount = reviewsData.reviews_count || 0;
    const sentimentScore = reviewsData.sentiment_score || 50;
    const trustAssessment = reviewsData.trust_assessment || 'neutral';
    
    // Determine category based on sentiment
    let categoryColor, categoryIcon;
    if (sentimentScore >= 70 || trustAssessment === 'trustworthy') {
      categoryColor = "#22c55e";
      categoryIcon = "✓";
    } else if (sentimentScore <= 30 || trustAssessment === 'suspicious') {
      categoryColor = "#ef4444";
      categoryIcon = "✕";
    } else {
      categoryColor = "#f59e0b";
      categoryIcon = "!";
    }
    
    // Generate simple summary
    let summary = "";
    if (reviewsCount === 0) {
      summary = "No se encontraron reseñas en línea";
    } else if (sentimentScore >= 70) {
      summary = `${reviewsCount} reseñas - Mayormente positivas`;
    } else if (sentimentScore <= 30) {
      summary = `${reviewsCount} reseñas - Opiniones negativas`;
    } else {
      summary = `${reviewsCount} reseñas - Opiniones mixtas`;
    }

    let html = `
      <div class="pa-section pa-reputation-section-compact">
        <div class="pa-reputation-compact-header">
          <div class="pa-reputation-compact-icon" style="background: ${categoryColor};">
            💬
          </div>
          <div class="pa-reputation-compact-info">
            <h3 class="pa-reputation-compact-title">Reputación en Línea</h3>
            <p class="pa-reputation-compact-summary">${summary}</p>
          </div>
          <div class="pa-reputation-compact-score" style="color: ${categoryColor};">
            ${sentimentScore}
          </div>
        </div>
    `;
    
    // Collapsible details
    const hasDetails = (reviewsData.key_positives && reviewsData.key_positives.length > 0) ||
                      (reviewsData.key_negatives && reviewsData.key_negatives.length > 0) ||
                      reviewsData.trustpilot_rating ||
                      reviewsData.review_summary;
    
    if (hasDetails) {
      html += `
        <div class="pa-reputation-details-collapsible">
          <button class="pa-reputation-details-toggle">
            <span>Ver detalles completos</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="pa-reputation-details-content">
      `;
      
      // Show key positives and negatives as simple cards
      if (reviewsData.key_positives && reviewsData.key_positives.length > 0) {
        html += `
          <div class="pa-reputation-highlights">
            <div class="pa-highlight-title">✅ Aspectos positivos:</div>
        `;
        reviewsData.key_positives.forEach(positive => {
          html += `
            <div class="pa-highlight-card pa-highlight-positive">
              ${escapeHtml(positive)}
            </div>
          `;
        });
        html += `</div>`;
      }
      
      if (reviewsData.key_negatives && reviewsData.key_negatives.length > 0) {
        html += `
          <div class="pa-reputation-highlights">
            <div class="pa-highlight-title">⚠️ Aspectos negativos:</div>
        `;
        reviewsData.key_negatives.forEach(negative => {
          html += `
            <div class="pa-highlight-card pa-highlight-negative">
              ${escapeHtml(negative)}
            </div>
          `;
        });
        html += `</div>`;
      }
      
      // Trustpilot badge if available
      if (reviewsData.trustpilot_rating) {
        html += `
          <div class="pa-trustpilot-simple">
            <div class="pa-trustpilot-icon">★</div>
            <div class="pa-trustpilot-info">
              <div class="pa-trustpilot-name">Trustpilot</div>
              <div class="pa-trustpilot-score">${reviewsData.trustpilot_rating}/5 estrellas</div>
            </div>
            ${reviewsData.trustpilot_url ? `<a href="${reviewsData.trustpilot_url}" target="_blank" class="pa-trustpilot-link-simple">Ver más ↗</a>` : ''}
          </div>
        `;
      }
      
      // Summary if available
      if (reviewsData.review_summary) {
        html += `
          <div class="pa-reputation-summary-box">
            <h4 class="pa-summary-title">Resumen de IA</h4>
            <p class="pa-reputation-summary">${escapeHtml(reviewsData.review_summary)}</p>
          </div>
        `;
      }
      
      html += `
          </div>
        </div>
      `;
    }
    
    html += `</div>`;
    return html;
  }

  // Render price comparison section with collapsible store cards
  function renderPriceComparisonSection(priceData) {
    if (!priceData || !priceData.checked) return '';

    let html = `
      <div class="pa-section pa-details-section pa-price-comparison-section">
        <h3 class="pa-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          Comparación de Precios
        </h3>
    `;

    // Product name searched
    if (priceData.product_name) {
      html += `
        <div class="pa-price-search-info">
          <span class="pa-price-search-label">Producto buscado:</span>
          <span class="pa-price-search-product">${escapeHtml(priceData.product_name)}</span>
        </div>
      `;
    }

    // Comparison results (collapsible)
    if (priceData.comparisons && priceData.comparisons.length > 0) {
      html += `
        <div class="pa-price-summary">
          💡 Encontramos este producto en ${priceData.comparisons.length} ${priceData.comparisons.length === 1 ? 'tienda' : 'tiendas'} más
        </div>
        <div class="pa-price-collapsible">
          <button class="pa-price-toggle">
            <span>Ver ${priceData.comparisons.length} comparaciones</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="pa-price-list">
            ${priceData.comparisons.map(comparison => `
              <div class="pa-price-card">
                <div class="pa-price-card-header">
                  <span class="pa-price-store">🏪 ${escapeHtml(comparison.store)}</span>
                  ${comparison.url ? `<a href="${comparison.url}" target="_blank" class="pa-price-link">Ver producto ↗</a>` : ''}
                </div>
                ${comparison.title ? `<h4 class="pa-price-title">${escapeHtml(comparison.title)}</h4>` : ''}
                <div class="pa-price-amount">
                  <span class="pa-price-label">Precio:</span>
                  <span class="pa-price-value">${escapeHtml(comparison.price_text)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (priceData.checked) {
      // No comparisons found
      html += `
        <div class="pa-price-empty">
          <p>No encontramos este producto en otras tiendas en este momento.</p>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  // Render red flags details
  function renderRedFlagsDetails(redFlags) {
    // Check if there are meaningful flags
    const hasData = Object.values(redFlags).some(
      (v) => v !== undefined && v !== null && v !== false
    );

    let html = `
      <div class="pa-section pa-details-section pa-red-flags-details">
        <h3 class="pa-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
          Datos de Alerta
        </h3>
    `;

    // Show message if no red flags found
    if (!hasData) {
      html += `
        <div class="pa-no-flags-message">
          <span>✓ No se encontraron banderas rojas fáciles de identificar</span>
        </div>
      </div>
      `;
      return html;
    }

    html += `<div class="pa-details-grid">`;

    // Days posted
    if (redFlags.days_posted !== undefined) {
      html += `
        <div class="pa-detail-item">
          <span class="pa-detail-label">Días publicado</span>
          <span class="pa-detail-value">${redFlags.days_posted} ${
        redFlags.days_posted === 1 ? "día" : "días"
      }</span>
        </div>
      `;
    }

    // Location mismatch
    if (redFlags.location_mismatch) {
      html += `
        <div class="pa-detail-item pa-detail-warning">
          <span class="pa-detail-label">Ubicación</span>
          <span class="pa-detail-value">⚠️ No coincide</span>
        </div>
      `;
    }

    // Payment red flag
    if (redFlags.payment_red_flag) {
      html += `
        <div class="pa-detail-item pa-detail-danger">
          <span class="pa-detail-label">Pago sospechoso</span>
          <span class="pa-detail-value">🚨 ${escapeHtml(
            redFlags.payment_red_flag
          )}</span>
        </div>
      `;
    }

    // Contact bypass
    if (redFlags.contact_bypass) {
      html += `
        <div class="pa-detail-item pa-detail-warning">
          <span class="pa-detail-label">Contacto externo</span>
          <span class="pa-detail-value">⚠️ ${escapeHtml(
            redFlags.contact_bypass
          )}</span>
        </div>
      `;
    }

    // Phone in description
    if (redFlags.phone_in_description) {
      html += `
        <div class="pa-detail-item pa-detail-warning">
          <span class="pa-detail-label">Teléfono</span>
          <span class="pa-detail-value">⚠️ En descripción</span>
        </div>
      `;
    }

    // Email in description
    if (redFlags.email_in_description) {
      html += `
        <div class="pa-detail-item pa-detail-warning">
          <span class="pa-detail-label">Email</span>
          <span class="pa-detail-value">⚠️ En descripción</span>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
    return html;
  }

  // Render AI analysis details (key concerns and positive signals)
  function renderAIAnalysisDetails(aiAnalysis) {
    if (!aiAnalysis || Object.keys(aiAnalysis).length === 0) return "";

    let html = `
      <div class="pa-section pa-details-section pa-ai-analysis">
        <h3 class="pa-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Análisis de IA
        </h3>
    `;

    // Confidence score with visual bar
    if (aiAnalysis.confidence_score !== undefined) {
      const score = aiAnalysis.confidence_score;
      const barColor =
        score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
      html += `
        <div class="pa-confidence-display">
          <div class="pa-confidence-header">
            <span class="pa-confidence-title">Confianza del Vendedor</span>
            <span class="pa-confidence-score" style="color: ${barColor}">${score}/100</span>
          </div>
          <div class="pa-confidence-bar-container">
            <div class="pa-confidence-bar" style="width: ${score}%; background: ${barColor}"></div>
          </div>
        </div>
      `;
    }

    // Key concerns
    if (aiAnalysis.key_concerns && aiAnalysis.key_concerns.length > 0) {
      html += `
        <div class="pa-ai-concerns">
          <h4 class="pa-ai-subtitle pa-concerns-title">
            <span class="pa-icon-warning">⚠️</span>
            Preocupaciones Principales
          </h4>
          <ul class="pa-ai-list pa-concerns-list">
            ${aiAnalysis.key_concerns
              .map(
                (concern) => `
              <li class="pa-ai-item pa-concern-item">${escapeHtml(concern)}</li>
            `
              )
              .join("")}
          </ul>
        </div>
      `;
    }

    // Positive signals
    if (aiAnalysis.positive_signals && aiAnalysis.positive_signals.length > 0) {
      html += `
        <div class="pa-ai-positives">
          <h4 class="pa-ai-subtitle pa-positives-title">
            <span class="pa-icon-check">✓</span>
            Señales Positivas
          </h4>
          <ul class="pa-ai-list pa-positives-list">
            ${aiAnalysis.positive_signals
              .map(
                (signal) => `
              <li class="pa-ai-item pa-positive-item">${escapeHtml(signal)}</li>
            `
              )
              .join("")}
          </ul>
        </div>
      `;
    }

    // Analysis method indicator
    if (aiAnalysis.analysis_method === "llm") {
      html += `
        <div class="pa-ai-method">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
            <path d="M12 2a10 10 0 0 1 10 10"/>
          </svg>
          Análisis realizado con IA
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  function init() {
    const button = createButton();
    const panel = createSidePanel();
    const content = document.getElementById("pa-content");
    const closeBtn = document.getElementById("pa-close-btn");

    let currentPlatform = detectPlatform();
    let lastAnalysis = null;
    let autoAnalysisTriggered = false; // Flag to prevent repeated auto-analysis
    let currentUrl = window.location.href; // Track current URL for SPA navigation

    // Auto-start analysis function
    async function autoStartAnalysis() {
      if (autoAnalysisTriggered && currentUrl === window.location.href) {
        return; // Already analyzed this page
      }

      currentPlatform = detectPlatform();
      if (!currentPlatform) return;

      autoAnalysisTriggered = true;
      currentUrl = window.location.href;

      // Show loading state in button
      setButtonLoading(button, true);

      // Show loading progress messages
      showLoadingProgress(currentPlatform);

      try {
        let dataToAnalyze;

        // Collect data based on platform
        if (currentPlatform === "facebook_marketplace") {
          // Use deep investigation flow for Facebook Marketplace
          dataToAnalyze = await deepInvestigateMarketplace();
        } else {
          // Regular flow for e-commerce
          dataToAnalyze = await collectPageData();
        }

        // Send to backend for analysis
        const analysis = await analyzeWithAI(dataToAnalyze, currentPlatform);

        // Store for later use in details sidebar
        lastAnalysis = analysis;

        // Hide loading progress
        hideLoadingProgress();

        // Reset button state
        setButtonLoading(button, false);

        // Show mini result notification
        showResultNotification(analysis.risk_level, analysis);
      } catch (error) {
        console.error("[BodyCart] Auto-analysis error:", error);

        // Hide loading progress
        hideLoadingProgress();

        // Reset button state
        setButtonLoading(button, false);

        // Show error notification
        const errorNotification = document.createElement("div");
        errorNotification.id = "bc-notification";
        errorNotification.className = "bc-notification bc-notification-error";

        errorNotification.innerHTML = `
          <div class="bc-notif-icon">✕</div>
          <div class="bc-notif-content">
            <div class="bc-notif-title">Error</div>
            <div class="bc-notif-message">${escapeHtml(
              error.message || "Error desconocido"
            )}</div>
          </div>
          <button class="bc-notif-close" id="bc-notif-close-error">&times;</button>
        `;

        document.body.appendChild(errorNotification);

        setTimeout(() => {
          errorNotification.classList.add("bc-notif-show");
        }, 100);

        document
          .getElementById("bc-notif-close-error")
          .addEventListener("click", () => {
            errorNotification.classList.remove("bc-notif-show");
            setTimeout(() => errorNotification.remove(), 300);
          });

        // Auto-hide after 5 seconds
        setTimeout(() => {
          if (errorNotification.classList.contains("bc-notif-show")) {
            errorNotification.classList.remove("bc-notif-show");
            setTimeout(() => errorNotification.remove(), 300);
          }
        }, 5000);
      }
    }

    // Visibility Manager
    function updateVisibility() {
      // Don't hide if panel is open
      if (panel.classList.contains("pa-open")) {
        button.style.display = "none";
        return;
      }

      const platform = detectPlatform();
      
      // Check if URL changed (SPA navigation)
      if (currentUrl !== window.location.href) {
        autoAnalysisTriggered = false; // Reset flag for new page
        currentUrl = window.location.href;
      }

      if (platform) {
        if (button.style.display === "none") {
          button.style.display = "flex";
          // Add smooth entrance animation
          setTimeout(() => {
            button.classList.add("bc-button-visible");
          }, 50);
          
          // Auto-start analysis when button becomes visible
          if (!autoAnalysisTriggered) {
            setTimeout(() => {
              autoStartAnalysis();
            }, 500); // Small delay to ensure page is ready
          }
        }
      } else {
        if (button.style.display !== "none") {
          button.classList.remove("bc-button-visible");
          setTimeout(() => {
            button.style.display = "none";
          }, 300);
        }
      }
    }

    // Check visibility initially and on intervals (for SPAs)
    updateVisibility();
    setInterval(updateVisibility, 1000);

    // Also check on mutations for faster response
    const observer = new MutationObserver(() => {
      // Debounce slightly
      if (window.visibilityTimeout) clearTimeout(window.visibilityTimeout);
      window.visibilityTimeout = setTimeout(updateVisibility, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Main button click - Show details or re-analyze
    button.addEventListener("click", async () => {
      // Prevent multiple clicks while analyzing
      if (button.disabled) return;

      // If we have a previous analysis, show details
      if (lastAnalysis) {
        openDetailsSidebar(lastAnalysis);
        return;
      }

      // Otherwise, re-run analysis (in case auto-analysis failed or was skipped)
      autoStartAnalysis();
    });

    // Close panel
    closeBtn.addEventListener("click", () => {
      panel.classList.remove("pa-open");
      updateVisibility(); // Check if button should be shown
    });

    // Panel handle click - toggle panel open/close
    const panelHandle = document.getElementById("pa-panel-handle");
    panelHandle.addEventListener("click", () => {
      panel.classList.toggle("pa-open");
      updateVisibility();
    });

    // Close panel on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("pa-open")) {
        panel.classList.remove("pa-open");
        updateVisibility();
      }
    });
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
