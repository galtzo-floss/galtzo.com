# AGENTS.md — AI Agent Operating Instructions

## ⚠️ Critical: Terminal Output Is Never Visible in the Tool Response

The `run_in_terminal` tool **never shows output in its return value**, even when it appears to.
Any output text shown in the tool result is unreliable and must be treated as absent.

**You MUST always redirect both STDOUT and STDERR to a file in `tmp/`, using `tee`**
so the user can also see the output in their terminal, and then read the file back
with the `read_file` tool.

### Standard Pattern for ALL Terminal Commands

```bash
<your command> 2>&1 | tee tmp/<descriptive_name>.txt
```

Then immediately follow with a `read_file` call:

```
read_file("tmp/<descriptive_name>.txt", startLine: 1, endLine: 100)
```

### Examples

```bash
# Ruby script
ruby scripts/my_script.rb 2>&1 | tee tmp/my_script_output.txt

# Count things in a YAML file
ruby -r yaml -e '...' 2>&1 | tee tmp/yaml_count.txt

# Bundle / gem commands
bundle exec rake 2>&1 | tee tmp/rake_output.txt

# Git commands
git status 2>&1 | tee tmp/git_status.txt

# Multi-step: chain and tee at the end
(cd /some/dir && command1 && command2) 2>&1 | tee tmp/result.txt
```

### Rules

1. **Never** run a command without `2>&1 | tee tmp/<name>.txt`.
2. **Always** call `read_file` on the tee'd file immediately after the terminal call.
3. **Never** assume a command succeeded or produced specific output — always read the file.
4. **Never** make decisions based on the (unreliable) inline tool response text.
5. Use descriptive filenames in `tmp/` so multiple outputs don't collide (e.g., `tmp/rubygems_discover.txt`, `tmp/projects_count.txt`).
6. The `tmp/` directory already exists in this repo (see `tmp/pids/`); files written there are gitignored.

## Project Context

- **Framework**: Bridgetown (Ruby static site generator)
- **Key data file**: `src/_data/projects.yml` — list of all projects shown on the site
- **Dev data file**: `src/_data/projects_dev.yml` — must exist or `scripts/update_projects` aborts
- **Update script**: `scripts/update_projects` — fetches live stats from GitHub, GitLab, RubyGems APIs
- **Swap script**: `scripts/devswap` — swaps prod/dev projects.yml files; must be run in pairs

### projects.yml Entry Count (as of 2026-02-24)

- Total YAML entries: 126 (person entry moved to `person.yml`)
- Ruby+rubygems project entries: ~100
- RubyGems.org gems owned by pboling: 114
- **Gap: 17 gems missing from projects.yml** (ast-merge, bash-merge, commonmarker-merge,
  dotenv-merge, json-merge, jsonc-merge, markdown-merge, markly-merge, prism-merge,
  psych-merge, rbs-merge, token-resolver, toml-merge, tree_haver, yaml-converter,
  yard-fence, yard-yaml)
- 4 entries in projects.yml not owned by pboling on RubyGems.org (intentional):
  awesome-sponsorships, masq, os, resque

### scripts/update_projects — key behaviour

- **RubyGems discovery runs by default only on a bare full update** (no subcommand,
  no surgical field). Passing a surgical field or `add_project` disables discovery
  automatically. Pass `--no-discover` to suppress it explicitly on a bare update.
- Pass `-y` or `--no-tty` to auto-accept all confirmation prompts (non-interactive / CI).
- The old `--discover-rubygems` flag no longer exists.
- After adding a gem during discovery, output reads:
    ```
    💾 Saved to projects.yml
    🔄 Synced to projects_dev.yml
    ```

### scripts/update_projects — subcommands and surgical fields

| Invocation | Discovery | Description |
|---|---|---|
| `ruby scripts/update_projects` | ✅ on | Full update, interactive |
| `ruby scripts/update_projects -y` | ✅ on | Full update, non-interactive |
| `ruby scripts/update_projects --no-discover` | ❌ off | Full update, skip discovery |
| `ruby scripts/update_projects <field> [field ...]` | ❌ off | Surgical: one or more fields |
| `ruby scripts/update_projects add_project` | ❌ off | Wizard: add a single project |

Multiple surgical fields can be combined in one invocation:
```bash
ruby scripts/update_projects total_downloads daily_downloads release_downloads
ruby scripts/update_projects github_stars gitlab_stars codeberg_stars
```

**`add_project`** supports any ecosystem: `rubygems`, `cargo`, `npm`, `pypi`, `go`, `none`.
All flags are optional — omitted values are prompted interactively.
Flags: `--name`, `--ecosystem`, `--language`, `--role`, `--github-url`,
`--gitlab-url`, `--codeberg-url`, `--description`, `--minimum-version`, `--tags`.



## Workspace Layout

```
galtzo.com/
  src/_data/projects.yml       # production project list (no person entry)
  src/_data/projects_dev.yml   # dev/test project list (must exist; no person entry)
  src/_data/person.yml         # single person/author entry (rendered as the first card)
  src/_data/families.yml       # family metadata: id, name, position (global order)
  scripts/update_projects      # main data refresh script (read-write, makes API calls)
  scripts/project_query        # read-only query/audit/console script (no API calls)
  scripts/analyze_tags         # read-only analysis + optional tag merge/rename script
  scripts/manage_families      # interactive TUI for managing project families
  scripts/devswap              # swaps prod<->dev data files
  tmp/                         # safe scratch space for tee output files
  tmp/project_query_console.rb # auto-generated by `project_query console` — safe to delete
```

### projects.yml conventions

- `ecosystem: none` — explicit sentinel meaning "this project has no package registry". Distinct from a missing/nil `ecosystem`, which triggers a `ruby_missing_ecosystem` data-quality warning in `project_query needs-attention`.
- `ecosystem: nil` (absent) — data quality issue; should be set to a real ecosystem or `none`.
- `funding_sites: []` — valid empty list (external/contributed projects). `funding_sites: nil` / absent is a bug — `index.html` raises on it.
- `minimum_version` — must always be a quoted string (e.g. `"2.7"`, not `2.7`). `save_yaml` in `update_projects` enforces this automatically.
- `family_id` — references an `id` in `families.yml`. Project entries carry `theme: family`, `family_id`, `family_position` (within-family display order, 1-based integer). The position-1 card gets the family count badge. `family_name` is **not** stored on project entries — it lives in `families.yml`.

Read-only by default; writes only when `--interactive` (with confirmation) or `--apply` is used.

### scripts/manage_families — interactive family TUI

Interactive. Reads + writes `projects.yml`, `projects_dev.yml`, and `families.yml` on exit.
Always run via `bundle exec`.

```bash
bundle exec ruby scripts/manage_families           # full TUI
bundle exec ruby scripts/manage_families --dry-run # preview saves only
```

**Data model:** Family metadata (name, global display order) lives exclusively in
`src/_data/families.yml`. Project entries in `projects.yml` carry:
`theme: family`, `family_id`, `family_position` (within-family display order).
The position-1 card automatically gets the family count badge.

Main menu: scroll/filter to select a family, `U` for unassigned projects,
`N` to create a new family, `Q` to save and exit.
Per-family actions (via `expand` prompt — type the key letter):
`r` reorder members (pick member, pick destination, list re-renders, repeat until done),
`m` remove a member, `a` add unassigned project, `p` reposition this family among all
families, `d` delete family, `b` back.
Family fields written to projects: `theme`, `family_id`, `family_position`.

```bash
bundle exec ruby scripts/analyze_tags                    # full report
bundle exec ruby scripts/analyze_tags --interactive      # guided merge wizard
bundle exec ruby scripts/analyze_tags --interactive -y   # apply all suggestions non-interactively
bundle exec ruby scripts/analyze_tags --interactive -y --dry-run  # preview only
bundle exec ruby scripts/analyze_tags --apply tmp/renames.yml     # apply custom file
```

- Embedded `SUGGESTED_RENAMES` constant holds the curated merge map (37 renames → 43 unique tags from 70)
- `--apply` renames file format: `old_tag: canonical_tag` (plain YAML hash)
- Always updates both `projects.yml` and `projects_dev.yml`

### scripts/project_query — subcommands

Read-only. Never modifies YAML files. Always run via `bundle exec` (requires `table_tennis` gem).
Output is rendered by `table_tennis`: auto-layout, number formatting, colour scales, mark highlighting.

```bash
bundle exec ruby scripts/project_query needs-attention   # data quality audit
bundle exec ruby scripts/project_query stats             # counts + totals
bundle exec ruby scripts/project_query missing ecosystem # blank-field filter
bundle exec ruby scripts/project_query stale --days 7   # scrape freshness
bundle exec ruby scripts/project_query show version_gem # full YAML for one project
bundle exec ruby scripts/project_query console          # IRB session
```

All subcommands accept `--format table|names|yaml`, `--file PATH`, `--no-color`.

In the IRB console: `PROJS`, `table()`, `find()`, `by_language()`, `by_status()`,
`by_ecosystem()`, `by_role()`, `by_tag()`, `missing()`, `stale_scrape()`,
`stale_commit()`, `needs_attention`, `stats`.
