# frozen_string_literal: true

require "cgi"
require "nokogiri"
require "pathname"
require "uri"

source_root = File.expand_path("..", __dir__)
site_directory = File.expand_path(ENV.fetch("SITE_DIR", "_site"), source_root)
abort "Build output not found at #{site_directory}. Run a production build first." unless Dir.exist?(site_directory)

errors = []
checked = 0
html_files = Dir[File.join(site_directory, "**", "*.html")]
documents = html_files.to_h { |path| [path, Nokogiri::HTML5(File.read(path))] }

def local_target(site_directory, source_path, reference)
  path = CGI.unescape(reference.split(/[?#]/, 2).first)
  return nil if path.empty?

  target = if path.start_with?("/")
             File.join(site_directory, path.delete_prefix("/"))
           else
             File.expand_path(path, File.dirname(source_path))
           end
  target = File.join(target, "index.html") if path.end_with?("/") || File.directory?(target)
  target
end

documents.each do |source_path, document|
  source_label = Pathname(source_path).relative_path_from(Pathname(site_directory)).to_s

  document.css("a[href], link[href], script[src], img[src], source[srcset]").each do |node|
    attribute = node.name == "source" ? "srcset" : (node["src"] ? "src" : "href")
    references = if attribute == "srcset"
                   node[attribute].to_s.split(",").map { |item| item.strip.split.first }
                 else
                   [node[attribute]]
                 end

    references.compact.each do |reference|
      next if reference.empty? || reference.start_with?("#", "//", "data:", "javascript:", "mailto:", "tel:")

      uri = URI.parse(reference)
      next if uri.scheme

      target = local_target(site_directory, source_path, reference)
      next unless target

      checked += 1
      site_prefix = Pathname(site_directory).cleanpath.to_s + File::SEPARATOR
      unless Pathname(target).cleanpath.to_s.start_with?(site_prefix)
        errors << "#{source_label} references a path outside _site: #{reference}"
        next
      end
      errors << "#{source_label} references missing local resource #{reference}" unless File.file?(target)
    rescue URI::InvalidURIError
      errors << "#{source_label} contains an invalid URI: #{reference}"
    end
  end
end

if errors.empty?
  puts "Checked #{checked} local references across #{documents.length} generated HTML files."
  exit 0
end

warn "Internal-link validation failed:"
errors.uniq.each { |error| warn "- #{error}" }
exit 1
