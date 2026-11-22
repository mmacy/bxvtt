---
title: Credits and licenses
sidebar_label: Credits and licenses
description: Third-party fonts, icons, client and server libraries, Open Game License 1.0a rules attribution, and original bxvtt assets.
sidebar_position: 10
---

# Credits and licenses

bxvtt uses these third-party fonts, icons, open-source libraries, and Open Game Content sources.

## Fonts

All typefaces are self-hosted via `@fontsource-variable` packages so the browser never fetches fonts from third-party origins.

| Font | Role in bxvtt | Copyright | License | Package |
| --- | --- | --- | --- | --- |
| Fraunces | Display headings and wordmark | Copyright 2020 The Fraunces Project Authors ([undercasetype/Fraunces](https://github.com/undercasetype/Fraunces)) | [SIL Open Font License 1.1](https://openfontlicense.org) | `@fontsource-variable/fraunces` |
| Atkinson Hyperlegible Next | Interface copy and stat blocks | Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors ([googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next)) | [SIL Open Font License 1.1](https://openfontlicense.org) | `@fontsource-variable/atkinson-hyperlegible-next` |
| Rokkitt | Numeric displays: dice, ability scores, hit points, armour class, coins, and game clock | Copyright 2016 The Rokkit Project Authors ([googlefonts/RokkittFont](https://github.com/googlefonts/RokkittFont)) | [SIL Open Font License 1.1](https://openfontlicense.org) | `@fontsource-variable/rokkitt` |

## Icons and artwork

| Asset | Role in bxvtt | License | Source |
| --- | --- | --- | --- |
| Lucide icons | Interface controls and standard game icons (sword, axe, bow, shield, doors, potion, scroll, wand, coins, gem, skull, crossed swords, heart, sparkles, footprints, eye, ear, key, map, tent, castle) | [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE), copyright 2026 Lucide Icons and Contributors; Feather-derived icons under MIT License, copyright 2013-present Cole Bemis | `lucide-react` |
| bxvtt game icons | Seven class emblems, mace, dagger, spear, three armour tiers, secret door, stairs, trap, treasure chest, torch, lantern, ring, and `d4`-`d20` icons | Original work for bxvtt under the MIT License | `apps/web/src/ui/icons/gameIcons.tsx` |
| bxvtt dice faces and wordmark | Polyhedral SVG faces in `Die`, the d20 wordmark emblem, and `favicon.svg` | Original work for bxvtt under the MIT License | `apps/web/src/ui/dice/`, `apps/web/src/ui/layout/Wordmark.tsx`, `apps/web/public/favicon.svg` |

## Browser client libraries

Each library below includes its license and copyright notice inside its npm package:

| Library | Role in bxvtt | License | Copyright |
| --- | --- | --- | --- |
| React and React DOM (`react`, `react-dom`) | Component rendering | [MIT License](https://github.com/facebook/react/blob/main/LICENSE) | Meta Platforms, Inc. and affiliates |
| React Router (`react-router-dom`) | Client-side routing | [MIT License](https://github.com/remix-run/react-router/blob/main/LICENSE.md) | React Training LLC 2015-2019 and Remix Software Inc. 2020-2021 |
| Zustand (`zustand`) | Client state stores | [MIT License](https://github.com/pmndrs/zustand/blob/main/LICENSE) | Paul Henschel 2019 |
| Zod (`zod`) | Runtime protocol validation | [MIT License](https://github.com/colinhacks/zod/blob/main/LICENSE) | Colin McDonnell 2025 |
| Radix UI primitives (`radix-ui`) | Accessible dialog, menu, popover, tooltip, tab, select, and slider primitives (styled with bxvtt CSS tokens) | [MIT License](https://github.com/radix-ui/primitives/blob/main/LICENSE) | WorkOS 2022 |

## Server libraries and tunnel tooling

- **Server:** [Fastify](https://github.com/fastify/fastify), `@fastify/static`, and `@fastify/websocket` (MIT License, copyright The Fastify team), plus `zod`.
- **Sharing (`npm run share`):** Uses [`cloudflared`](https://github.com/JacobLinCool/node-cloudflared) (MIT License, copyright 2022 JacobLinCool) to download Cloudflare's official [`cloudflared`](https://github.com/cloudflare/cloudflared) binary (Apache License 2.0, copyright Cloudflare, Inc.) from GitHub Releases. bxvtt does not redistribute the binary.

## Rules content and trademarks

Rules content displayed in the compendium, character wizard, and active sessions is served at runtime by `bxapi`, compiled from the Old-School Essentials System Reference Document via `osrlib` as Open Game Content under the Open Game License 1.0a. Select **Open Game License** in the rules compendium footer to view the full OGL 1.0a text and Section 15 copyright notice returned by `bxapi`.

"Old-School Essentials" and "Necrotic Gnome" are product identity and trademarks of Necrotic Gnome. bxvtt is an independent project, is not affiliated with or endorsed by Necrotic Gnome, and makes no claim of compatibility.

## Sample adventures

*The Drowned Bell* and *The Toll at Crookback Bridge* in `adventures/` are original works written for bxvtt and released under the project's [MIT License](https://github.com/mmacy/bxvtt/blob/main/LICENSE), referencing Open Game Content monsters, spells, and items from `osrlib`.
