# frozen_string_literal: true

require "bibtex"

module PublicationIntros
  module_function

  def selected(entries)
    entries.select { |entry| entry[:selected].to_s == "true" }
  end

  def source_errors(entries)
    selected(entries).filter_map do |entry|
      "Selected publication #{entry.key} must have a non-empty intro" if entry[:intro].to_s.strip.empty?
    end
  end

  def normalize(text)
    text.to_s.gsub(/\s+/, " ").strip
  end

  def render_errors(document, entries)
    expected = selected(entries)
    rows = document.css(".publications ol.bibliography > li")
    intros = document.css(".publications .publication-intro")
    errors = []
    errors << "Homepage renders #{rows.length} selected publications; expected #{expected.length}" unless rows.length == expected.length
    errors << "Homepage renders #{intros.length} publication intros; expected #{expected.length}" unless intros.length == expected.length

    expected.each do |entry|
      matches = rows.select { |row| row.css("[id]").any? { |node| node["id"] == entry.key } }
      if matches.length != 1
        errors << "Homepage must render selected publication #{entry.key} exactly once"
        next
      end

      paragraphs = matches.first.css(".publication-intro")
      if paragraphs.length != 1
        errors << "#{entry.key} must render exactly one intro"
        next
      end

      paragraph = paragraphs.first
      # Jekyll Scholar applies the configured latex filter before Liquid escaping.
      expected_text = normalize(entry.convert(:latex)[:intro])
      errors << "#{entry.key} has an empty or incorrect intro" if expected_text.empty? || normalize(paragraph.text) != expected_text
      errors << "#{entry.key} intro contains unescaped HTML" unless paragraph.element_children.empty?
    end
    errors
  end
end
