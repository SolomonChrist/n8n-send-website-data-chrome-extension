# AI n8n Send Website Data — Chrome Extension

A fast, lightweight Chrome Extension (Manifest V3) that sends **passive, non-scraping website metadata** and your **personal notes/tags** from any open tab directly to an **n8n Workflow Webhook** as structured JSON—while maintaining a complete **local backup history** on your machine.

---

## Key Features

- **One-Click Website Metadata + Notes to n8n**: Click the pinned extension icon on any open tab, add optional notes or tags, and send everything as clean JSON to your n8n Webhook (`POST`). Includes an optional **One-Click Auto-Send** mode in Settings.
- **100% Passive & Zero Bot/Scraping Footprint**:
  - **Zero extra HTTP requests to the website**: Never crawls links, never fetches background pages, and never triggers anti-bot or rate-limit protections.
  - **On-Demand `activeTab` only**: Runs only when you click the extension icon and reads standard `<head>` metadata (`title`, URL, canonical URL, `<meta>` tags, OpenGraph `og:*`, Twitter Card `twitter:*`, RSS/Atom feed links, and public `application/ld+json` Schema.org metadata) plus any text you actively highlighted on the page.
- **Clear Webhook Delivery Status**:
  - Alerts you immediately when your n8n webhook succeeds (`HTTP 200 OK` + response time) or if the webhook is unreachable, offline, or not listening.
  - Includes a **Test Webhook** button in Settings and optional custom Authentication Header support (`Authorization`, `X-API-Key`, etc.).
- **Automatic Local Backup History**:
  - Every send attempt (both `Sent` and `Failed`) is automatically backed up to `chrome.storage.local` on your system.
  - Browse, search, inspect the exact JSON payload, **Resend/Retry** any item to n8n, or **Export** your entire history as a `.json` backup file (`n8n-website-history-backup-YYYY-MM-DD.json`).
  - Includes a **Full-Page History Viewer** (`history.html`) and a **Reset / Delete History** option in Settings protected by an explicit two-step confirmation prompt.

---

## How to Install in Chrome (Load Unpacked)

1. Clone or download this repository to your computer:
   ```bash
   git clone https://github.com/SolomonChrist/n8n-send-website-data-chrome-extension.git
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** (top-left) and select the `ai-n8n-send-website-chrome-extension` folder.
5. Click the **Extensions puzzle icon** in your Chrome toolbar and **Pin** **AI n8n Send Website Data** for one-click access.

---

## Setting Up Your n8n Workflow

1. In **n8n**, add a **Webhook** trigger node to your workflow:
   - **HTTP Method**: `POST`
   - **Path**: e.g. `website-capture`
   - Copy either the **Test URL** (while building) or **Production URL** (when workflow is active).
2. Click the pinned **AI n8n Send Website Data** icon in Chrome and open the **Settings** tab.
3. Paste your **n8n Webhook URL** and click **Save Settings**.
4. Click **Test Webhook** to verify connectivity with n8n.

---

## Example JSON Payload Sent to n8n

```json
{
  "event": "website_capture",
  "source": "ai-n8n-send-website-chrome-extension",
  "sentAt": "2026-10-31T01:00:00.000Z",
  "userNotes": "Great reference for our AI automation pipeline",
  "userTags": ["ai", "n8n", "research"],
  "selectedText": "Optional text highlighted by the user on the page",
  "page": {
    "title": "Example Website Title",
    "url": "https://example.com/articles/automation?utm_source=newsletter",
    "canonicalUrl": "https://example.com/articles/automation",
    "domain": "example.com",
    "origin": "https://example.com",
    "pathname": "/articles/automation",
    "hash": "",
    "queryParams": {
      "utm_source": "newsletter"
    },
    "language": "en",
    "charset": "UTF-8",
    "referrer": "https://google.com/",
    "favicon": "https://example.com/favicon.ico",
    "lastModified": "10/31/2026 00:55:00"
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

## License

MIT License
