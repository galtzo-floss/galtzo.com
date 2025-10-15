# Serve the generated static site in `output/` through Rack with proper HEAD handling.
# This provides Rack::Head so HEAD requests mirror GET responses (status+headers, no body).
require "rack"
use Rack::Head

# Custom middleware to ensure header names are lowercase (Rack 3 requires lowercase header names)
class LowercaseHeaders
  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    # Transform header names to lowercase strings (Rack 3 requirement)
    new_headers = {}
    headers.each { |k, v| new_headers[k.to_s.downcase] = v.to_s }
    [status, new_headers, body]
  end
end

use LowercaseHeaders

# Fallback: serve index.html for root, otherwise return file from output or 404
run lambda { |env|
  req = Rack::Request.new(env)
  path = req.path_info
  out = File.expand_path("output", __dir__)

  # Normalize root to index.html
  if path == "/" || path == ""
    file = File.join(out, "index.html")
  else
    # Prevent directory traversal
    safe = Rack::Utils.clean_path_info(path)
    file = File.join(out, safe.sub(%r{^/}, ""))
  end

  if File.file?(file)
    mime = Rack::Mime.mime_type(File.extname(file), "text/html")
    body = File.binread(file)
    # Header names are lowercased by LowercaseHeaders middleware
    [200, {"content-type" => mime, "content-length" => body.bytesize.to_s}, [body]]
  else
    [404, {"content-type" => "text/plain"}, ["Not Found"]]
  end
}
