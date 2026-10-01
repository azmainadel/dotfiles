# dotfiles

Personal dotfiles for macOS — a Zsh shell setup (Oh My Zsh + Powerlevel10k), a Ghostty terminal theme, a nano config with syntax highlighting, and some [pi](https://github.com/badlogic/pi-mono) agent extensions.

## What's in here

| Path | Purpose |
| --- | --- |
| `.zshrc` | Zsh config: Oh My Zsh, Powerlevel10k prompt, plugins, aliases, helper functions. |
| `.zshenv` | Loads nvm (Node version manager). |
| `.zprofile` | Loads Homebrew's shell environment. |
| `.p10k.zsh` | Powerlevel10k prompt configuration (generated via `p10k configure`). |
| `.gitconfig` | Git defaults: `nano` as editor, `main` as default branch, pull with rebase. |
| `.ghostty/config` | Ghostty terminal: theme, font (JetBrains Mono), keybindings, window behavior. |
| `.nano/` | nano config with syntax highlighting for many languages, plus a local copy of [`scopatz/nanorc`](https://github.com/scopatz/nanorc). |
| `.pi/agent/extensions/` | Custom [pi](https://github.com/badlogic/pi-mono) agent extensions. |

## Prerequisites

Before installing, make sure you have:

- **zsh** (the default shell on macOS)
- **[Oh My Zsh](https://github.com/ohmyzsh/ohmyzsh)**
- **[Powerlevel10k](https://github.com/romkatv/powerlevel10k)**
- **[zsh-autosuggestions](https://github.com/zsh-users/zsh-autosuggestions)** and **[zsh-syntax-highlighting](https://github.com/zsh-users/zsh-syntax-highlighting)** (Oh My Zsh plugins)
- **[Ghostty](https://ghostty.org)** (for the terminal config)
- **[nvm](https://github.com/nvm-sh/nvm)**
- **[thefuck](https://github.com/sobolevn/thefuck)** (optional, used in `.zshrc`)
- **Homebrew** (used in `.zprofile`)

## Install

This repo uses the **bare repository** pattern: the Git repo lives at `~/.dotfiles` and is used as the source of truth for files in your home directory.

```sh
# Clone the repo into a bare repo at ~/.dotfiles
git clone --bare https://github.com/azmainadel/dotfiles.git ~/.dotfiles

# Make the bare repo manage files in your home directory
alias dotfiles='git --git-dir=$HOME/.dotfiles --work-tree=$HOME'

# List available dotfiles in the repo
dotfiles checkout

# Check out (copy) a dotfile into your home directory, e.g. .zshrc
dotfiles checkout .zshrc
```

Afterward you can manage your dotfiles with the `dotfiles` alias:

```sh
dotfiles status              # see changes to your dotfiles
dotfiles add .zshrc          # stage a change
dotfiles commit -m "..."     # commit a change
dotfiles push                # push to GitHub
dotfiles pull                # pull the latest
```

> **Note:** These dotfiles reference macOS-specific paths (e.g. Homebrew at `/opt/homebrew`) and a hardcoded pnpm path. Adjust to match your machine.

## Shell features

A few things `.zshrc` sets up beyond the defaults:

- **Powerlevel10k instant prompt** for a fast, flicker-free prompt on startup.
- **Cached completion** (`compinit -C`) for quicker shell startup.
- **`thefuck`** integration — corrects mistyped commands.
- **`ports` function** — lists listening TCP ports with the PID, command, and working directory of each process (great for "what's running on :3000?").
- Handy aliases:
  - `zconf` → edit `~/.zshrc` in nano
  - `dotfiles` → manage this dotfiles repo
  - `python` → `python3`, `hm` → `cd ~`, `c` → `clear`, `x` → `exit`, `ls` → detailed colored listing

## Customize the prompt

The prompt is configured in `.p10k.zsh`. To regenerate it interactively:

```sh
p10k configure
```

## nano syntax highlighting

`.nano/` contains a large set of syntax-highlighting definitions sourced from
[`scopatz/nanorc`](https://github.com/scopatz/nanorc), pulled in via `include`
lines in `.nano/nanorc`. To refresh them to the latest upstream version:

```sh
sh ~/.nano/install.sh
```

## pi agent extensions

`.pi/agent/extensions/` contains a couple of custom extensions for the
[pi](https://github.com/badlogic/pi-mono) coding agent:

- `hide-footer.ts` — hides the TUI footer bar.
- `pi-emote/` — configures the "emote" display (uses the `xyntherys` emote set).

## License

Feel free to use and adapt these dotfiles however you like.