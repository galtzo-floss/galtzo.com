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

### projects.yml Entry Count (as of 2026-02-22)

- Total YAML entries: 107 (includes 1 `type: person` entry)
- Ruby+rubygems project entries: 101
- RubyGems.org gems owned by pboling: 114
- **Gap: 17 gems missing from projects.yml** (ast-merge, bash-merge, commonmarker-merge,
  dotenv-merge, json-merge, jsonc-merge, markdown-merge, markly-merge, prism-merge,
  psych-merge, rbs-merge, token-resolver, toml-merge, tree_haver, yaml-converter,
  yard-fence, yard-yaml)
- 4 entries in projects.yml not owned by pboling on RubyGems.org (intentional):
  awesome-sponsorships, masq, os, resque

### scripts/update_projects — key behaviour

- **RubyGems discovery is ON by default.** The script always runs the discovery
  pre-flight at startup (requires `RUBYGEMS_HANDLE` env var).
- Pass `--no-discover` to skip discovery.
- Pass `-y` or `--no-tty` to auto-accept all confirmation prompts (non-interactive / CI use).
- The old `--discover-rubygems` flag no longer exists; discovery is now the default.


## Workspace Layout

```
galtzo.com/
  src/_data/projects.yml       # production project list
  src/_data/projects_dev.yml   # dev/test project list (must exist)
  scripts/update_projects      # main data refresh script
  scripts/devswap              # swaps prod<->dev data files
  tmp/                         # safe scratch space for tee output files
```
