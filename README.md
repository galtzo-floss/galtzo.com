# galtzo.com — Open Source Projects (Bridgetown v2)

Minimal Bridgetown 2.x scaffold listing open source projects from `_data/projects.yml`.

Quick start

```bash
# from project root
bundle install --path vendor/bundle
bundle exec bridgetown serve
```

Open http://localhost:4000 in your browser.

Files of interest

- `_data/projects.yml` — list your projects here
- `index.html` — page that lists projects
- `_layouts/default.html` — basic layout

Notes

- Replace the example projects in `_data/projects.yml` with your real projects.
- If you don't have Ruby/Bundler installed, install them first. On many systems you can use a Ruby manager like rbenv or rvm.
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{{ page.title }} - {{ site.title }}</title>
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
  <header>
    <nav><a href="/">{{ site.title }}</a></nav>
  </header>
  <main>
    {{ content }}
  </main>
  <footer>
    <p>Built with Bridgetown</p>
  </footer>
</body>
</html>

