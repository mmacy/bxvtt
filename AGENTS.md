# AGENTS.md

bxvtt is a web-based virtual tabletop (VTT) for the 1981 B/X rules. A referee and players share one table in their browsers. [bxapi](https://github.com/mmacy/bxapi) applies every game rule, rolls every die, and stores every game. bxvtt adds the table around it: accounts for the people at the table, real-time sync, the map, chat, and the referee's tools.

Read `docs/architecture.md` before you change anything. It describes the processes, the data each one stores, the permission model, and the protocol between the browser and the server.

## Layout

| Path | Contents |
| --- | --- |
| `packages/shared` | Code that the server and the browser both import: bxapi types (`bxapi/`), the bxvtt protocol (`protocol/`), and text for game events and refusals (`text/`). Import a directory as `@bxvtt/shared/<directory>`. |
| `apps/server` | The bxvtt server: a Fastify application that calls bxapi, stores table data in SQLite, and pushes updates over a WebSocket. |
| `apps/web` | The browser client: React, Vite, and a canvas map renderer. |
| `adventures` | Sample adventure documents that the server offers to every table. |
| `e2e` | Playwright tests that drive a referee and players through a game. |
| `scripts` | Development scripts. |

## Run and verify

bxvtt needs a running bxapi server. `scripts/dev-bxapi.sh` starts one from `~/repos/bxapi` (or `$BXAPI_DIR`) on port 8651 in anonymous mode, with a database under `.data/`:

```sh
npm install
npm run dev:bxapi        # terminal 1: bxapi on http://127.0.0.1:8651
npm run dev              # terminal 2: bxvtt server on :8660, web client on http://localhost:5180
```

The gate is `npm run check`, which runs the type checker, ESLint, Prettier, and the unit tests. Run it before you report work as finished. Fix a finding in the code. Don't add `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or `any` to silence one.

Rules for processes and ports:

- Never stop or restart a process you didn't start. Record the process ID of each server you start, and stop that ID alone. Never stop a process by name.
- Ports 8640 and 5173 belong to the user's other projects. Never use them, and never send a request to the bxapi server on 8640.
- A shared development bxapi listens on 8651. You can create characters and sessions on it freely, but never restart it.
- When your instructions assign you ports, use only those ports for the servers you start.

## Rules for the code

- **Never implement a game rule.** bxapi decides what is legal and what happens. The client offers choices from the player view, the rules catalogs, and the command schemas, and it shows bxapi's refusals when a choice is wrong. If you find yourself computing a to-hit number or checking whether a class can wear armour, stop and find the bxapi field that already states it.
- **A player never receives referee data.** The server sends the referee view, referee events, and adventure documents only to a table member with the referee role. Filter on the server. Never send hidden data to a browser and hide it with CSS or a flag.
- **The browser never calls bxapi.** The bxvtt server holds the bxapi key and is the only caller.
- **Types come from one place.** bxapi types come from `@bxvtt/shared/bxapi`, which `npm run gen:bxapi` generates. Protocol types come from `@bxvtt/shared/protocol`. Don't redeclare either in an app.
- **TypeScript is strict.** No `any`, no non-null assertion on a value that can be missing at run time, no `enum` (use a union of string literals).
- **Validate at the boundary.** The server parses every request body and WebSocket message with a zod schema from `@bxvtt/shared/protocol`.
- **Tests.** Server tests call the HTTP and WebSocket interface against a real bxapi. Pass a `seed` when a test depends on a die roll. Web tests cover logic and components that have behavior. Don't write a test that restates the implementation.
- **Stay in your directories.** When several agents work at once, each one edits only the paths its instructions assign. If you need a change outside them, describe it in your final report instead of making it.
- **Dependencies.** Add one with `npm install -w <workspace> <package>` only when the standard library and the installed packages can't do the job. If the install fails because another install is running, wait and retry.
- **Git.** Don't commit, branch, or stash. The coordinator commits.

## Design

`apps/web/src/ui` contains the design system: tokens, fonts, and the component kit. Use its components and tokens for every screen. Don't add a color, a font size, or a spacing value that isn't a token, and don't add a second button or dialog component. If the kit lacks something you need, add it to the kit when your instructions give you `apps/web/src/ui`, and otherwise build it inside your feature directory from the tokens and report it.

Every interactive element works with the keyboard, has a visible focus state, and has an accessible name.

Give each state one signal. Don't pair a success icon with an error message, and show at most one primary button for the same action on screen. Show status as a `Badge` and choices as buttons, and use a sentence only for something that happened or something that won't work.

## Writing

These rules apply to UI strings, documentation, code comments, and commit messages.

- Invoke the `clauterize` skill before you write prose, and read `~/.claude/skills/clauterize/references/tells.md`. When the skill asks whether to edit in place or rewrite, the answer is to write for the reader.
- Use sentence case for every heading, button, tab, label, and menu item.
- Never use em dashes or en dashes. Use plain declarative sentences, one idea each, in the present tense and active voice. Address the reader as *you*.
- UI text says what happened or why something won't work, in the game's terms. Add the next step only when the player can take it now and the controls on screen don't already show it. An error states the cause, such as "Wren isn't in the front rank, so she can't attack in melee." Never show a raw code, an ID such as `character-0003`, or a stack trace in the main interface.
- Fit the text to the element. A label or tab is one to three words. A badge is one or two words. A disabled reason or a refusal is one sentence, two at most. A hint under a control is one sentence. Longer help belongs in the compendium, not on the play screen.
- Never name the machinery: session, server, preview, declaration (as a noun), cache, feature, handle, or code. Say action, declare, treasure, the round.
- A message about a failure the host has to fix, such as an unreachable server or full storage, names the real parts (the server, the server host, the game service), says what the host does, and says what everyone else does, such as ask the host. Text a player reads during play still never names them.
- Don't explain a rule the player didn't break. A refusal states the cause once and doesn't restate the general rule. Never write a number or limit that bxapi owns, such as a to-hit bonus or a daily limit, unless a bxapi field supplies it. When you leave a number out, describe the choice in the game's terms, such as "Strike a monster that hasn't noticed Wren", and don't stand in for the number with a vague word such as stronger or better.
- Say each fact once, in one element. If a badge, a disabled control, or a row status already shows a state, don't repeat it in a sentence beside it.
- Never use a game verb (Hide, Search, Rest, Turn, Close in) for an interface action. Interface toggles say Collapse, Expand, Close, or Show more.
- The feed narrates in the third person, by character and party. Controls, hints, and reasons address the player as *you*.
- Use the game's vocabulary as B/X does: referee (not GM or DM), party, marching order, caller, turn (10 minutes), round (10 seconds), hit points, armour class.
- Don't hard-wrap Markdown paragraphs.
