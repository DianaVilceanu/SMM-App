# Social Media Command Center

A multi-brand social media workspace: content calendar, performance analytics, "What's working / What's not working" pattern detection, content ideas, a monthly plan builder, experiments, trends and reports. Everything is calculated from data you import. Nothing is invented, missing metrics show as unavailable, and small samples are flagged.

**Live app:** https://claude.ai/artifact/VHB6Kf7i6F3DiYzc27xjWV (private; open it in claude.ai while signed in)

## How it runs

- Built with React, Tailwind and Recharts, bundled by Vite into **one self-contained HTML file** and published as a claude.ai Artifact.
- **Storage:** in claude.ai the workspace is saved in the page's own database (one document per brand, post, campaign, import, experiment and trend). Access rules let only the owner and invited Editors read or write it. Outside claude.ai it falls back to the browser's IndexedDB and says so on screen.
- **Navigation** uses the URL hash (`#calendar`, `#brand-<id>`, `#options` for Settings) because hosted pages only support plain hash names.
- **Imports** (CSV/TSV, XLSX, PDF, pasted tables) are parsed in the browser. The PDF reader's worker loads from jsDelivr (`pdfjs-dist`, same pinned version).

## Data integrity rules (enforced in code)

- Metrics are stored as **snapshots** with their source. The latest snapshot counts; snapshots are never summed, so re-importing an export can't double-count.
- Every imported row keeps its **raw source cells**. Manual corrections are logged field by field.
- Imports never overwrite non-empty fields. Uncertain matches wait for your review. Every import can be **reverted** from the import history.
- Patterns need at least 5 posts per group (configurable) and a 20% difference. Findings under 10 posts or from a single month are marked *tentative*.
- Engagement is compared on a **platform-normalised index** (post ER ÷ median ER of the same brand + platform), so platform mix can't fake a pattern.
- Trends from outside your data are only labelled "researched" when they have a source and a check date; otherwise they're hypotheses.
- The demo dataset is synthetic, clearly labelled, and removable in one click.

## Develop

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

## Publish a new version

```bash
npm run build && node scripts/package-artifact.mjs
```

Then publish `publish/command-center.html` to the same Artifact URL with these capabilities:

```json
{ "db": { "rules": [{ "path": "", "read": "admin", "write": "admin" }] }, "downloads": true }
```

## Layout

| Path | What's there |
| --- | --- |
| `src/studio/lib/types.ts` | Data model (brands, posts, metric snapshots, imports, experiments, trends) |
| `src/studio/lib/analytics.ts` | Derived metrics, filters, grouping, normalised index |
| `src/studio/lib/insights.ts` | What's working / not working, own-data trends |
| `src/studio/lib/recommend.ts` | Content ideas and the monthly planner |
| `src/studio/lib/parse.ts`, `mapping.ts`, `importer.ts` | File parsing, column mapping, matching, commit/revert |
| `src/studio/lib/persist.ts` | Database sync (claude.ai) and IndexedDB fallback |
| `src/studio/lib/platform.ts` | File saving and in-page confirm dialogs |
| `src/studio/pages/` | One file per section |
| `src/router.tsx` | Small hash router |
