# jhfeng.com — 月面漫游

A desktop-first lunar rover experience, served directly at https://jhfeng.com/ through GitHub Pages.

- WASD: drive; mouse drag / wheel: camera; Space: brake; R: reset; Esc: pause.
- Reach the observation point, stop, then return to the lander.
- Automatic quality starts conservatively and adapts to observed frame times.
- Original rocks respond by size: small rocks bounce, medium rocks resist pushing, large rocks remain obstacles.
- A small loading shell loads the scene only on supported desktop-sized, fine-pointer viewports.

## Development

Install dependencies with `npm ci`. Run `npm run check`, `npm run test:moon`, and `npm run build:moon`.

The Moon build bundles `src/moon.js`, versions its asset references, and generates both the root homepage and `/lab/moon/` entry. Serve the repository root with any static HTTP server for local previews.

GitHub Pages publishes `main` at the repository root. `CNAME` retains the custom domain, and `.nojekyll` serves the static assets directly. No server-side renderer, model API, or account is required for visitors. Actual performance depends on the visitor's hardware and browser.

The earlier Orbit experiment remains at `/lab/orbit/`.
