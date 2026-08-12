# frozen_string_literal: true

require "json"
require "net/http"
require "tempfile"
require "uri"
require "yaml"

module RepositoryData
  class RefreshError < StandardError; end

  class GitHubClient
    def initialize(token:, api_url: "https://api.github.com")
      @token = token
      @api_url = api_url.delete_suffix("/")
    end

    def fetch(repository)
      path = repository.split("/", 2).map { |segment| URI.encode_www_form_component(segment) }.join("/")
      uri = URI("#{@api_url}/repos/#{path}")
      request = Net::HTTP::Get.new(uri)
      request["Accept"] = "application/vnd.github+json"
      request["Authorization"] = "Bearer #{@token}"
      request["User-Agent"] = "LiuX2018.github.io repository refresh"
      request["X-GitHub-Api-Version"] = "2022-11-28"

      response = Net::HTTP.start(
        uri.host,
        uri.port,
        use_ssl: uri.scheme == "https",
        open_timeout: 10,
        read_timeout: 10
      ) { |http| http.request(request) }
      raise RefreshError, "GitHub returned HTTP #{response.code} for #{repository}" unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body)
    rescue JSON::ParserError => error
      raise RefreshError, "GitHub returned invalid JSON for #{repository}: #{error.message}"
    end
  end

  class Refresher
    def initialize(path:, client:, output: $stdout, error: $stderr)
      @path = File.expand_path(path)
      @client = client
      @output = output
      @error = error
    end

    def refresh
      data = YAML.safe_load_file(@path, aliases: true)
      repositories = data.fetch("github_repos")
      raise RefreshError, "github_repos must be an array" unless repositories.is_a?(Array)

      refreshed = repositories.map do |entry|
        raise RefreshError, "each github_repos entry must be a mapping" unless entry.is_a?(Hash)

        repository = entry.fetch("repository")
        validate_repository!(repository)
        normalize(repository, @client.fetch(repository))
      end

      atomic_write(data.merge("github_repos" => refreshed))
      @output.puts("Refreshed #{refreshed.length} GitHub repository snapshots.")
      true
    rescue StandardError => error
      @error.puts("Repository refresh skipped; using checked-in snapshots: #{error.message}")
      false
    end

    private

    def validate_repository!(repository)
      return if repository.is_a?(String) && repository.match?(%r{\A[^/\s]+/[^/\s]+\z})

      raise RefreshError, "invalid repository identifier #{repository.inspect}"
    end

    def normalize(repository, payload)
      raise RefreshError, "GitHub response for #{repository} must be an object" unless payload.is_a?(Hash)

      full_name = payload["full_name"]
      unless full_name.is_a?(String) && full_name.casecmp?(repository)
        raise RefreshError, "GitHub response identity mismatch for #{repository}"
      end

      description = optional_text(payload["description"], "description", repository)
      language = optional_text(payload["language"], "language", repository)
      stars = count(payload["stargazers_count"], "stargazers_count", repository)
      forks = count(payload["forks_count"], "forks_count", repository)

      {
        "repository" => repository,
        "description" => description,
        "language" => language,
        "stars" => stars,
        "forks" => forks
      }
    end

    def optional_text(value, field, repository)
      return nil if value.nil?
      raise RefreshError, "#{field} for #{repository} must be text or null" unless value.is_a?(String)

      value = value.strip
      value.empty? ? nil : value
    end

    def count(value, field, repository)
      return value if value.is_a?(Integer) && value >= 0

      raise RefreshError, "#{field} for #{repository} must be a non-negative integer"
    end

    def atomic_write(data)
      directory = File.dirname(@path)
      tempfile = Tempfile.new(["repositories", ".yml"], directory)
      temporary_path = tempfile.path
      begin
        tempfile.write(YAML.dump(data))
        tempfile.flush
        tempfile.fsync
        File.chmod(File.stat(@path).mode & 0o777, temporary_path)
        tempfile.close
        File.rename(temporary_path, @path)
      ensure
        tempfile.close unless tempfile.closed?
        File.unlink(temporary_path) if File.exist?(temporary_path)
      end
    end
  end
end

if $PROGRAM_NAME == __FILE__
  token = ENV.fetch("GITHUB_TOKEN", "")
  if token.empty?
    warn "Repository refresh skipped; GITHUB_TOKEN is not set."
    exit 0
  end

  path = File.expand_path("../_data/repositories.yml", __dir__)
  client = RepositoryData::GitHubClient.new(token: token, api_url: ENV.fetch("GITHUB_API_URL", "https://api.github.com"))
  RepositoryData::Refresher.new(path: path, client: client).refresh
end
