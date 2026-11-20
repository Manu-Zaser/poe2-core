# @poe2/core

Shared building blocks for the Path of Exile 2 tools in this workspace
([PoE2 Price Check](https://github.com/Manu-Zaser/poe2-price-check) and the PoE2 Build Companion), and the base for a
later multitool.

> This product isn't affiliated with or endorsed by Grinding Gear Games in any way.

## Modules

Each module is imported on its own, so browser code never pulls in Windows or Electron code by accident.

| Import | What it does | Runs in |
|---|---|---|
| `@poe2/core/item` | Parses copied item text: header, sections, mod lines, tiers and prefix/suffix from the advanced copy (Ctrl+Alt+C) | anywhere (pure) |
| `@poe2/core/hotkey` | Hotkey recorder helpers: key event → Electron accelerator, validation, key cap labels | anywhere (pure) |
| `@poe2/core/clipboard` | `readItemText()`: sends exactly **one** Ctrl+Alt+C when the game is in front, waits for the text, restores the clipboard | Electron main |
| `@poe2/core/win32` | Win32 via koffi: send the copy keystroke, foreground window title/handle, bring a window to the front | Electron main |
| `@poe2/core/trade` | Trade site client (`/api/trade2` search and fetch) with a rate limiter that follows the limits GGG reports; anonymous, no login | anywhere with `fetch` |
| `@poe2/core/ninja` | poe.ninja exchange rates (Divine ↔ Exalted and other currency) and the current leagues | anywhere with `fetch` |
| `@poe2/core/prices` | poe.ninja price index: every exchange item (currency, runes, omens …) and unique of a league with icon and 7-day trend, plus a check of all trade pairs – if they disagree by more than 3×, the lower price is used with a warning | anywhere with `fetch` |
| `@poe2/core/log` | `createLogger({ fileName })`: log file in the app's user data folder with size rotation, console in development | Electron main |

## GGG rules

The core keeps the rules the tools follow: one game action per key press (a single item copy), the clipboard is
read once per key press, no memory reading, no client modification.

## Using it in a tool

The tools reference the core by path and bundle its TypeScript sources with esbuild – there is no separate build step:

```bash
npm install -D ../core
```

`electron` and `koffi` are peer dependencies and come from the tool itself. Add the core as a **dev** dependency so
electron-builder does not try to ship it next to the bundle.

## Development

```bash
npm install
npm test          # vitest
npm run typecheck # tsc
```
