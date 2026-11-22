# Credits

bxvtt uses the third-party assets, libraries, and content below. Add a row whenever you add a font, an icon set, an image, a sound, or a library that ships to the browser.

## Fonts

The client self-hosts every font through `@fontsource-variable` packages, so the browser never requests a font from another origin.

| Font | Use in bxvtt | Copyright | License | Package |
| --- | --- | --- | --- | --- |
| Fraunces | Headings and the wordmark | Copyright 2020 The Fraunces Project Authors ([undercasetype/Fraunces](https://github.com/undercasetype/Fraunces)) | [SIL Open Font License 1.1](https://openfontlicense.org) | `@fontsource-variable/fraunces` |
| Atkinson Hyperlegible Next | Interface text and stat blocks | Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors ([googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next)) | [SIL Open Font License 1.1](https://openfontlicense.org) | `@fontsource-variable/atkinson-hyperlegible-next` |
| Rokkitt | Numbers: dice, ability scores, hit points, and the game clock | Copyright 2016 The Rokkit Project Authors ([googlefonts/RokkittFont](https://github.com/googlefonts/RokkittFont)) | [SIL Open Font License 1.1](https://openfontlicense.org) | `@fontsource-variable/rokkitt` |

## Icons

| Asset | Use in bxvtt | License | Source |
| --- | --- | --- | --- |
| Lucide icons | Interface icons, and the game icons that Lucide already draws (sword, axe, bow, shield, doors, potion, scroll, wand, coins, gem, skull, crossed swords, heart, sparkles, footprints, eye, ear, key, map, tent, castle) | [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE), copyright 2026 Lucide Icons and Contributors, with the icons that derive from Feather under the MIT License, copyright 2013-present Cole Bemis | `lucide-react` |
| bxvtt game icons | The seven class icons, mace, dagger, spear, the three armour icons, secret door, stairs, trap, treasure chest, torch, lantern, ring, and the d4 to d20 dice icons | Original work for bxvtt, under the project's license | `apps/web/src/ui/icons/gameIcons.tsx` |
| bxvtt dice faces and wordmark | The `Die` component's polyhedral faces, the d20 mark, and `favicon.svg` | Original work for bxvtt, under the project's license | `apps/web/src/ui/dice/`, `apps/web/src/ui/layout/Wordmark.tsx`, `apps/web/public/favicon.svg` |

## Libraries in the browser client

The client bundle contains these libraries. Each one ships its license and copyright notice in its package.

| Library | Use in bxvtt | License | Copyright |
| --- | --- | --- | --- |
| React and React DOM (`react`, `react-dom`) | The user interface. | [MIT License](https://github.com/facebook/react/blob/main/LICENSE) | Meta Platforms, Inc. and affiliates |
| React Router (`react-router-dom`) | Routing between the home page, the lobby, and the play screen. | [MIT License](https://github.com/remix-run/react-router/blob/main/LICENSE.md) | React Training LLC 2015-2019 and Remix Software Inc. 2020-2021 |
| Zustand (`zustand`) | Client state. | [MIT License](https://github.com/pmndrs/zustand/blob/main/LICENSE) | Paul Henschel 2019 |
| Zod (`zod`) | Validation of every message between the browser and the server. | [MIT License](https://github.com/colinhacks/zod/blob/main/LICENSE) | Colin McDonnell 2025 |
| Radix UI primitives (`radix-ui`) | Accessible behavior for dialogs, menus, popovers, tooltips, tabs, selects, sliders, and other kit components. bxvtt supplies all styling. | [MIT License](https://github.com/radix-ui/primitives/blob/main/LICENSE) | WorkOS 2022 |

## Libraries in the server

The server runs [Fastify](https://github.com/fastify/fastify), `@fastify/static`, and `@fastify/websocket`, which use the MIT License and are copyright The Fastify team, and Zod. The server serves no third-party assets to the browser.

## Tools for sharing

`npm run share` uses the [`cloudflared`](https://github.com/JacobLinCool/node-cloudflared) npm package (MIT License, copyright 2022 JacobLinCool), which downloads Cloudflare's official [`cloudflared`](https://github.com/cloudflare/cloudflared) program (Apache License 2.0, copyright Cloudflare, Inc.) from its GitHub releases. bxvtt doesn't redistribute the program.

## Rules content

The rules content in the rules compendium, in character creation, and in every game comes from bxapi, which compiles it from the Old-School Essentials System Reference Document by way of osrlib. It is Open Game Content under the Open Game License 1.0a. bxvtt doesn't store or copy it. The compendium's **Open Game License** link shows the license text and the Section 15 copyright notice that bxapi serves.

"Old-School Essentials" and "Necrotic Gnome" are product identity of Necrotic Gnome. bxvtt is an independent project, isn't affiliated with or endorsed by Necrotic Gnome, and makes no claim of compatibility.

## Sample adventures

The two adventures in `adventures/` are original work for bxvtt, under the project's license. They use the monsters, spells, and items of the rules content above.
