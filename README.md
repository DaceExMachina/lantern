# Lantern

A paper lantern that glows with your Claude Code sessions. Each session is a moth, and when one needs you, it lands on the lantern and the light turns violet.

<p align="center"><img src="docs/lantern.png" width="420" alt="The book-page barrel lantern fully lit, with five session moths and their subagents circling it, a blue bookmark ribbon trailing below, and specks of dust in its glow"></p>

Unofficial, not affiliated with Anthropic.

## Install

You need macOS 13 or later, Claude Code, Node 18 or later, and Xcode's command line tools (`xcode-select --install`) to build the app.

```bash
git clone https://github.com/DaceExMachina/lantern && node lantern/install.js
```

The installer:

- adds a quiet hook per Claude Code event to `~/.claude/settings.json` (it backs the file up first). If Lantern isn't running, the hooks give up after a second, so Claude Code never waits.
- builds Lantern.app and the screensaver on your Mac, and sets the app to open at login.
- adds a Lantern panel to iTerm2's toolbelt, if you have iTerm2.

Keep the `lantern` folder: the app serves its page from there. Running the installer again is safe. To remove everything, run `node lantern/install.js uninstall`.

Rather download a prebuilt app, or want to set up the iTerm2 panel and screensaver? See [docs/setup.md](docs/setup.md).

## What you're looking at

- **Big moths are sessions**, small ones are their subagents. The more are working, the brighter the flame.
- **A moth that needs you lands** on the lantern, and the light turns violet.
- **Hover a moth** for what it's doing and what it needs from you. Click it to jump to its terminal tab or Claude app session. Right-click to snooze it.
- **Fireflies are a session's pull requests**, coloured by what each one needs once GitHub status is on.
- **Stats** shows how your day went, with goals, badges and a daily recap.

The [guide](docs/guide.md) covers everything else.

## Works with

Claude Code in iTerm2, Terminal, the Claude desktop app, VS Code and its forks, WezTerm, kitty and Ghostty. See [setup](docs/setup.md#terminals-and-click-to-focus) for what a click does in each.

## Docs

- [Guide](docs/guide.md): what everything on screen means
- [Setup](docs/setup.md): install options, GitHub status, settings and known limits
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing](CONTRIBUTING.md)

## Contributing

Pull requests are welcome, especially for terminals Lantern doesn't know yet. [CONTRIBUTING.md](CONTRIBUTING.md) explains how the code fits together and how to test a change.

## License

MIT. See [LICENSE](LICENSE).
