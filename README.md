# AI n8n Send Website Data — Chrome Extension

<p align="center">
  <img src="icons/logo-square.jpg" alt="Solomon Christ Logo" width="180" style="border-radius: 14px;" />
</p>

A fast, lightweight Chrome Extension (Manifest V3) that sends **passive, non-scraping website metadata** and your **personal notes/tags** from any open tab directly to an **n8n Workflow Webhook** as structured JSON—while maintaining a complete **local backup history** on your machine.

---

## How to Load It in Chrome Right Now

1. Open Chrome and go to `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right corner).
3. Click **Load unpacked** (top-left) and select your project folder (for example, the folder where you cloned or downloaded `ai-n8n-send-website-chrome-extension`).
4. Click the **Extensions puzzle icon** in Chrome's toolbar, **Pin** **AI n8n Send Website Data**, click it to open **Settings**, and paste your **n8n Webhook URL**.

---

## Key Features

- **One-Click Website Metadata + Notes to n8n**: Click the pinned extension icon on any open tab, add optional notes or tags, and send everything as clean JSON to your n8n Webhook (`POST` with automatic `GET` fallback). Includes an optional **Auto-Send on Popup Open** toggle in Settings.
- **100% Passive & Zero Bot/Scraping Footprint**:
  - **Zero extra HTTP requests to the website**: Never crawls links, never fetches background pages, and never triggers anti-bot or rate-limit protections.
  - **On-Demand `activeTab` only**: Runs only when you click the extension icon and reads standard `<head>` metadata (`title`, URL, canonical URL, `<meta>` tags, OpenGraph `og:*`, Twitter Card `twitter:*`, RSS/Atom feed links, and public `application/ld+json` Schema.org metadata) plus any text you actively highlighted on the page.
- **Built-In "Copy All for AI" & n8n Expression Cheatsheet**:
  - Click **`n8n Expressions`** to copy individual expressions (`{{ $json.body.page.canonicalUrl }}`, `{{ $json.body.userNotes }}`, etc.) or click **`Copy All for AI`** to copy a complete, ready-to-paste prompt block for your next n8n AI Agent / OpenAI / Anthropic node.
- **URL Query Parameter Privacy & Deduplication**:
  - Automatically strips tracking parameters (`utm_*`, `fbclid`, `gclid`, `s`, etc.) from `page.canonicalUrl` (and `page.url` by default), with a setting or 1-click **`Strip ?params`** button to strip **all** query parameters (such as reset tokens or signed share links) before sending to n8n or saving to local history.
- **Automatic Local Backup History**:
  - Every send attempt (both `Sent` and `Failed`) is automatically backed up to `chrome.storage.local` on your system (with secret webhook URL paths masked in history exports).
  - Browse, search, inspect the exact JSON payload, **Resend/Retry** any item to n8n, or **Export** your entire history as a `.json` backup file (`n8n-website-history-backup-YYYY-MM-DD.json`).

---

## Setting Up & Securing Your n8n Workflow

1. In **n8n**, add a **Webhook** trigger node to your workflow:
   - **HTTP Method**: `POST` (recommended for full nested JSON body).
   - **Path**: e.g. `website-capture`
2. **Secure Your Production Webhook (Highly Recommended)**:
   - Without authentication, anyone who discovers your Production Webhook URL can send `POST` requests to your workflow.
   - In your n8n Webhook node, set **Authentication** to **`Header Auth`**, and create a credential with a **Name** (e.g., `X-Webhook-Secret` or `Authorization`) and a secret **Value**.
   - In the Chrome Extension's **Settings** tab, enter that exact same **Header Name** and **Header Value**.
3. Copy either the **Test URL** (while building) or **Production URL** (when workflow is active), paste it into the extension's **Settings** tab, and click **Save Settings**.
4. Click **Test Webhook** to verify connectivity with n8n.

---

## Best Practices for "Second Brain" & Knowledge Base Builders

1. **Key Records on `canonicalUrl` (Prevent Duplicates)**:
   - The same article or post shared from different sources often carries different query parameters. Key your database / Notion / Airtable / Supabase upsert on **`{{ $json.body.page.canonicalUrl }}`** instead of `page.url`.
   - The extension automatically strips tracking parameters from `canonicalUrl` so re-sending the same page cleanly updates your notes and tags on the existing record rather than creating duplicate entries.
2. **Capturing X (Twitter) & LinkedIn Posts (`selectedText`)**:
   - Because this extension is 100% passive and never scrapes page bodies, it sends `<head>` metadata plus whatever text you highlight on the page (`selectedText`).
   - While articles and blogs usually have rich `<meta>` and OpenGraph descriptions, **X and LinkedIn posts often have thin or generic meta tags**. When capturing a post on X or LinkedIn, **highlight the post text on the page before clicking the extension icon** so the full post content is sent inside `{{ $json.body.selectedText }}`.
3. **Stripping Sensitive Query Parameters (`?token=...`, Signed URLs)**:
   - In **Settings &rarr; URL Query Parameter Privacy**, you can choose between:
     - **Strip Tracking Params Only (Default)**: Removes `utm_*`, `fbclid`, `gclid`, `s`, etc., while preserving functional params like YouTube `?v=...`.
     - **Strip ALL Query Params**: Removes all `?query` strings and `#hash` fragments before sending to n8n and before saving to local history.
   - You can also click the **`Strip ?params`** pill directly on the popup's Website Card anytime a URL has query parameters.

---

## Example JSON Payload Sent to n8n

```json
{
  "event": "website_capture",
  "source": "ai-n8n-send-website-chrome-extension",
  "sentAt": "2026-11-05T01:00:00.000Z",
  "userNotes": "Great reference for our AI automation pipeline",
  "userTags": ["ai", "n8n", "research"],
  "selectedText": "Optional text highlighted by the user on the page",
  "page": {
    "title": "Example Website Title",
    "url": "https://example.com/articles/automation",
    "canonicalUrl": "https://example.com/articles/automation",
    "domain": "example.com",
    "origin": "https://example.com",
    "pathname": "/articles/automation",
    "hash": "",
    "queryParams": {},
    "language": "en",
    "charset": "UTF-8",
    "referrer": "https://google.com/",
    "favicon": "https://example.com/favicon.ico",
    "lastModified": "11/05/2026 00:55:00",
    "spaNavigationDetected": false
  },
  "meta": {
    "description": "Standard meta description provided by the page.",
    "keywords": ["automation", "workflows"],
    "author": "Jane Doe",
    "publisher": "Example Inc.",
    "generator": "Next.js",
    "applicationName": "Example",
    "themeColor": "#0f172a",
    "robots": "index, follow",
    "viewport": "width=device-width, initial-scale=1",
    "allMetaTags": {}
  },
  "openGraph": {
    "title": "Example Website Title",
    "description": "OpenGraph social preview description",
    "image": "https://example.com/og-image.png",
    "type": "article",
    "site_name": "Example"
  },
  "twitterCard": {
    "card": "summary_large_image",
    "title": "Example Website Title",
    "description": "Twitter card description"
  },
  "articleMeta": {},
  "links": {
    "feeds": [
      {
        "title": "RSS Feed",
        "type": "application/rss+xml",
        "href": "https://example.com/feed.xml"
      }
    ],
    "alternateLanguages": []
  },
  "structuredData": [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": "Example Website Title"
    }
  ]
}
```

---

## Legal Disclaimer & Limitation of Liability ("AS IS")

> **IMPORTANT — PLEASE READ CAREFULLY BEFORE USING THIS SOFTWARE:**
>
> This software and all accompanying files, documentation, and materials are provided strictly **"AS IS"** and **"AS AVAILABLE"**, without warranty, representation, or guarantee of any kind, whether express, implied, or statutory, including but not limited to the warranties of merchantability, fitness for a particular purpose, title, accuracy, security, and non-infringement.
>
> **Use at Your Own Risk:** By downloading, installing, modifying, or using this Chrome extension, you acknowledge and agree that you do so entirely at your own risk and discretion. You are solely responsible for ensuring that your use of this software, the webhooks you configure, and any data you transmit or store comply with all applicable local, state, national, and international laws, regulations, privacy policies, and third-party website Terms of Service.
>
> **No Liability:** In no event shall the author (**Solomon Christ**), contributors, or copyright holders be liable for any direct, indirect, incidental, special, exemplary, punitive, or consequential damages (including, without limitation, loss of data, loss of profits, business interruption, account suspension, network restrictions, or legal claims of any kind) arising out of or in any way connected with the use, misuse, or inability to use this software, even if advised of the possibility of such damages.

---

## License

Licensed under the **MIT License** (see the [LICENSE](LICENSE) file for the full license text and "AS IS" warranty disclaimer).
