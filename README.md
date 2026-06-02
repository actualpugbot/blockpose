# BLOCKPOSE

A Minecraft skin posing studio for creator-ready renders. Load a skin by username,
UUID, or PNG upload; pose the model in 3D; tune filters, lighting, backgrounds,
and thumbnail text; then export transparent PNGs, baked scene PNGs, or JPGs up to
4K.

The project is now a modern Vite + React + TypeScript webapp, aligned with the
stack used by `../schematic-editor` while preserving the original Blockpose
posing and compositor engine.

## Quick Start

```bash
pnpm install
pnpm run dev
```

Vite serves the app at the local URL it prints, usually `http://localhost:5173/`.

## Scripts

```bash
pnpm run dev      # start the development server
pnpm run build    # type-check and create a production build in dist/
pnpm run preview  # serve the production build locally
pnpm run build:single  # rebuild the legacy self-contained blockpose.html
```

## Project Structure

```text
blockpose/
├── index.html                 # Vite document shell
├── src/
│   ├── main.tsx               # React entrypoint
│   ├── App.tsx                # React-hosted studio markup
│   ├── styles.css             # App design system and responsive shell
│   ├── legacy-app.js          # Existing posing/export engine, imported by Vite
│   ├── app.js                 # Original standalone app logic reference
│   └── template.html          # Original standalone HTML reference
├── vendor/                    # Original vendored skinview bundle/license
├── dist/                      # Production build output after pnpm run build
└── blockpose.html             # Previous self-contained build artifact
```

## Features

- 3D posable Minecraft skin model powered by `skinview3d` and `three`
- Username/UUID skin loading plus local PNG upload
- Classic/slim model detection with manual override
- Live animations, static pose presets, and manual per-limb rig controls
- Pose save/import/export as JSON
- Filter presets, manual color grading, tint, vignette, and grain
- Transparent, solid, gradient, chroma-key, or image backgrounds
- Lighting controls plus cape/elytra toggles
- YouTube thumbnail composer with model placement and outlined text
- PNG/JPG export up to 4K, including clipboard copy

## Notes

`blockpose.html`, `src/template.html`, `src/app.js`, and `vendor/` are retained as
legacy/reference assets from the original single-file version. The maintained app
entrypoint is now the Vite app in `index.html` and `src/`.

This project bundles and/or depends on `skinview3d` and `three`, both MIT
licensed. Minecraft skin data is fetched from public skin hosts at runtime;
Minecraft is a trademark of Mojang/Microsoft and this project is unaffiliated.
