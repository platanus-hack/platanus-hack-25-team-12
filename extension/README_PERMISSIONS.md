# BodyCart Extension - Permissions Guide

## Current Permissions

The extension requires the following permissions in `manifest.json`:

```json
{
  "permissions": ["activeTab", "tabs", "scripting"],
  "host_permissions": ["<all_urls>"]
}
```

### Why Each Permission is Needed

1. **`activeTab`** - Allows the extension to access the currently active tab when you click the extension button
2. **`tabs`** - Required to:
   - Create new tabs programmatically (for seller profile extraction)
   - Query tab information (URL, title, etc.)
   - Remove tabs after extracting data
3. **`scripting`** - Allows the extension to inject content scripts and extract data from pages
4. **`host_permissions: <all_urls>`** - Allows the extension to run on all websites (needed for Facebook Marketplace and other e-commerce sites)

## How Seller Profile Extraction Works

When you analyze a Facebook Marketplace listing, the extension:

1. **Creates a hidden background tab** that navigates to the seller's profile page
2. **Waits for the page to load** completely
3. **Injects a data extraction script** to gather seller information (ratings, join date, badges, etc.)
4. **Closes the tab automatically** once data is extracted
5. **Returns the data** to the main analysis

This happens in the background without interrupting your browsing.

## Troubleshooting

### The seller profile tab isn't opening

**Check the browser console for errors:**

1. Open Chrome DevTools (F12 or Cmd+Option+I)
2. Go to the **Console** tab
3. Look for messages starting with `[BodyCart]`

**Common errors and solutions:**

#### Error: "Failed to create tab: ..."
- **Cause**: Chrome blocked the tab creation (popup blocker, insufficient permissions)
- **Solution**: 
  1. Click the extension icon in Chrome toolbar
  2. Make sure "Site access" is set to "On all sites" or "On click"
  3. Try reloading the extension: Go to `chrome://extensions/` → Find "BodyCart" → Click reload button

#### Error: "Timeout loading seller profile"
- **Cause**: The seller's profile page took too long to load (>5 seconds)
- **Solution**: 
  - Check your internet connection
  - The seller's profile might be private or deleted
  - Try the analysis again

#### Error: "No data extracted"
- **Cause**: The data extraction script couldn't find the seller information
- **Solution**: 
  - The seller might have a very minimal profile
  - Facebook might have changed their page structure
  - This is normal for new/incomplete profiles

### Checking Extension Permissions in Chrome

1. Go to `chrome://extensions/`
2. Find **BodyCart**
3. Click **Details**
4. Scroll to **Permissions** section
5. Verify it shows:
   - ✓ Read and change all your data on all websites
   - ✓ Manage your tabs and browsing activity

## Privacy Note

The extension only extracts data **temporarily** in background tabs that are **automatically closed**. No browsing data is stored or sent anywhere except to your configured backend API for analysis.

## Installation/Reload Instructions

After making permission changes:

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Find **BodyCart** extension
4. Click the **Reload** (🔄) button
5. Test the extension on a Facebook Marketplace listing

If problems persist, try:
1. Remove the extension completely
2. Re-load it from the extension directory
3. Accept all permission prompts
