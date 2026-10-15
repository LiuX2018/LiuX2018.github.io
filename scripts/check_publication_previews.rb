# frozen_string_literal: true

require "open3"
require "yaml"

abort "Usage: ruby scripts/check_publication_previews.rb [--write]" unless ARGV.empty? || ARGV == ["--write"]

bibliography = File.join(__dir__, "..", "_bibliography", "papers.bib")
preview_directory = File.join(__dir__, "..", "assets", "img", "publication_preview")
dimensions_file = File.join(__dir__, "..", "_data", "publication_previews.yml")

preview_references = File.read(bibliography).scan(/^\s*preview\s*=\s*[{"]([^}"]+)[}"]/).flatten
local_references = preview_references.reject { |reference| reference.match?(%r{\Ahttps?://}) }
missing_references = local_references.reject { |reference| File.file?(File.join(preview_directory, reference)) }
unless missing_references.empty?
  warn "Missing publication preview files:"
  missing_references.each { |reference| warn "- #{reference}" }
  exit 1
end

# Keep the browser's reserved aspect ratios in sync with the source images.
# Read only the first GIF frame; the animated original remains available.
dimensions = local_references.uniq.grep(/\.(?:png|jpe?g|gif|tiff)\z/i).sort.to_h do |reference|
  output, status = Open3.capture2("identify", "-ping", "-format", "%w %h", "#{File.join(preview_directory, reference)}[0]")
  abort "Could not read dimensions for #{reference}" unless status.success? && output.match?(/\A[1-9]\d* [1-9]\d*\z/)

  width, height = output.split.map(&:to_i)
  [reference, { "width" => width, "height" => height }]
end

if ARGV == ["--write"]
  File.write(dimensions_file, YAML.dump(dimensions))
elsif !File.file?(dimensions_file) || YAML.safe_load(File.read(dimensions_file)) != dimensions
  abort "Publication preview dimensions are stale. Run ruby scripts/check_publication_previews.rb --write"
end

puts "Validated #{local_references.length} local publication preview files and their dimensions."
