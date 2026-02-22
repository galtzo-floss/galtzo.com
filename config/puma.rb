# Puma is a fast, concurrent web server for Ruby & Rack
#
# Learn more at: https://puma.io
# Bridgetown configuration documentation:
# https://www.bridgetownrb.com/docs/configuration/puma

# This port number typically gets overridden by Bridgetown's boot & config loader
port ENV.fetch("BRIDGETOWN_PORT") { 4000 }

if ENV["BRIDGETOWN_ENV"] == "production"
  workers ENV.fetch("BRIDGETOWN_CONCURRENCY") { 4 }
end

max_threads_count = ENV.fetch("BRIDGETOWN_MAX_THREADS") { 5 }
min_threads_count = ENV.fetch("BRIDGETOWN_MIN_THREADS") { max_threads_count }
threads min_threads_count, max_threads_count

pidfile ENV["PIDFILE"] || "tmp/pids/server.pid"

preload_app!

require "bridgetown-core/rack/logger"
log_formatter do |msg|
  Bridgetown::Rack::Logger.message_with_prefix msg
end
