# Lantern

A paper lantern for your Claude Code sessions. Each session is a moth circling the light. When one needs you, it lands on the paper and the lantern turns violet.

<p align="center"><img src="docs/lantern.webp" width="420" alt="The book-page barrel lantern glowing warm with session moths and their PR fireflies around it. One moth lands on the paper and the light turns violet until it is answered and flies back to work."></p>

Unofficial, not affiliated with Anthropic.

## Install

You'll need macOS 13 or later, Claude Code, Node 20.19 or 22.12 or later, and Xcode's command line tools (`xcode-select --install`).

```bash
git clone https://github.com/DaceExMachina/lantern && node lantern/install.js
```

The installer adds a hook for each Claude Code event to `~/.claude/settings.json`, after backing the file up. If Lantern isn't running, the hooks give up within a second, so Claude Code never waits on them. It also builds Lantern.app and the screensaver on your Mac, sets the app to open at login, and adds a Lantern panel to iTerm2's toolbelt if you have iTerm2.

Keep the `lantern` folder around, since the app serves its page from there. You can run the installer again whenever you like. `node lantern/install.js uninstall` takes it all back out.

Want a prebuilt app instead, or help with the iTerm2 panel and screensaver? See [setup](docs/setup.md).

## What you're looking at

Big moths are sessions and small ones are their subagents. The more of them working, the brighter the flame. A moth that needs you lands on the lantern and turns the light violet.

Hover a moth to see what it's doing and what it wants from you. Click it to jump to its terminal tab or Claude app session, or right-click to snooze it (twice puts it to sleep until you wake it). Fireflies are a session's pull requests, coloured by what each one needs once GitHub status is on. The stats panel tells you how your day went, with badges and a daily recap.

The [guide](docs/guide.md) has the rest.

## Works with

Claude Code in iTerm2, Terminal, the Claude desktop app, VS Code and its forks, WezTerm, kitty and Ghostty. [Setup](docs/setup.md#terminals-and-click-to-focus) says what a click does in each.

## Docs

- [Guide](docs/guide.md): what everything on screen means
- [Setup](docs/setup.md): install options, GitHub status, settings and known limits
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing](CONTRIBUTING.md)

## Contributing

Pull requests are welcome, especially for terminals Lantern doesn't know yet. [CONTRIBUTING.md](CONTRIBUTING.md) explains how the code fits together and how to test a change.

## License

MIT. See [LICENSE](LICENSE).
