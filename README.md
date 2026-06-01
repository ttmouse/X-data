# X Data Scraper

X Data Scraper is a local-first Chrome extension for collecting, organizing, searching, and exporting posts from X/Twitter.

It is designed for researchers, product managers, creators, AI builders, and knowledge workers who need to turn scattered social content into structured datasets for research, content analysis, prompt engineering, and personal knowledge workflows.

## Why this project matters

Modern AI workflows increasingly depend on high-quality context. Useful social content is often scattered across timelines, bookmarks, search results, lists, and account analytics pages. X Data Scraper helps users collect this information locally, preserve context, and export it for downstream analysis without relying on a centralized backend.

The project explores a practical pattern for AI-era personal tools: small, transparent, local-first software that helps individuals build their own research and knowledge datasets.

## Key features

- Collect posts from X/Twitter timelines, search results, bookmarks, lists, account analytics pages, and the current page view
- Auto-scroll pages and incrementally capture loaded posts
- Add individual posts quickly from the post action area
- Store collected data locally in the browser
- Search, filter, and manage collected posts from a sidebar interface
- Export collected data for research and AI-assisted analysis
- Copy collected links for downstream workflows
- Support Chinese and English interface usage
- Built as a transparent open-source Chrome extension

## Typical use cases

- Content research: collect examples, hooks, formats, and references from X/Twitter
- Product research: save public posts related to users, markets, competitors, and trends
- AI workflows: turn collected posts into structured input for summarization, tagging, clustering, and prompt engineering
- Personal knowledge management: preserve useful social content before it disappears in the feed
- Creator workflows: build a searchable reference library from public social content

## Installation

### Install in Chrome developer mode

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `chrome-extension` folder in this repository.
6. Pin **X Data Scraper** from the Chrome toolbar if needed.

## Usage

1. Open a supported X/Twitter page, such as a timeline, search result, bookmark page, list, or account analytics page.
2. Click the X Data Scraper extension icon.
3. Use the sidebar actions:
   - **Scrape Current View**: collect posts currently visible on the page
   - **Start Auto Scroll**: keep scrolling and capture more posts incrementally
   - **Stop Scroll**: stop the auto-scroll process
   - **Clear Data**: clear locally cached data
4. Review, search, filter, export, or copy the collected data from the sidebar.

## Project structure

```text
chrome-extension/
├── manifest.json      # Chrome extension manifest
├── background.js      # Background service worker
├── content.js         # Content script for page extraction and interaction
├── popup.html         # Sidebar interface
├── popup.js           # Sidebar logic and data operations
├── style.css          # Extension UI styles
└── icons/             # Extension icons
    ├── icon-16.png
    ├── icon-32.png
    └── icon-128.png
```

## Architecture

### Content script

`content.js` runs on supported X/Twitter pages. It identifies post elements in the page DOM, extracts available post metadata, handles incremental capture, and communicates with the extension UI.

### Sidebar interface

`popup.html` and `popup.js` provide the user interface for capture actions, data review, search, filtering, export, and link-copying workflows.

### Local storage

The extension uses Chrome local storage for persistence. Data is stored in the user's browser and is not uploaded to a hosted backend by this project.

## Data and privacy model

X Data Scraper is local-first:

- Collected data is stored in the user's browser storage.
- The project does not run a hosted scraping service.
- The project does not provide a centralized user database.
- Users remain responsible for how they collect, process, export, and use data.

## Responsible use

This project is intended for lawful personal research, content organization, and knowledge management. Users are responsible for complying with the terms of service of the platforms they access and with applicable laws.

Do not use this project for spam, harassment, credential collection, privacy-invasive monitoring, or any activity that violates platform rules or applicable law.

## Roadmap

- Improve structured export formats for AI-assisted analysis
- Add clearer dataset schemas for downstream workflows
- Improve duplicate detection and incremental update logic
- Add better documentation for extension permissions
- Add automated checks for packaging and release readiness
- Improve contributor onboarding and issue templates

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes, report issues, and submit pull requests.

## Security

If you discover a security issue or a privacy-sensitive bug, please see [SECURITY.md](SECURITY.md) before opening a public issue.

## License

This project is released under the MIT License. See [LICENSE](LICENSE) for details.

## Maintainer

Maintained by [ttmouse](https://github.com/ttmouse).

---

## 中文简介

X Data Scraper 是一个本地优先的 Chrome 扩展，用于从 X/Twitter 页面采集、整理、搜索和导出公开内容。

它更适合研究者、产品经理、创作者、AI 工具使用者和知识工作者，把分散在时间线、搜索结果、书签、列表和账号分析页里的内容，整理成可继续分析和复用的数据集。

项目的核心定位不是“批量爬虫服务”，而是一个透明、开源、本地存储的个人研究与知识整理工具。