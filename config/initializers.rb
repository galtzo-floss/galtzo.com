Bridgetown.configure do |config|
  # The base hostname & protocol for your site, e.g. https://example.com
  url "http://localhost:4000"

  # Source directory
  # source "src"  # already set in _config.yml

  # Available options are `erb` (default), `serbea`, or `liquid`
  template_engine "erb"

  permalink "pretty"

  # Add collection pagination features to your site. Documentation here:
  # https://www.bridgetownrb.com/docs/content/pagination
  #
  # pagination do
  #   enabled true
  # end
end
