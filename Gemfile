source "https://gem.coop"

gem "bridgetown", "~> 2.2"
gem "bridgetown-core", "~> 2.2"
gem "bridgetown-builder", "~> 2.2"
gem "bridgetown-foundation", "~> 2.2"
gem "bridgetown-paginate", "~> 2.2"
# Bridgetown 2.2.0 extends Samovar's Mapping::Model DSL, removed in Samovar 2.5.
gem "samovar", ">= 2.4", "< 2.5"

group :development do
  # Optional stylesheet compiler
  gem "sassc", "~> 2.0"
  # Provide a Rack server for `bridgetown start`
  gem "puma", "~> 6.0"
  gem "rack", "~> 3.0"
  gem "rackup", "~> 2.0"

  # TTY / CLI App Records Printer
  gem "table_tennis"
  gem "tty-prompt"
end
