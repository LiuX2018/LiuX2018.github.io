# frozen_string_literal: true

require "minitest/autorun"
require "stringio"
require "tmpdir"
require "yaml"
require_relative "../scripts/refresh_repositories"

class RefreshRepositoriesTest < Minitest::Test
  SOURCE_PATH = File.expand_path("../_data/repositories.yml", __dir__)

  class StubClient
    attr_reader :calls

    def initialize(responses)
      @responses = responses
      @calls = []
    end

    def fetch(repository)
      @calls << repository
      response = @responses.fetch(repository)
      raise response if response.is_a?(Exception)

      response
    end
  end

  def test_replaces_all_snapshots_after_a_complete_refresh
    with_snapshot do |path, source|
      responses = responses_for(source)
      first_repository = source.fetch("github_repos").first.fetch("repository")
      responses[first_repository]["stargazers_count"] = 101

      client = StubClient.new(responses)
      assert refresh(path, client)

      refreshed = YAML.safe_load_file(path, aliases: true)
      expected_order = source.fetch("github_repos").map { |entry| entry.fetch("repository") }
      assert_equal expected_order, client.calls
      assert_equal expected_order, refreshed.fetch("github_repos").map { |entry| entry.fetch("repository") }
      assert_equal 101, refreshed.fetch("github_repos").first.fetch("stars")
    end
  end

  def test_keeps_the_original_file_when_one_repository_fails
    with_snapshot do |path, source|
      responses = responses_for(source)
      failed_repository = source.fetch("github_repos")[2].fetch("repository")
      responses[failed_repository] = RepositoryData::RefreshError.new("temporary API failure")
      original = File.binread(path)

      refute refresh(path, responses)
      assert_equal original, File.binread(path)
    end
  end

  def test_keeps_the_original_file_when_a_response_is_invalid
    with_snapshot do |path, source|
      responses = responses_for(source)
      responses.values.last["forks_count"] = -1
      original = File.binread(path)

      refute refresh(path, responses)
      assert_equal original, File.binread(path)
    end
  end

  def test_normalizes_empty_description_and_language_to_null
    with_snapshot do |path, source|
      responses = responses_for(source)
      responses.values.first["description"] = "  "
      responses.values.first["language"] = nil

      assert refresh(path, responses)

      first = YAML.safe_load_file(path, aliases: true).fetch("github_repos").first
      assert_nil first.fetch("description")
      assert_nil first.fetch("language")
    end
  end

  private

  def with_snapshot
    Dir.mktmpdir("repository-refresh-test") do |directory|
      path = File.join(directory, "repositories.yml")
      File.write(path, File.read(SOURCE_PATH))
      yield path, YAML.safe_load_file(path, aliases: true)
    end
  end

  def responses_for(source)
    source.fetch("github_repos").to_h do |entry|
      repository = entry.fetch("repository")
      [
        repository,
        {
          "full_name" => repository,
          "description" => entry["description"],
          "language" => entry["language"],
          "stargazers_count" => entry.fetch("stars"),
          "forks_count" => entry.fetch("forks")
        }
      ]
    end
  end

  def refresh(path, responses_or_client)
    client = responses_or_client.is_a?(StubClient) ? responses_or_client : StubClient.new(responses_or_client)
    RepositoryData::Refresher.new(
      path: path,
      client: client,
      output: StringIO.new,
      error: StringIO.new
    ).refresh
  end
end
