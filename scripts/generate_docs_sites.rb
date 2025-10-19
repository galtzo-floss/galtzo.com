#!/usr/bin/env ruby
# ...existing code...
require 'yaml'
require 'net/http'
require 'uri'
require 'openssl'
require 'optparse'
require 'time'
require 'fileutils'

DEFAULT_FILE = File.expand_path('src/_data/projects.yml', __dir__ + '/../')

options = {
  file: DEFAULT_FILE,
  dry_run: false,
  timeout: 5,
  max_redirects: 5,
  output: nil,
  limit: nil
}

OptionParser.new do |opt|
  opt.banner = "Usage: generate_docs_sites.rb [options]"
  opt.on('-f', '--file PATH', 'Path to projects.yml (default: src/_data/projects.yml)') { |v| options[:file] = v }
  opt.on('-o', '--output PATH', 'Write output to PATH instead of modifying input file in-place') { |v| options[:output] = v }
  opt.on('--dry-run', 'Do not write changes; just print a summary') { options[:dry_run] = true }
  opt.on('--timeout N', Integer, 'HTTP open/read timeout seconds (default 5)') { |v| options[:timeout] = v }
  opt.on('--max-redirects N', Integer, 'Maximum number of redirects to follow for HEAD (default 5)') { |v| options[:max_redirects] = v }
  opt.on('--limit N', Integer, 'Only process the first N projects (useful for testing)') { |v| options[:limit] = v }
  opt.on('-h', '--help', 'Show this help') { puts opt; exit }
end.parse!

file_path = File.expand_path(options[:file])
unless File.exist?(file_path)
  $stderr.puts "projects file not found: #{file_path}"
  exit 2
end

# Load YAML robustly. Some workspace copies may include surrounding fences or comment lines.
begin
  projects = YAML.load_file(file_path)
rescue => primary_err
  warn "YAML.load_file failed: #{primary_err.class}: #{primary_err.message} -- attempting resilient parse"
  begin
    text = File.read(file_path)
    # Strip leading/trailing code fences like ```yaml or ```
    text = text.gsub(/\A\s*```[^\n]*\n/, '')
    text = text.gsub(/\n```[^\n]*\s*\z/, '')
    # Remove lines that look like // comments produced by some tools
    text = text.lines.reject { |l| l.lstrip.start_with?('//') }.join
    projects = YAML.load(text)
  rescue => secondary_err
    $stderr.puts "Resilient parse also failed: #{secondary_err.class}: #{secondary_err.message}"
    exit 2
  end
end

unless projects.is_a?(Array)
  $stderr.puts "Unexpected YAML structure: expected top-level sequence (Array)"
  exit 2
end

# Helper to perform HEAD request and follow redirects up to max_redirects

def head_exists?(url_str, timeout:, max_redirects:, visited: [])
  return false if visited.include?(url_str)
  visited << url_str

  uri = URI(url_str)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = (uri.scheme == 'https')
  http.verify_mode = OpenSSL::SSL::VERIFY_PEER
  http.open_timeout = timeout
  http.read_timeout = timeout

  req = Net::HTTP::Head.new(uri.request_uri)

  begin
    res = http.request(req)
  rescue => e
    warn "HEAD #{url_str} -> error: #{e.class}: #{e.message}"
    return false
  end

  case res
  when Net::HTTPSuccess
    true
  when Net::HTTPRedirection
    location = res['location']
    if location && max_redirects > 0
      # Build absolute URL if location is relative
      new_uri = URI.join(url_str, location).to_s rescue location
      head_exists?(new_uri, timeout: timeout, max_redirects: max_redirects - 1, visited: visited)
    else
      false
    end
  else
    false
  end
end

changes = []
count_found = 0
count_total = 0

projects.each_with_index do |proj, idx|
  break if options[:limit] && idx >= options[:limit]
  count_total += 1
  unless proj.is_a?(Hash) && proj.key?('name')
    warn "Skipping entry ##{idx} because it is not a Hash with a 'name' key"
    next
  end

  name = proj['name'].to_s
  subdomain = name.gsub('_', '-')
  url = "https://#{subdomain}.galtzo.com"

  exists = head_exists?(url, timeout: options[:timeout], max_redirects: options[:max_redirects])

  old = proj.key?('docs_site') ? proj['docs_site'] : :__unset
  new_val = exists ? url : nil
  proj['docs_site'] = new_val

  if old == :__unset || old != new_val
    changes << { index: idx, name: name, old: old, new: new_val }
  end

  count_found += 1 if exists
  puts "#{exists ? '[FOUND] ' : '[MISS ] '} #{url}"
end

puts "\nChecked #{count_total} projects, found #{count_found} docs sites."

if options[:dry_run]
  puts "--dry-run used; not writing changes. Summary of changes:"
  changes.each do |c|
    puts "- #{c[:name]}: #{c[:old].inspect} -> #{c[:new].inspect}"
  end
  exit 0
end

out_path = options[:output] ? File.expand_path(options[:output]) : file_path

if out_path == file_path
  # backup
  bak = "#{file_path}.bak.#{Time.now.utc.strftime('%Y%m%dT%H%M%SZ')}"
  FileUtils.cp(file_path, bak)
  puts "Wrote backup to #{bak}"
end

# Write YAML
begin
  # Use safe YAML dump and preserve UTF-8
  yaml_text = projects.to_yaml
  File.write(out_path, yaml_text)
  puts "Wrote updated projects to #{out_path} (#{changes.size} changes)"
rescue => e
  $stderr.puts "Failed to write output: #{e.class}: #{e.message}"
  exit 2
end

exit 0
