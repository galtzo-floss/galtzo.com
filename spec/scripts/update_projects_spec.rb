# frozen_string_literal: true

RSpec.describe ProjectUpdater do
  it "can be initialized" do
    updater = ProjectUpdater.new(auto_confirm: true, surgical_fields: ['status'])
    expect(updater).to be_a(ProjectUpdater)
  end
end
