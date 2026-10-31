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
