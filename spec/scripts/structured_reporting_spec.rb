# frozen_string_literal: true

require "spec_helper"
require "tempfile"

RSpec.describe "Structured reporting, strict exit code, and log retention (Issue #2)" do
  let(:log_dir) { Dir.mktmpdir }

  before do
    # Isolate the NDJSON run log per example: the real tmp/update_projects dir
    # sits at the MAX_RUN_LOGS limit, and a later updater's prune_run_logs!
    # would delete an earlier example's log file out from under it.
    stub_const("ProjectUpdater::RUN_LOG_DIR", log_dir)
  end

  let(:updater) do
    ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'])
  end

  describe "#infer_source_from_url" do
    it "maps endpoints to canonical source names" do
      expect(updater.infer_source_from_url("https://api.github.com/repos/owner/repo")).to eq("github")
      expect(updater.infer_source_from_url("https://gitlab.com/api/v4/projects/123")).to eq("gitlab")
      expect(updater.infer_source_from_url("https://codeberg.org/api/v1/repos/owner/repo")).to eq("codeberg")
      expect(updater.infer_source_from_url("https://rubygems.org/api/v1/gems/foo.json")).to eq("rubygems")
      expect(updater.infer_source_from_url("https://crates.io/api/v1/crates/bar")).to eq("cargo")
      expect(updater.infer_source_from_url("https://registry.npmjs.org/baz")).to eq("npm")
      expect(updater.infer_source_from_url("https://pypi.org/pypi/qux/json")).to eq("pypi")
      expect(updater.infer_source_from_url("https://hex.pm/api/packages/elixir_pkg")).to eq("hex")
      expect(updater.infer_source_from_url("https://azuresearch-usnc.nuget.org/query")).to eq("nuget")
      expect(updater.infer_source_from_url("https://packagist.org/packages/vendor/pkg.json")).to eq("packagist")
    end
  end

  describe "#record_error" do
    it "deduplicates errors and emits a diagnostic NDJSON event immediately" do
      initial_error_count = updater.errors.size
      updater.record_error("Test unique error 12345")
      expect(updater.errors.size).to eq(initial_error_count + 1)
      expect(updater.errors).to include("Test unique error 12345")

      # Deduplication
      updater.record_error("Test unique error 12345")
      expect(updater.errors.size).to eq(initial_error_count + 1)

      # Check run log for diagnostic event
      log_content = File.read(updater.run_log_path)
      lines = log_content.lines.map { |l| JSON.parse(l) }
      diagnostic = lines.find { |l| l['type'] == 'diagnostic' && l['message'] == 'Test unique error 12345' }
      expect(diagnostic).not_to be_nil
      expect(diagnostic['severity']).to eq('error')
      expect(diagnostic['ts']).not_to be_nil
    end

    it "attaches the source to the diagnostic event when given" do
      updater.record_error("Sourced failure 98765", source: 'rubygems')
      log_content = File.read(updater.run_log_path)
      lines = log_content.lines.map { |l| JSON.parse(l) }
      diagnostic = lines.find { |l| l['type'] == 'diagnostic' && l['message'] == 'Sourced failure 98765' }
      expect(diagnostic).not_to be_nil
      expect(diagnostic['source']).to eq('rubygems')
    end
  end

  describe "#plain_get" do
    let(:fake_response) do
      Struct.new(:code, :body).new('200', '{"ok": true}')
    end

    before do
      allow(Net::HTTP).to receive(:start).and_return(fake_response)
    end

    it "emits an ok source_request event with duration on success" do
      updater.send(:plain_get, "https://rubygems.org/api/v1/gems/foo.json")
      lines = File.read(updater.run_log_path).lines.map { |l| JSON.parse(l) }
      event = lines.find { |l| l['type'] == 'source_request' && l['url']&.include?('gems/foo.json') }
      expect(event).not_to be_nil
      expect(event['source']).to eq('rubygems')
      expect(event['status']).to eq('ok')
      expect(event['http_code']).to eq(200)
      expect(event['duration_ms']).to be_a(Integer)
    end

    it "records an error, emits a failed event, and raises on non-200" do
      allow(Net::HTTP).to receive(:start).and_return(Struct.new(:code, :body).new('503', 'unavailable'))
      expect {
        updater.send(:plain_get, "https://crates.io/api/v1/crates/bar/owners")
      }.to raise_error(RuntimeError, /HTTP 503/)

      expect(updater.errors.join("\n")).to include('API error (cargo): 503')
      lines = File.read(updater.run_log_path).lines.map { |l| JSON.parse(l) }
      event = lines.find { |l| l['type'] == 'source_request' && l['url']&.include?('crates/bar/owners') }
      expect(event['status']).to eq('error')
      expect(event['http_code']).to eq(503)
      diagnostic = lines.find { |l| l['type'] == 'diagnostic' && l['message']&.include?('crates/bar/owners') }
      expect(diagnostic['source']).to eq('cargo')
    end

    it "emits not_found status for 404 responses" do
      allow(Net::HTTP).to receive(:start).and_return(Struct.new(:code, :body).new('404', 'missing'))
      expect {
        updater.send(:plain_get, "https://registry.npmjs.org/@scoped%2fmissing")
      }.to raise_error(RuntimeError, /HTTP 404/)

      lines = File.read(updater.run_log_path).lines.map { |l| JSON.parse(l) }
      event = lines.find { |l| l['type'] == 'source_request' && l['url']&.include?('%2fmissing') }
      expect(event['status']).to eq('not_found')
    end
  end

  describe "#prune_run_logs!" do
    it "retains only the most recent keep count of log files" do
      Dir.mktmpdir do |dir|
        # Create 10 fake log files
        10.times do |i|
          file_name = File.join(dir, "run-20261101T00000#{i}Z-#{i}.ndjson")
          File.write(file_name, "{}\n")
        end

        expect(Dir[File.join(dir, "run-*.ndjson")].size).to eq(10)
        updater.prune_run_logs!(keep: 4, dir: dir)

        remaining = Dir[File.join(dir, "run-*.ndjson")].sort
        expect(remaining.size).to eq(4)
        expect(remaining.last).to include("run-20261101T000009Z-9.ndjson")
      end
    end
  end

  describe "--strict mode" do
    it "exits with status 1 when errors are present in strict mode" do
      strict_updater = ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'], strict: true)
      strict_updater.record_error("Boom")

      expect {
        # Mocking update loop to finish and invoke summary/exit
        allow(strict_updater).to receive(:select_targets).and_return([])
        allow(strict_updater).to receive(:save_yaml)
        strict_updater.run
      }.to raise_error(SystemExit) { |e| expect(e.status).to eq(1) }
    end
  end
end
