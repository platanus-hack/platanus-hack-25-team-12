// BodyCart - Background Service Worker

// Extension installed
chrome.runtime.onInstalled.addListener((details) => {
  // Extension installed or updated
});

// Function to extract seller data from seller profile page
function extractSellerDataFromPage() {
  const allSpans = Array.from(document.querySelectorAll('span'));
  const allDivs = Array.from(document.querySelectorAll('div'));
  const data = {
    name: null,
    join_date: null,
    listings_count: null,
    followers_count: null,
    location: null,
    ratings_count: null,
    ratings_average: null,
    badges: [],
    strengths: [],
    profile_screenshot: null,
    // New fields for enhanced analysis
    response_rate: null,
    response_time: null,
    verified_identity: false,
    mutual_friends: null,
    recent_activity: null,
    seller_since: null,
    total_sales: null,
    profile_completeness: 0
  };

  // Extract seller name (usually h1 or prominent heading)
  const h1 = document.querySelector('h1');
  if (h1) {
    data.name = h1.textContent.trim();
    data.profile_completeness += 20;
  }

  for (const span of allSpans) {
    const text = span.textContent.trim();

    // Join date: "Se unió a Facebook en 2008" / "Joined Facebook in 2008"
    if (/se\s+unió\s+a?\s*facebook\s+(en\s+)?\d{4}/i.test(text)) {
      data.join_date = text;
      data.profile_completeness += 15;
    }
    if (/joined\s+(facebook\s+)?(in\s+)?\d{4}/i.test(text)) {
      data.join_date = text;
      data.profile_completeness += 15;
    }

    // Listings count: "20+ publicaciones activas" / "20+ listings"
    const listingsMatch = text.match(/(\d+)\+?\s*(publicaciones?|listings?|artículos?)/i);
    if (listingsMatch) {
      data.listings_count = listingsMatch[1] + '+';
      data.profile_completeness += 10;
    }

    // Followers: "76 seguidores" / "76 followers"
    const followersMatch = text.match(/(\d+)\s*(seguidores|followers)/i);
    if (followersMatch) {
      data.followers_count = parseInt(followersMatch[1]);
      data.profile_completeness += 10;
    }

    // Location: "Vive en Santiago de Chile" / "Lives in Santiago"
    const locationMatch = text.match(/(vive\s+en|lives\s+in)\s+(.+)/i);
    if (locationMatch) {
      data.location = locationMatch[2];
      data.profile_completeness += 5;
    }

    // Ratings count: "Según 22 calificaciones" / "Based on 22 ratings"
    const ratingsMatch = text.match(/(\d+)\s*(calificaciones?|ratings?|reviews?|reseñas?)/i);
    if (ratingsMatch) {
      data.ratings_count = parseInt(ratingsMatch[1]);
      data.profile_completeness += 15;
    }

    // Response rate: "Responde al 90% de los mensajes" / "Responds to 90% of messages"
    const responseRateMatch = text.match(/respond[es]?\s+(al\s+)?(\d+)%/i);
    if (responseRateMatch) {
      data.response_rate = parseInt(responseRateMatch[2]) + '%';
    }

    // Response time: "Normalmente responde en 1 hora" / "Usually responds within 1 hour"
    if (/respond[es]?\s+(en|within)\s+/i.test(text)) {
      data.response_time = text;
    }

    // Verified identity
    if (/identidad\s+verificada|verified\s+identity|cuenta\s+verificada/i.test(text)) {
      data.verified_identity = true;
      data.profile_completeness += 10;
    }

    // Mutual friends: "5 amigos en común" / "5 mutual friends"
    const mutualMatch = text.match(/(\d+)\s*(amigos?\s+en\s+común|mutual\s+friends?)/i);
    if (mutualMatch) {
      data.mutual_friends = parseInt(mutualMatch[1]);
    }

    // Seller since: "Vendedor desde 2020" / "Seller since 2020"
    const sellerSinceMatch = text.match(/(vendedor|seller)\s+(desde|since)\s+(\d{4})/i);
    if (sellerSinceMatch) {
      data.seller_since = sellerSinceMatch[3];
    }

    // Total sales/transactions
    const salesMatch = text.match(/(\d+)\s*(ventas?|sales?|transacciones?|transactions?)/i);
    if (salesMatch) {
      data.total_sales = parseInt(salesMatch[1]);
      data.profile_completeness += 10;
    }

    // Badges: "Buena calificación" / "Good rating"
    if (/buena\s+calificaci[oó]n|good\s+rating/i.test(text)) {
      if (!data.badges.includes('Buena calificación')) {
        data.badges.push('Buena calificación');
        data.profile_completeness += 5;
      }
    }
    if (/vendedor\s+(destacado|top)|top\s+seller/i.test(text)) {
      if (!data.badges.includes('Vendedor destacado')) {
        data.badges.push('Vendedor destacado');
        data.profile_completeness += 5;
      }
    }
    if (/responde\s+r[aá]pido|responds?\s+(quickly|fast)/i.test(text)) {
      if (!data.badges.includes('Responde rápido')) {
        data.badges.push('Responde rápido');
        data.profile_completeness += 5;
      }
    }
    if (/super\s+(vendedor|seller)|highly\s+rated/i.test(text)) {
      if (!data.badges.includes('Super vendedor')) {
        data.badges.push('Super vendedor');
        data.profile_completeness += 5;
      }
    }

    // Strengths: "Comunicación (13)", "Puntualidad (5)"
    const strengthMatch = text.match(/(comunicaci[oó]n|puntualidad|descripci[oó]n|precio|communication|punctuality|description|price)\s*\((\d+)\)/i);
    if (strengthMatch) {
      const strength = `${strengthMatch[1]} (${strengthMatch[2]})`;
      if (!data.strengths.includes(strength)) {
        data.strengths.push(strength);
      }
    }
  }

  // Try to calculate average rating from stars
  const starsContainer = document.querySelector('[aria-label*="estrella"], [aria-label*="star"]');
  if (starsContainer) {
    const ariaLabel = starsContainer.getAttribute('aria-label');
    const ratingMatch = ariaLabel?.match(/(\d+[.,]?\d*)/);
    if (ratingMatch) {
      data.ratings_average = parseFloat(ratingMatch[1].replace(',', '.'));
      data.profile_completeness += 10;
    }
  }

  // Count filled stars visually as fallback
  const allStars = document.querySelectorAll('svg[aria-label*="estrella"], i[class*="star"]');
  if (allStars.length > 0 && !data.ratings_average) {
    data.ratings_average = allStars.length;
  }

  // Look for recent activity indicators
  for (const div of allDivs) {
    const text = div.textContent.trim();
    if (/activo\s+(hoy|ayer|hace)|active\s+(today|yesterday|ago)/i.test(text) && text.length < 50) {
      data.recent_activity = text;
      break;
    }
  }

  // Cap profile completeness at 100
  data.profile_completeness = Math.min(100, data.profile_completeness);

  return data;
}

// Extract seller profile in a hidden tab
async function extractSellerProfile(sellerUrl) {
  return new Promise((resolve) => {
    // Create hidden tab
    chrome.tabs.create({
      url: sellerUrl,
      active: false // Don't focus the tab
    }, (tab) => {
      const tabId = tab.id;
      let resolved = false;

      // Timeout after 5 seconds (reduced from 10s)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.remove(tabId).catch(() => {});
          resolve({ error: 'Timeout loading seller profile' });
        }
      }, 5000);

      // Listen for tab to finish loading
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);

          // Wait briefly for React to hydrate, then extract immediately
          setTimeout(async () => {
            if (resolved) return;

            try {
              // Skip screenshot capture - not used in analysis, saves ~500ms
              // Inject and execute extraction script directly
              const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: extractSellerDataFromPage
              });

              clearTimeout(timeout);
              resolved = true;

              // Close the tab immediately
              chrome.tabs.remove(tabId).catch(() => {});

              if (results && results[0]?.result) {
                resolve(results[0].result);
              } else {
                resolve({ error: 'No data extracted' });
              }
            } catch (error) {
              clearTimeout(timeout);
              resolved = true;
              chrome.tabs.remove(tabId).catch(() => {});
              resolve({ error: error.message });
            }
          }, 500); // Reduced from 1s - just enough for hydration
        }
      };

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_SCREENSHOT') {
    // Capture visible tab as base64
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: 'png', quality: 80 },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ screenshot: null, error: chrome.runtime.lastError.message });
        } else {
          // Extract base64 data (remove "data:image/png;base64," prefix)
          const base64 = dataUrl.split(',')[1];
          sendResponse({ screenshot: base64 });
        }
      }
    );
    // Return true to indicate async response
    return true;
  }

  if (message.type === 'EXTRACT_SELLER_PROFILE') {
    // Extract seller data from profile page in background tab
    extractSellerProfile(message.url)
      .then((data) => {
        sendResponse(data);
      })
      .catch((error) => {
        sendResponse({ error: error.message });
      });
    return true; // Async response
  }

  if (message.type === 'ANALYZE_PAGE') {
    // Future: Additional background processing if needed
    sendResponse({ status: 'received', data: message.data });
  }

  return true;
});
