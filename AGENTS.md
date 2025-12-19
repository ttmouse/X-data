# Repository Guidelines

## Project Structure & Module Organization
- `chrome-extension/` holds all extension sources: `manifest.json` and the scripts (`background.js`, `content.js`, `popup.js`) plus UI assets (`popup.html`, `style.css`, `icons/`).  
- `content.js` scrapes tweets, injects the sidebar iframe, and persists data via `chrome.storage.local`.  
- `popup.js` drives the popup/sidebar UI, rendering cached tweets and wiring controls.  
- Keep new assets under `chrome-extension/` so they remain web‑accessible via `chrome.runtime.getURL`.

## Build, Test, and Development Commands
- Load the extension unpacked in Chrome: `chrome://extensions` → Enable *Developer mode* → *Load unpacked* → select `chrome-extension/`. Reload here after code changes.  
- For quick validation of script syntax, run `node --check chrome-extension/content.js`. Repeat for other JS files if edited.

## Coding Style & Naming Conventions
- JavaScript is ES2020+, 2-space indentation, `const`/`let` only.  
- Use descriptive camelCase for variables/functions (`scrapeCurrentView`, `toggleSidebarBtn`).  
- Prefer template literals for DOM snippets and keep inline comments brief.  
- When touching HTML/CSS, keep class names kebab-case and align with existing BEM-lite structure.

## Testing Guidelines
- Manual verification is primary: reload the extension, trigger `Scrape Current View`, confirm the sidebar shows counts/dates, and run auto-scroll on a live analytics page.  
- For parser tweaks, log to DevTools (`console.log('X Data Scraper:', …)`) and inspect `chrome.storage.local` to ensure cached tweets contain the expected fields.  
- Snapshot any DOM selectors you rely on inside comments to ease future maintenance.

## Commit & Pull Request Guidelines
- Follow the existing concise style: imperative subject lines (`Add robust timestamp parser`, `Fix sidebar iframe append`).  
- Include context in the body when a change alters scraping behavior or UX.  
- Pull requests should describe the feature/fix, list manual verification steps (e.g., “Reloaded extension and scraped @handle feed”), and attach screenshots/GIFs for UI adjustments.

## Security & Configuration Tips
- Never ship secrets; the extension only interacts with public X pages.  
- Keep permissions minimal (currently `activeTab`, `scripting`, `storage`). If you add APIs, justify them in `manifest.json` comments and PR notes.  
- Test against both `https://x.com` and `https://twitter.com` since the manifest covers both.
