# Credits

bxvtt bundles the third-party assets below with the browser client. Add a row whenever you add a font, an icon set, an image, or a sound.

## Fonts

The client self-hosts every font through `@fontsource-variable` packages, so the browser never requests a font from another origin.

| Font | Use in bxvtt | Copyright | License | Package |
| --- | --- | --- | --- | --- |
| Fraunces | Headings and the wordmark | Copyright 2020 The Fraunces Project Authors ([undercasetype/Fraunces](https://github.com/undercasetype/Fraunces)) | [SIL Open Font License 1.1](https://openfontlicense.org) | `@fontsource-variable/fraunces` |
| Atkinson Hyperlegible Next | Interface text and stat blocks | Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors ([googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next)) | [SIL Open Font License 1.1](https://openfontlicense.org) | `@fontsource-variable/atkinson-hyperlegible-next` |
| Rokkitt | Numbers: dice, ability scores, hit points, and the game clock | Copyright 2016 The Rokkitt Project Authors ([googlefonts/RokkittFont](https://github.com/googlefonts/RokkittFont)) | [SIL Open Font License 1.1](https://openfontlicense.org) | `@fontsource-variable/rokkitt` |

## Icons

| Asset | Use in bxvtt | License | Source |
| --- | --- | --- | --- |
| Lucide icons | Interface icons, and the game icons that Lucide already draws (sword, axe, bow, shield, doors, potion, scroll, wand, coins, gem, skull, crossed swords, heart, sparkles, footprints, eye, ear, key, map, tent, castle) | [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE), copyright Lucide Contributors, with portions copyright Cole Bemis under the MIT License (Feather) | `lucide-react` |
| bxvtt game icons | The seven class icons, mace, dagger, spear, the three armour icons, secret door, stairs, trap, treasure chest, torch, lantern, ring, and the d4 to d20 dice icons | Original work for bxvtt, under the project's license | `apps/web/src/ui/icons/gameIcons.tsx` |
| bxvtt dice faces and wordmark | The `Die` component's polyhedral faces, the d20 mark, and `favicon.svg` | Original work for bxvtt, under the project's license | `apps/web/src/ui/dice/`, `apps/web/src/ui/layout/Wordmark.tsx`, `apps/web/public/favicon.svg` |

## Libraries with bundled styles or behavior

| Library | Use in bxvtt | License |
| --- | --- | --- |
| Radix UI primitives (`radix-ui`) | Accessible behavior for dialogs, menus, popovers, tooltips, tabs, selects, sliders, and other kit components. bxvtt supplies all styling. | [MIT License](https://github.com/radix-ui/primitives/blob/main/LICENSE), copyright WorkOS |
