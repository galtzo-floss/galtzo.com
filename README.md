# galtzo.com — Open Source Projects (Bridgetown v2)

Minimal Bridgetown 2.x scaffold listing open source projects from `src/_data/projects.yml`.

## Quick start

```bash
# from project root
bundle install
bundle exec bridgetown start
```

Open http://localhost:4000 in your browser.

## Files of interest

- `src/_data/projects.yml` — production project list (the one the site builds from)
- `src/_data/projects_dev.yml` — dev/test project list (kept in sync by `scripts/update_projects`)
- `src/index.html` — page that lists projects
- `src/_layouts/default.html` — basic layout

---

## Scripts

All scripts live in `scripts/` and are meant to be run from the **project root**.

### `scripts/update_projects` — fetch live stats from APIs

Iterates over every project in `src/_data/projects.yml` and fetches up-to-date
data from GitHub, GitLab, Codeberg, and RubyGems APIs, then writes the results
back to both `projects.yml` and `projects_dev.yml`.

#### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Recommended | Raises the GitHub API rate limit from 60 to 5,000 req/hr |
| `GITLAB_TOKEN` | Optional | Authenticates GitLab API requests |
| `RUBYGEMS_HANDLE` | Recommended | Your RubyGems username (e.g. `pboling`) — enables gem discovery |

Set these in a `.env.local` file (or however your shell loads env vars) before running.

#### Full update (default)

```bash
ruby scripts/update_projects
```

When run with no subcommand or field, the script:

1. **Discovers** any gems on RubyGems.org (owned by `RUBYGEMS_HANDLE`) not yet
   in `projects.yml`, displays them, and asks whether to add them now.
2. Shows how many projects will be updated vs. skipped (projects scraped within
   the last 24 hours are skipped automatically).
3. **Prompts for confirmation** before starting the update loop.

> Discovery only runs on a bare full update. Passing a surgical field or the
> `add_project` subcommand disables it automatically.

To skip all prompts (e.g. in CI or a cron job), pass `-y` / `--no-tty`:

```bash
ruby scripts/update_projects -y
```

To skip the RubyGems discovery pre-flight explicitly:

```bash
ruby scripts/update_projects --no-discover
```

To force a re-scrape of a project that was recently scraped, delete or zero out
its `last_scrape_at` field in `projects.yml`.

#### Surgical update — one field across all projects

Instead of a full re-scrape, update a single field for every project.
Surgical mode ignores `last_scrape_at` timestamps and skips gem discovery.

```bash
ruby scripts/update_projects <field>
```

Valid fields:

| Field | Source |
|---|---|
| `github_stars` | GitHub API |
| `gitlab_stars` | GitLab API |
| `codeberg_stars` | Codeberg / Gitea API |
| `total_downloads` | RubyGems API |
| `daily_downloads` | RubyGems API |
| `release_downloads` | RubyGems API |
| `release_date` | RubyGems API (Ruby gems) / GitHub Releases (others) |
| `last_commit_on` | GitHub API |
| `status` | Derived from GitHub (`active` / `stale` / `archived`) |

```bash
ruby scripts/update_projects github_stars
ruby scripts/update_projects release_date
ruby scripts/update_projects -y status          # non-interactive
```

#### `add_project` — add a single project interactively

Wizard that interrogates you for a project's details, auto-fills everything it
can from the relevant package registry and GitHub, then shows you the resulting
YAML entry for confirmation before writing it to `projects.yml`.

Works for any language and any of the supported package ecosystems:
**RubyGems**, **Cargo** (Rust / crates.io), **npm** (JavaScript/TypeScript),
**PyPI** (Python), **Go Modules** (proxy.golang.org), or **none** (forge-only
projects with no package registry).

```bash
# Fully interactive — prompts for everything
ruby scripts/update_projects add_project

# Pre-supply values to skip individual prompts
ruby scripts/update_projects add_project \
  --name my-crate \
  --ecosystem cargo \
  --role contributor \
  --github-url https://github.com/org/my-crate

# Non-interactive (auto-accept all defaults / pre-supplied values)
ruby scripts/update_projects add_project -y \
  --name my-gem \
  --ecosystem rubygems \
  --role author
```

`add_project` flags (all optional — omitted values are prompted interactively):

| Flag | Description |
|---|---|
| `--name NAME` | Project / package name |
| `--ecosystem ECO` | `rubygems` \| `cargo` \| `npm` \| `pypi` \| `go` \| `none` |
| `--language LANG` | Primary language (inferred from ecosystem if omitted) |
| `--role ROLE` | `author` \| `contributor` \| `maintainer` (default: `contributor`) |
| `--github-url URL` | GitHub repository URL |
| `--gitlab-url URL` | GitLab repository URL |
| `--codeberg-url URL` | Codeberg repository URL |
| `--description TEXT` | Short description (HTML allowed) |
| `--minimum-version VER` | Minimum runtime version |
| `--tags TAG1,TAG2` | Comma-separated tags |

#### Option reference

| Flag | Default | Description |
|---|---|---|
| `-h, --help` | | Show help and exit |
| `--no-discover` | *(auto)* | Skip the RubyGems discovery pre-flight |
| `-y, --no-tty` | *(interactive)* | Auto-accept all confirmation prompts |

#### Safety check

`update_projects` refuses to run if `src/_data/projects_dev.yml` is absent.
That file's absence means `scripts/devswap` was run but not run again to
restore the production file — see the next section.

---

### `scripts/devswap` — swap between dev and production project lists

Toggles `projects.yml` between the production and dev/test versions so you can
preview dev-only projects locally without risking them being deployed.

```bash
# Swap to dev (projects_dev.yml becomes projects.yml for local preview)
scripts/devswap

# Swap back to prod (restores the original projects.yml)
scripts/devswap
```

**State machine:**

| Before | After |
|---|---|
| `projects.yml` (prod) + `projects_dev.yml` | `projects.yml` (dev) + `projects_prod.yml` |
| `projects.yml` (dev) + `projects_prod.yml` | `projects.yml` (prod) + `projects_dev.yml` |

> ⚠️ Always run `scripts/devswap` a second time to restore the production file
> before committing or deploying. `scripts/update_projects` will abort with a
> clear error if you forget.

---

### `scripts/generate_docs_sites.rb` — auto-detect documentation subdomains

For each project in `projects.yml`, this script performs an HTTP HEAD request to
`https://<project-name>.galtzo.com` and sets the `docs_site` field to that URL
if the subdomain resolves, or `null` if it doesn't.

```bash
# In-place update (creates a timestamped .bak backup automatically)
ruby scripts/generate_docs_sites.rb

# Preview changes without writing anything
ruby scripts/generate_docs_sites.rb --dry-run

# Write to a separate output file instead of modifying projects.yml
ruby scripts/generate_docs_sites.rb --output /tmp/projects_updated.yml

# Only check the first 5 projects (useful for testing)
ruby scripts/generate_docs_sites.rb --limit 5

# Use a different projects file
ruby scripts/generate_docs_sites.rb --file path/to/other.yml

# Adjust timeouts / redirect limits
ruby scripts/generate_docs_sites.rb --timeout 10 --max-redirects 3
```

Full option reference (`--help`):

| Flag | Default | Description |
|---|---|---|
| `-f / --file PATH` | `src/_data/projects.yml` | Path to the projects YAML file |
| `-o / --output PATH` | *(in-place)* | Write output here instead of modifying the input file |
| `--dry-run` | false | Print a summary of changes without writing |
| `--timeout N` | 5 | HTTP open/read timeout in seconds |
| `--max-redirects N` | 5 | Maximum redirects to follow per HEAD request |
| `--limit N` | *(all)* | Only process the first N projects |
| `-h / --help` | | Show help |

---

## Notes

- Replace the example projects in `src/_data/projects.yml` with your real projects.
- If you don't have Ruby/Bundler installed, install them first. On many systems
  you can use a Ruby version manager like [mise](https://mise.jdx.dev/),
  [rbenv](https://github.com/rbenv/rbenv), or [rvm](https://rvm.io/).
