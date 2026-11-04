# frozen_string_literal: true

begin
  require "kettle-soup-cover"
  if Kettle::Soup::Cover::DO_COV
    require "simplecov"
    require "kettle/soup/cover/config"
    SimpleCov.start
  end
rescue LoadError => error
  raise error unless error.message.include?("kettle")
end

require "kettle/test/rspec"

# Load the ProjectUpdater class
load File.expand_path("../scripts/update_projects", __dir__)

RSpec.configure do |config|
  config.disable_monkey_patching!

  config.expect_with :rspec do |c|
    c.syntax = :expect
  end
end
