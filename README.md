# UltraSweeper for Windows and Linux

A customizable, offline minesweeper with a modern look and a Windows XP-style legacy look,
background music, custom songs and skins, local leaderboards and more.

## Download

Go to **[Releases](../../releases/latest)**, download **UltraSweeper.exe** and double-click it.
That single file is the whole game: no installer, no folder.

- The first launch takes a few seconds while the game unpacks itself.
- If Windows shows "Windows protected your PC", click **More info** → **Run anyway**.
  This appears for downloaded games that aren't code-signed.
- Your stats, settings and songs are saved in `%APPDATA%\Offline Minesweeper`, so they stay
  when you download a newer version.

### Linux (Mint, Ubuntu and similar)

- **Installer:** download **UltraSweeper.deb**, double-click it and click **Install Package**.
  UltraSweeper then appears in the app menu under Games. To update, install a newer `.deb` the same way.
- **Single file:** download **UltraSweeper.AppImage**, right-click it → Properties → Permissions →
  tick **Allow executing file as program**, then double-click it.
- Saved data lives in `~/.config/Offline Minesweeper`.

## Building it yourself

Needs Node.js 20 or newer.

```
npm install
npm run build
```

The exe is written to `dist/UltraSweeper.exe`. On Linux, `npm run build:linux` writes
`dist/UltraSweeper.AppImage` and `dist/UltraSweeper.deb`. The game itself is in `app/`.

## Publishing a new version

1. Update the game in `app/` (on the developer's PC: `npm run sync` copies it from the desktop project).
2. Commit and push.
3. Push a new tag, for example `git tag v1.0.1` then `git push origin v1.0.1`.

GitHub then builds the Windows and Linux versions and publishes them as a new Release automatically.
