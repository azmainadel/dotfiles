# dotfiles

Personal dotfiles for macOS — Zsh (Oh My Zsh + Powerlevel10k), Ghostty, nano, and [pi](https://github.com/badlogic/pi-mono) extensions.

## Install

This repo uses a bare repository at `~/.dotfiles` as the source of truth for files in `$HOME`.

```sh
git clone --bare https://github.com/azmainadel/dotfiles.git ~/.dotfiles
alias dotfiles='git --git-dir=$HOME/.dotfiles --work-tree=$HOME'

dotfiles checkout          # list available dotfiles
dotfiles checkout .zshrc   # copy one into your home directory
```

Then manage changes with the same alias: `dotfiles status` / `add` / `commit` / `pull` / `push`.

## Contents

| Path | Purpose |
| --- | --- |
| `.zshrc` | Zsh config, aliases, plugins, `ports` helper |
| `.zshenv` / `.zprofile` | Loads nvm / Homebrew |
| `.p10k.zsh` | Powerlevel10k prompt config |
| `.gitconfig` | Git defaults (nano editor, `main`, rebase on pull) |
| `.ghostty/config` | Ghostty theme, font, keybindings |
| `.nano/` | Syntax highlighting (from [`scopatz/nanorc`](https://github.com/scopatz/nanorc)) |
| `.pi/agent/extensions/` | pi extensions |

## Customize

```sh
p10k configure          # regenerate the prompt
sh ~/.nano/install.sh   # update nano syntax files
```

> Requires Oh My Zsh, Powerlevel10k, zsh-autosuggestions, zsh-syntax-highlighting, and Ghostty. Paths are macOS-specific.