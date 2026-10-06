# Vendored Bear Tavern tools

Source: Bear Tavern character-sheet and text-APNG tools, vendored on 2026-10-06.

Included tools: `tools/tavern-character-sheet`, `tools/text-apng-maker`, their shared brand/language/bridge/APNG client dependencies, mark SVG, and Chinese font notes. This is a selected dependency copy, not the entire source website.

Local adaptations:

- `assets/tabletop-host.css` integrates the original tools into the warm tabletop workspace and hides links to uncopied portal pages.
- Embedded character mode uses a same-origin, versioned parent message bridge and keeps edits in memory until the host saves them. Original standalone local-storage and backend flows are skipped in embedded mode.
- Character portraits accept canonical `/api/resources/<sha256>` references. Host save uploads inline images once; standalone card/backup exports resolve those references back to portable inline data.
- Portrait upload uses the original model's 1 MB limit consistently.
- The APNG tool's analytics script is removed. Its encoder, effects and SDK remain the original implementations.
- Iframe entry URLs explicitly include `index.html`; the host iframe allows forms because the original creation wizard submits a form.

The host has adapted validation engines at `src/vendor/tavern-character/{model,universal}.js`. Those copies drop CommonJS/Node crypto fallbacks for browser bundling; browser and Node 24 provide global crypto. When syncing tools, keep portrait validation in both model copies aligned and retain the embedded message bridge, portable image export and host stylesheet adaptations.

Integration contract and data limits: `docs/architecture/TAVERN_TOOLS_INTEGRATION.md` at the project root.
