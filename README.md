# Illustrated Archive

A Vite and Three.js portfolio built around an open, explorable gallery. Portfolio content and spatial placement are stored separately in `src/portfolio.json`; local artwork files live in `public/artworks/`.

## Open the portfolio

On Windows, double-click `open-portfolio.bat`, or run `npm install` once and then `npm run dev`. Open the local address Vite prints. Create a production build with `npm run build`, or preview it with `npm run preview`.

## Curator workspace

The private curator workspace is available at `http://localhost:5173/manage` while the Vite development server is running. The server prints a one-time access token in its terminal on startup. Enter that token in the curator page; it stays in that browser tab's session storage and expires when the dev server restarts.

Curator writes are server-checked and stored in `src/portfolio.json`. Uploaded images are resized to WebP in the browser and saved under `public/artworks/`. The production build excludes the curator interface and its API. This local development workflow is not production authentication: before deploying a live Manage route, connect a real authenticated backend with protected storage and write authorization. Do not publish the Vite dev server or share its token. If using a phone over the LAN, keep the development server and token on a trusted network because the local dev server uses HTTP.

## Project map

- `src/scene.js` builds the Three.js gallery, camera transitions, public interaction, and curator placement controls.
- `src/main.js` handles the archive, stories, commissions, About, and Contact views.
- `src/manage.js` is development-only curator UI, draft editing, undo/redo, preview, and explicit saves.
- `src/portfolio.json` stores artwork content separately from each artwork's placement, plus commission offerings and studio profile.
- `vite.config.js` provides the development-only token-checked storage and image-upload endpoints.
- `src/styles.css` contains the editorial public and responsive curator layouts.
- `public/artworks/` contains the sample illustrations and optimized uploads.

## Commission inquiries

The commission page presents only configured offerings. The demo has no artist email configured, so its inquiry form is intentionally disabled. Add real profile details, commission services, and a verified contact email in `src/portfolio.json` before inviting inquiries. When configured, the form opens the visitor's email app with the brief prefilled; selected reference images stay on their device and need to be attached to the email draft manually.

## Demo deployment

The public portfolio can be deployed as a static Vite build with `npm run build`; the output is in `dist/`. The curator route and local write API are development-only and are not production authentication or storage. Keep Manage local for this demo. Replace the placeholder demo illustrations with authorized artwork and configure accurate artist and contact details before presenting it as a live portfolio.
