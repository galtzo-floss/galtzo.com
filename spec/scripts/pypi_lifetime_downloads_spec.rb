# frozen_string_literal: true

require "spec_helper"

RSpec.describe "PyPI lifetime downloads via pepy.tech (Issue #3)" do
  let(:updater) do
    ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'])
  end

  describe "#fetch_registry_downloads pypi" do
    let(:pepy_payload) do
      {
        'id' => 'some_pkg',
        'total_downloads' => 83_371_026,
        'downloads' => {
          '2026-10-01' => { '1.0.0' => 100, '0.9.1' => 50 },
          '2026-10-02' => { '1.0.0' => 200, '0.9.1' => 100 },
          '2026-10-03' => { '1.0.0' => 300, '0.9.1' => 150 }
        }
      }
    end

    it "uses the pepy.tech lifetime total and computes a 28-day daily average" do
      allow(updater).to receive(:api_request).with("https://pepy.tech/api/v2/projects/some_pkg").and_return(pepy_payload)

      info = updater.fetch_registry_downloads('pypi', 'some_pkg')
      expect(info[:total]).to eq(83_371_026)
      expect(info[:basis]).to eq('lifetime')
      # daily avg over the (3-day) window: (150+300+450)/3 = 300
      expect(info[:daily]).to eq(300)
    end

    it "falls back to the pypistats 180d window when pepy has no data" do
      allow(updater).to receive(:api_request).with("https://pepy.tech/api/v2/projects/some_pkg").and_return(nil)
      allow(updater).to receive(:api_request)
        .with("https://pypistats.org/api/packages/some_pkg/overall?mirrors=false")
        .and_return(
          'data' => [
            { 'category' => 'without_mirrors', 'date' => '2026-10-01', 'downloads' => 1000 },
            { 'category' => 'with_mirrors', 'date' => '2026-10-01', 'downloads' => 9999 },
            { 'category' => 'without_mirrors', 'date' => '2026-10-02', 'downloads' => 2000 }
          ]
        )

      info = updater.fetch_registry_downloads('pypi', 'some_pkg')
      expect(info[:total]).to eq(3000)
      expect(info[:basis]).to eq('180d')
      expect(info[:daily]).to eq(1500)
    end

    it "falls back when pepy returns a non-2xx (api_request raises)" do
      allow(updater).to receive(:api_request).with("https://pepy.tech/api/v2/projects/some_pkg").and_raise("HTTP 500")
      allow(updater).to receive(:api_request)
        .with("https://pypistats.org/api/packages/some_pkg/overall?mirrors=false")
        .and_return(
          'data' => [
            { 'category' => 'without_mirrors', 'date' => '2026-10-01', 'downloads' => 10 },
            { 'category' => 'without_mirrors', 'date' => '2026-10-02', 'downloads' => 20 }
          ]
        )

      info = updater.fetch_registry_downloads('pypi', 'some_pkg')
      expect(info[:total]).to eq(30)
      expect(info[:basis]).to eq('180d')
    end
  end
end
