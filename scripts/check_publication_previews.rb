# frozen_string_literal: true

bibliography = File.join(__dir__, "..", "_bibliography", "papers.bib")
preview_directory = File.join(__dir__, "..", "assets", "img", "publication_preview")

preview_references = File.read(bibliography).scan(/^\s*preview\s*=\s*[{"]([^}"]+)[}"]/).flatten
local_references = preview_references.reject { |reference| reference.match?(%r{\Ahttps?://}) }
missing_references = local_references.reject { |reference| File.file?(File.join(preview_directory, reference)) }
if missing_references.empty?
  puts "Validated #{local_references.length} local publication preview files."
  exit 0
end

warn "Missing publication preview files:"
missing_references.each { |reference| warn "- #{reference}" }
exit 1
