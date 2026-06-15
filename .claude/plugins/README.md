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

## Important: a folder here does NOT auto-load

Dropping a plugin in this folder doesn't make Claude Code use it. To enable it:

- Register a **marketplace** — a `.claude-plugin/marketplace.json` that lists the
  plugins — then `/plugin install <name>@<marketplace>` from your client, **or**
- Add project-scope plugin config to **`.claude/settings.json`** so it travels
  with the repo into every session (including Claude Code web sessions).

Ask Claude to scaffold a working sample plugin + a `marketplace.json` and wire it
into `.claude/settings.json` if you want it to load automatically.
