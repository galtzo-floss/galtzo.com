# frozen_string_literal: true

require "spec_helper"
require "tempfile"

RSpec.describe "Targeted runs and class filtering (Issue #7)" do
  let(:log_dir) { Dir.mktmpdir }

  before do
    # Isolate the NDJSON run log per example so prune_run_logs! in a later
    # updater can never delete an earlier example's log file.
    stub_const("ProjectUpdater::RUN_LOG_DIR", log_dir)
  end

  let(:updater) do
    ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'])
  end

  let(:sample_projects) do
    [
      {
        'name' => 'proj_alpha',
        'ecosystem' => 'rubygems',
        'language' => 'Ruby',
        'role' => 'author',
        'status' => 'active',
        'family_id' => 'alpha-family',
        'tags' => ['gem', 'ruby'],
        'forges' => [{ 'type' => 'GitHub', 'url' => 'https://github.com/test/proj_alpha' }],
        'total_downloads' => 1000,
        'last_scrape_at' => '2026-11-01T00:00:00Z'
      },
      {
        'name' => 'proj_beta',
        'ecosystem' => 'cargo',
        'language' => 'Rust',
        'role' => 'maintainer',
        'status' => 'stale',
        'family_id' => 'beta-family',
        'tags' => ['rust'],
        'forges' => [{ 'type' => 'GitLab', 'url' => 'https://gitlab.com/test/proj_beta' }],
        'total_downloads' => 500,
        'last_scrape_at' => '2026-11-02T00:00:00Z'
      },
      {
        'name' => 'proj_gamma',
        'ecosystem' => 'npm',
        'language' => 'TypeScript',
        'role' => 'contributor',
        'status' => 'archived',
        'family_id' => nil,
        'tags' => ['npm'],
        'forges' => [],
        'total_downloads' => 200,
        'last_scrape_at' => '2026-10-01T00:00:00Z'
      },
      {
        'name' => '@scoped/pkg',
        'ecosystem' => 'npm',
        'language' => 'JavaScript',
        'role' => 'author',
        'status' => 'active',
        'family_id' => 'scoped-family',
        'tags' => ['npm', 'scoped'],
        'forges' => [{ 'type' => 'GitHub', 'url' => 'https://github.com/test/pkg' }],
        'total_downloads' => 10,
        'last_scrape_at' => '2026-11-03T00:00:00Z'
      }
    ]
  end

  describe "#project_in_class?" do
    it "filters simple classes: active, stale, archived, no-forge" do
      alpha = sample_projects[0]
      beta = sample_projects[1]
      gamma = sample_projects[2]

      expect(updater.project_in_class?(alpha, 'active')).to be true
      expect(updater.project_in_class?(alpha, 'stale')).to be false

      expect(updater.project_in_class?(beta, 'stale')).to be true
      expect(updater.project_in_class?(gamma, 'archived')).to be true

      expect(updater.project_in_class?(gamma, 'no-forge')).to be true
      expect(updater.project_in_class?(alpha, 'no-forge')).to be false
    end

    it "filters keyed classes: role, ecosystem, language, status, family, tag" do
      alpha = sample_projects[0]
      beta = sample_projects[1]
      gamma = sample_projects[2]

      expect(updater.project_in_class?(alpha, 'role:author')).to be true
      expect(updater.project_in_class?(beta, 'role:maintainer')).to be true
      expect(updater.project_in_class?(gamma, 'role:contributor')).to be true

      expect(updater.project_in_class?(alpha, 'ecosystem:rubygems')).to be true
      expect(updater.project_in_class?(beta, 'ecosystem:cargo')).to be true
      expect(updater.project_in_class?(gamma, 'ecosystem:npm')).to be true

      expect(updater.project_in_class?(alpha, 'language:Ruby')).to be true
      expect(updater.project_in_class?(beta, 'language:Rust')).to be true

      expect(updater.project_in_class?(alpha, 'family:alpha-family')).to be true
      expect(updater.project_in_class?(alpha, 'tag:gem')).to be true
      expect(updater.project_in_class?(alpha, 'tag:rust')).to be false
    end

    it "filters failed class using last run log" do
      log_dir = ProjectUpdater::RUN_LOG_DIR
      FileUtils.mkdir_p(log_dir)
      test_log = File.join(log_dir, "run-20990101T000000Z-999999.ndjson")
      File.write(test_log, [
        JSON.generate({ 'type' => 'project_result', 'name' => 'proj_alpha', 'ecosystem' => 'rubygems', 'status' => 'error' }),
        JSON.generate({ 'type' => 'project_result', 'name' => 'proj_beta', 'ecosystem' => 'cargo', 'status' => 'ok' })
      ].join("\n"))

      begin
        updater_with_log = ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'])
        expect(updater_with_log.project_in_class?(sample_projects[0], 'failed')).to be true
        expect(updater_with_log.project_in_class?(sample_projects[1], 'failed')).to be false
      ensure
        FileUtils.rm_f(test_log)
      end
    end
  end

  describe "#select_targets" do
    it "combines -p filter and --only classes via intersection" do
      target_updater = ProjectUpdater.new(
        auto_confirm: true,
        surgical_fields: ['status'],
        project_filter: 'proj_alpha,proj_beta',
        project_classes: ['ecosystem:rubygems']
      )

      selected = target_updater.select_targets(sample_projects)
      expect(selected.map { |p| p['name'] }).to eq(['proj_alpha'])
    end

    it "takes the union of multiple --only classes" do
      target_updater = ProjectUpdater.new(
        auto_confirm: true,
        surgical_fields: ['status'],
        project_classes: ['ecosystem:cargo', 'ecosystem:npm']
      )

      selected = target_updater.select_targets(sample_projects)
      expect(selected.map { |p| p['name'] }).to contain_exactly('proj_beta', 'proj_gamma', '@scoped/pkg')
    end

    it "orders stalest-first with oldest_first, then applies limit" do
      target_updater = ProjectUpdater.new(
        auto_confirm: true,
        surgical_fields: ['status'],
        limit: 2,
        oldest_first: true
      )

      selected = target_updater.select_targets(sample_projects)
      # proj_gamma (2026-10-01) is stalest, then proj_alpha (2026-11-01)
      expect(selected.map { |p| p['name'] }).to eq(['proj_gamma', 'proj_alpha'])
    end
  end

  describe "#validate_project_classes!" do
    it "accepts every documented simple class" do
      ProjectUpdater::CLASS_SIMPLE.each do |klass|
        expect {
          ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'], project_classes: [klass])
        }.not_to raise_error
      end
    end

    it "accepts every documented keyed class prefix" do
      ProjectUpdater::CLASS_KEYED.each do |key|
        expect {
          ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'], project_classes: ["#{key}:value"])
        }.not_to raise_error
      end
    end

    it "raises on an unknown simple class" do
      expect {
        ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'], project_classes: ['bogus'])
      }.to raise_error(RuntimeError, /Unknown project class\(es\): bogus/)
    end

    it "raises on an unknown keyed class" do
      expect {
        ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'], project_classes: ['nope:value'])
      }.to raise_error(RuntimeError, /Unknown project class\(es\): nope:value/)
    end
  end

  describe "additional classes" do
    it "matches the pending class via scrape freshness" do
      fresh = { 'name' => 'fresh', 'last_scrape_at' => Time.now.utc.iso8601, 'forges' => [] }
      old = { 'name' => 'old', 'last_scrape_at' => '2020-01-01T00:00:00Z', 'forges' => [] }
      never = { 'name' => 'never', 'last_scrape_at' => nil, 'forges' => [] }

      expect(updater.project_in_class?(fresh, 'pending')).to be false
      expect(updater.project_in_class?(old, 'pending')).to be true
      expect(updater.project_in_class?(never, 'pending')).to be true
    end

    it "matches the status: keyed class" do
      expect(updater.project_in_class?(sample_projects[0], 'status:active')).to be true
      expect(updater.project_in_class?(sample_projects[1], 'status:active')).to be false
    end

    it "matches top:N (owned, non-archived) and rest:N as disjoint sets" do
      updater_with_projects = ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'])
      updater_with_projects.instance_variable_set(:@projects, sample_projects)

      alpha = sample_projects[0]     # author, active, 1000 downloads
      beta = sample_projects[1]      # maintainer, stale, 500 downloads
      gamma = sample_projects[2]     # contributor + archived → excluded from top:N

      top2 = updater_with_projects.project_in_class?(alpha, 'top:2')
      expect(top2).to be true
      expect(updater_with_projects.project_in_class?(beta, 'top:2')).to be true
      expect(updater_with_projects.project_in_class?(gamma, 'top:2')).to be false

      # rest:N is the exact complement of top:N
      expect(updater_with_projects.project_in_class?(alpha, 'rest:2')).to be false
      expect(updater_with_projects.project_in_class?(beta, 'rest:2')).to be false
      expect(updater_with_projects.project_in_class?(gamma, 'rest:2')).to be true
    end
  end

  describe "#persist_targeted with ast-crispr-yaml-psych" do
    it "modifies only targeted entries leaving untouched entries and formatting byte-identical" do
      initial_yaml = <<~YAML
        # Header comment to preserve
        # Another line
        - name: first_proj
          ecosystem: rubygems
          minimum_version: "2.7"
          status: active
        # Middle comment
        - name: "@scoped/pkg"
          ecosystem: npm
          minimum_version: "18.0"
          status: active
        - name: third_proj
          ecosystem: cargo
          status: active
      YAML

      file = Tempfile.new(['targeted_test', '.yml'])
      file.write(initial_yaml)
      file.flush

      entries = YAML.safe_load(initial_yaml)
      changed_entry = entries.find { |e| e['name'] == '@scoped/pkg' }
      changed_entry['status'] = 'stale'
      changed_entry['minimum_version'] = '20.0'

      updater.persist_targeted(file.path, entries, [changed_entry])

      updated_content = File.read(file.path)
      updated_entries = YAML.safe_load(updated_content)

      # Check that the modified entry changed
      target = updated_entries.find { |e| e['name'] == '@scoped/pkg' }
      expect(target['status']).to eq('stale')
      expect(target['minimum_version']).to eq('20.0')

      # Check that first_proj and third_proj stayed untouched
      expect(updated_entries.find { |e| e['name'] == 'first_proj' }['status']).to eq('active')
      expect(updated_entries.find { |e| e['name'] == 'third_proj' }['status']).to eq('active')

      # Comments remain preserved
      expect(updated_content).to include("# Header comment to preserve")
      expect(updated_content).to include("# Middle comment")
    ensure
      file.close!
    end

    it "rewrites multiple changed entries in one pass" do
      initial_yaml = <<~YAML
        - name: proj_a
          ecosystem: rubygems
          status: active
        - name: proj_b
          ecosystem: cargo
          status: active
        - name: proj_c
          ecosystem: npm
          status: active
      YAML

      file = Tempfile.new(['targeted_multi', '.yml'])
      file.write(initial_yaml)
      file.flush

      entries = YAML.safe_load(initial_yaml)
      a = entries.find { |e| e['name'] == 'proj_a' }
      c = entries.find { |e| e['name'] == 'proj_c' }
      a['status'] = 'stale'
      c['status'] = 'archived'

      updater.persist_targeted(file.path, entries, [a, c])

      updated_entries = YAML.safe_load(File.read(file.path))
      expect(updated_entries.find { |e| e['name'] == 'proj_a' }['status']).to eq('stale')
      expect(updated_entries.find { |e| e['name'] == 'proj_c' }['status']).to eq('archived')
      # untouched middle entry
      expect(updated_entries.find { |e| e['name'] == 'proj_b' }['status']).to eq('active')
    ensure
      file.close!
    end

    it "leaves the file byte-identical when no changed entry matches, and coerces numeric minimum_version to a string" do
      initial_yaml = <<~YAML
        - name: proj_a
          ecosystem: rubygems
          minimum_version: "2.7"
          status: active
      YAML

      file = Tempfile.new(['targeted_nomatch', '.yml'])
      file.write(initial_yaml)
      file.flush

      entries = YAML.safe_load(initial_yaml)
      # A changed entry that does not exist in the file is skipped silently
      ghost = { 'name' => 'ghost', 'ecosystem' => 'rubygems', 'status' => 'stale' }

      updater.persist_targeted(file.path, entries, [ghost])
      expect(File.read(file.path)).to eq(initial_yaml)

      # Numeric minimum_version is coerced to a quoted string on rewrite
      a = entries.find { |e| e['name'] == 'proj_a' }
      a['status'] = 'stale'
      a['minimum_version'] = 3.2

      updater.persist_targeted(file.path, entries, [a])
      rewritten = File.read(file.path)
      expect(rewritten).to include("'3.2'")
      expect(YAML.safe_load(rewritten).find { |e| e['name'] == 'proj_a' }['minimum_version']).to eq('3.2')
    ensure
      file.close!
    end
  end
end
