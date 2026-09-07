# frozen_string_literal: true

require "minitest/autorun"
require "nokogiri"
require "cgi"
require_relative "../scripts/publication_intros"

class PublicationIntrosTest < Minitest::Test
  def entries(source)
    BibTeX.parse(source).entries.values
  end

  def document(items)
    Nokogiri::HTML5(%(<div class="publications"><ol class="bibliography">#{items}</ol></div>))
  end

  def row(key, text)
    %(<li><div id="#{key}"><p class="publication-intro">#{CGI.escapeHTML(text)}</p></div></li>)
  end

  def test_missing_empty_and_whitespace_intros
    ["", ", intro={}", ", intro={  \n  }", ', intro=""'].each do |field|
      bibliography = entries("@article{a, selected={true}#{field}}")
      assert_equal 1, PublicationIntros.source_errors(bibliography).length
    end
  end

  def test_unselected_intro_can_be_retained
    bibliography = entries('@article{a, selected={false}, intro={Retained text}}')
    assert_empty PublicationIntros.source_errors(bibliography)
    assert_empty PublicationIntros.render_errors(document(""), bibliography)
  end

  def test_selection_count_is_dynamic
    [0, 1, 3].each do |count|
      bibliography = entries((0...count).map { |i| "@article{p#{i}, selected={true}, intro={Text #{i}}}" }.join("\n"))
      html = document((0...count).map { |i| row("p#{i}", "Text #{i}") }.join)
      assert_empty PublicationIntros.source_errors(bibliography)
      assert_empty PublicationIntros.render_errors(html, bibliography)
    end
  end

  def test_swapped_intros_fail_even_when_counts_match
    bibliography = entries('@article{a, selected={true}, intro={First}} @article{b, selected={true}, intro={Second}}')
    errors = PublicationIntros.render_errors(document(row("a", "Second") + row("b", "First")), bibliography)
    assert_equal 2, errors.length
  end

  def test_wrong_identity_and_duplicate_identity_fail
    bibliography = entries('@article{a, selected={true}, intro={Text}}')
    refute_empty PublicationIntros.render_errors(document(row("b", "Text")), bibliography)
    refute_empty PublicationIntros.render_errors(document(row("a", "Text") * 2), bibliography)
  end

  def test_latex_punctuation_and_html_escaping
    bibliography = entries(%(@article{a, selected={true}, intro={A camera's <b>field</b> & light}}))
    html = document(row("a", "A camera’s <b>field</b> & light"))
    assert_empty PublicationIntros.render_errors(html, bibliography)
    html.at_css(".publication-intro").inner_html = "A camera’s <b>field</b> &amp; light"
    refute_empty PublicationIntros.render_errors(html, bibliography)
  end
end
