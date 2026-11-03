# frozen_string_literal: true

require 'yaml'
require 'json'
require 'net/http'
require 'date'
require 'time'
require 'fileutils'
require 'ast-crispr-yaml-psych'

# Per-repo star event history, stored as YAML under src/_data/star_history/<owner>--<repo>.yml.
#
#   repo: owner/name
#   synced_through: '2026-11-03'     # last day the recent window was re-read
#   last_full_resync: '2026-11-03'   # last monthly resync gate run
#   unaligned_delta: 0               # stored events minus GitHub's count when no resync could realign them
#   observed:                        # GitHub's star count as seen on a given day (unstars show up here)
#     '2026-11-03': 2181
#   stars:                           # one key per day that had stars -> that day's star event times (UTC), one line a day
#     '2010-04-12': ['10:11:12', '11:02:45']
#
# Star events are append-only in time, so anything older than SETTLE_DAYS is never re-read. Only the recent
# window is re-fetched, and not at all when GitHub's count is unchanged. The only things that rewrite history
# are unstars, which a monthly gated resync repairs. No usernames are stored, only timestamps.
#
# Every edit goes through ast-crispr-yaml-psych (structural edits on the day/field entries) and the result is
# re-parsed and checked before it is written, so the file is always valid YAML with the expected shape.
class StarHistory
  DIR = File.expand_path('../src/_data/star_history', __dir__)
  SETTLE_DAYS = 14
  PER_PAGE = 100
  Selectors = Ast::Crispr::Yaml::Psych::Selectors
  AnchorPoint = Struct.new(:anchor)
  TIME = /\A\d\d:\d\d:\d\d\z/

  attr_reader :api_calls

  def initialize(token: ENV['GITHUB_TOKEN'], dir: DIR, today: -> { Date.today }, pager: nil)
    @token = token
    @dir = dir
    @today = today
    @pager = pager # test seam: ->(repo, page) { [events, last_page] }
    @api_calls = 0
  end

  def path_for(repo)
    File.join(@dir, "#{repo.sub('/', '--')}.yml")
  end

  def load(repo)
    path = path_for(repo)
    File.exist?(path) ? YAML.safe_load(File.read(path)) : nil
  end

  # +total+ is GitHub's current stargazers_count for the repo. Returns a summary hash.
  def sync(repo, total)
    today = @today.call.to_s
    path = path_for(repo)
    data = load(repo)
    before_calls = @api_calls
    return { repo: repo, mode: :no_stars, api_calls: 0, days_changed: 0, total: total } if data.nil? && total.to_i.zero?
    return backfill(repo, total, today, before_calls) if data.nil?

    stored = count_events(data)
    mode = :unchanged
    changes = {}
    last_observed_total = data['observed']&.sort&.last&.last

    if total != last_observed_total || stored != total + data['unaligned_delta'].to_i
      changes = recent_window_changes(repo, data, total)
      mode = changes.empty? ? :checked : :recent
    end

    content = File.read(path)
    content = apply_day_changes(content, data, changes) unless changes.empty?
    data = YAML.safe_load(content)

    if monthly_resync_due?(data, today)
      stored = count_events(data)
      if stored == total + data['unaligned_delta'].to_i
        content = set_scalar(content, 'last_full_resync', today)
        mode = :resync_skipped if mode == :unchanged
      else
        content, mode = full_resync(repo, content, total, today)
      end
    end

    content = set_scalar(content, 'synced_through', today) if mode != :unchanged || data['synced_through'] != today
    content = set_observed(content, today, total)
    write_checked(path, content)
    { repo: repo, mode: mode, api_calls: @api_calls - before_calls, days_changed: changes.size, total: total }
  end

  private

  # --- reading GitHub --------------------------------------------------------

  # Returns [events (UTC ISO strings, oldest first on the page), last_page].
  def fetch_page(repo, page)
    return @pager.call(repo, page) if @pager

    uri = URI("https://api.github.com/repos/#{repo}/stargazers?per_page=#{PER_PAGE}&page=#{page}")
    res = nil
    4.times do # renamed or transferred repos answer 301 with the new API URL
      req = Net::HTTP::Get.new(uri)
      req['Accept'] = 'application/vnd.github.star+json'
      req['User-Agent'] = 'Galtzo-Project-Updater'
      req['Authorization'] = "Bearer #{@token}" if @token
      res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(req) }
      @api_calls += 1
      break unless %w[301 302 307 308].include?(res.code) && res['Location']

      uri = URI(res['Location'].sub(%r{/stargazers(?!.*\?)}, '/stargazers').then { |l| l.include?('?') ? l : "#{l}?per_page=#{PER_PAGE}&page=#{page}" })
    end
    raise "stargazers #{repo} p#{page}: #{res.code} #{res.body[0, 120]}" unless res.code == '200'

    last = res['Link'].to_s[/[?&]page=(\d+)>; rel="last"/, 1]&.to_i
    [JSON.parse(res.body).map { |s| s['starred_at'] }, last]
  end

  def last_page_number(repo)
    _events, last = fetch_page(repo, 1)
    last || 1
  end

  # Walks pages newest to oldest, yielding [page_number, events]. The caller breaks when it has enough.
  def each_page_backwards(repo)
    last = last_page_number(repo)
    last.downto(1) do |page|
      events, = fetch_page(repo, page)
      yield page, events
    end
  end

  # ISO timestamps -> { 'YYYY-MM-DD' => ['HH:MM:SS', ...] } (sorted)
  def by_day(events)
    events.group_by { |t| t[0, 10] }.transform_values { |evs| evs.map { |t| t[11, 8] }.sort }
  end

  # --- first sync: everything ------------------------------------------------

  def backfill(repo, total, today, before_calls)
    events = []
    each_page_backwards(repo) { |_page, evs| events.concat(evs) }
    return { repo: repo, mode: :no_stars, api_calls: @api_calls - before_calls, days_changed: 0, total: total } if events.empty?

    days = by_day(events)
    delta = events.size - total
    text = +"---\nrepo: #{repo}\nsynced_through: '#{today}'\nlast_full_resync: '#{today}'\nunaligned_delta: #{delta}\n"
    text << "observed:\n  '#{today}': #{total}\nstars:\n"
    days.sort.each { |day, evs| text << render_day(day, evs) }
    FileUtils.mkdir_p(File.dirname(path_for(repo)))
    write_checked(path_for(repo), text)
    { repo: repo, mode: :backfill, api_calls: @api_calls - before_calls, days_changed: days.size, total: total }
  end

  # --- recent window ---------------------------------------------------------

  def recent_window_changes(repo, data, _total)
    cutoff = (Date.parse(data['synced_through']) - SETTLE_DAYS).to_s
    fresh = []
    each_page_backwards(repo) do |_page, evs|
      fresh.concat(evs)
      break if evs.empty? || evs.first[0, 10] < cutoff
    end
    fresh_days = by_day(fresh.select { |t| t[0, 10] >= cutoff })
    stored_days = data['stars'].select { |d, _| d >= cutoff }
    changed = {}
    (fresh_days.keys | stored_days.keys).each do |day|
      changed[day] = fresh_days[day] || [] if fresh_days[day] != stored_days[day]
    end
    changed
  end

  # --- monthly resync, gated -------------------------------------------------

  def monthly_resync_due?(data, today)
    data['last_full_resync'].to_s[0, 7] != today[0, 7]
  end

  # Gate 2: walk back a month at a time; stop as soon as the totals realign. Gives up (accepting the result and
  # recording the leftover delta) only when it has gone all the way back to the first star.
  def full_resync(repo, content, total, today)
    prior = YAML.safe_load(content)['unaligned_delta'].to_i
    aligned = ->(c) { c == total || c == total + prior }
    acc = []
    replaced = {}
    realigned = false
    catch(:done) do
      each_page_backwards(repo) do |page, evs|
        acc.concat(evs)
        oldest = evs.first && evs.first[0, 7]
        # every month newer than the oldest one on this page is fully read; on page 1 all of them are
        complete = acc.map { |t| t[0, 7] }.uniq.select { |m| page == 1 || (oldest && m > oldest) } - replaced.keys
        complete.sort.reverse.each do |m|
          content = replace_month(content, m, by_day(acc.select { |t| t[0, 7] == m }))
          replaced[m] = true
          if aligned.call(count_events(YAML.safe_load(content)))
            realigned = true
            throw :done
          end
        end
      end
    end
    content = set_scalar(content, 'last_full_resync', today)
    delta = count_events(YAML.safe_load(content)) - total
    content = set_scalar(content, 'unaligned_delta', delta.to_s)
    [content, realigned ? :resync_realigned : :resync_full]
  end

  def replace_month(content, month, days)
    data = YAML.safe_load(content)
    stored = data['stars'].select { |d, _| d.start_with?(month) }
    changed = {}
    (days.keys | stored.keys).each { |d| changed[d] = days[d] || [] if days[d] != stored[d] }
    changed.empty? ? content : apply_day_changes(content, data, changed)
  end

  # --- structural edits (ast-crispr-yaml-psych) ------------------------------

  def render_day(day, events)
    "  '#{day}': [#{events.map { |t| "'#{t}'" }.join(', ')}]\n"
  end

  def count_events(data)
    data['stars'].values.sum(&:size)
  end

  # days => events for that day; an empty array deletes the day.
  def apply_day_changes(content, data, changes)
    existing = data['stars'].keys.sort
    changes.sort.each do |day, events|
      target = Selectors.mapping_entry(path: ['stars', day])
      if existing.include?(day)
        result = if events.empty?
                   Ast::Crispr::Delete.result(content: content, target: target)
                 else
                   Ast::Crispr::Replace.result(content: content, target: target, replacement: render_day(day, events))
                 end
        raise "star_history edit failed for #{day}: #{result.error}" unless result.success?

        content = result.updated_content
        existing.delete(day) if events.empty?
      elsif events.any?
        prev = existing.select { |d| d < day }.last
        args = { content: content, text: render_day(day, events), if_missing: :append }
        args[:destination] = after_entry(['stars', prev]) if prev
        result = Ast::Crispr::Insert.result(**args)
        raise "star_history insert failed for #{day}: #{result.error}" unless result.success?

        content = result.updated_content
        existing << day
        existing.sort!
      end
    end
    content.gsub(/\n{2,}/, "\n") # the tool separates inserted entries with a blank line; every value here is single-line
  end

  # A destination selector for Insert: the mapping entry at +path+, used as the anchor to insert after. The YAML
  # selectors only locate entries, so the anchor callable (which Insert needs) is supplied here.
  def after_entry(path)
    base = Selectors.mapping_entry(path: path)
    Ast::Crispr::OwnerSelector.new(id: "after_#{path.join('.')}", locate: base.locate, owned_span: base.owned_span,
                                   anchor: ->(_context, match) { AnchorPoint.new(match) }, limit: base.limit,
                                   metadata: base.metadata)
  end

  def set_scalar(content, key, value)
    text = "#{key}: #{value.to_s.match?(/\A-?\d+\z/) ? value : "'#{value}'"}\n"
    result = Ast::Crispr::Replace.result(content: content, target: Selectors.mapping_entry(path: [key]), replacement: text)
    raise "star_history #{key} edit failed: #{result.error}" unless result.success?

    result.updated_content
  end

  def set_observed(content, day, total)
    data = YAML.safe_load(content)
    obs = data['observed'] || {}
    return content if obs[day] == total

    text = "  '#{day}': #{total}\n"
    if obs.key?(day)
      result = Ast::Crispr::Replace.result(content: content, target: Selectors.mapping_entry(path: ['observed', day]), replacement: text)
    else
      prev = obs.keys.sort.last
      result = Ast::Crispr::Insert.result(content: content, text: text, destination: after_entry(['observed', prev]))
    end
    raise "star_history observed edit failed: #{result.error}" unless result.success?

    result.updated_content.gsub(/\n{2,}/, "\n")
  end

  # Re-parse and validate before touching the file: valid YAML, required keys, sorted ISO timestamps per day.
  def write_checked(path, content)
    data = YAML.safe_load(content)
    raise 'star_history: missing keys' unless %w[repo synced_through last_full_resync observed stars].all? { |k| data.key?(k) }
    data['stars'].each do |day, evs|
      raise "star_history: bad day #{day}" unless day.match?(/\A\d{4}-\d{2}-\d{2}\z/) && evs.is_a?(Array) && evs.all? { |t| t.match?(TIME) }
    end
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, content.end_with?("\n") ? content : "#{content}\n")
  end
end
