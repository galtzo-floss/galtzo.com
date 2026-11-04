# frozen_string_literal: true

require "spec_helper"
require "tempfile"

RSpec.describe "Structured reporting, strict exit code, and log retention (Issue #2)" do
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
