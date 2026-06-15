# Custom plugins

Custom Claude Code plugins for this project — **one subfolder per plugin**.

A plugin folder typically contains a `.claude-plugin/plugin.json` manifest plus
any of these (each loads differently):

| Folder / file | What it adds | Runs… |
|---|---|---|
| `commands/*.md` | slash commands | on demand (you invoke them) |
| `agents/*.md` | subagents | on demand |
| `skills/<name>/SKILL.md` | skills | on demand |
| `hooks/hooks.json` | hooks | **automatically** on their events |
| `.mcp.json` | MCP servers | **automatically** (tools then callable) |

## This repo is wired to auto-load these

- `/.claude-plugin/marketplace.json` (marketplace **`shape-app-plugins`**) lists the
  plugins in this folder.
- `.claude/settings.json` registers that marketplace (`extraKnownMarketplaces`) and
  enables plugins (`enabledPlugins`), so cloning + **trusting** the repo loads them —
  web sessions included. The marketplace source is the GitHub repo, so it activates
  once these files are on the branch Claude Code fetches (the repo's default branch)
  and the workspace is trusted.

**Sample:** the `hello/` plugin adds a `/hello:greet` command.

**Add your own:**
1. Copy `hello/` → `.claude/plugins/<your-plugin>/` and edit its
   `.claude-plugin/plugin.json` (`name`) + add `commands/` / `skills/` / `hooks/`.
2. Add an entry to `plugins[]` in `/.claude-plugin/marketplace.json`
   (`name` + `"source": "./.claude/plugins/<your-plugin>"`).
3. Enable it in `.claude/settings.json` → `enabledPlugins`:
   `"<your-plugin>@shape-app-plugins": true`.
4. Validate: `claude plugin validate .`
