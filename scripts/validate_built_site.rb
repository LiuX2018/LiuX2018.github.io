# frozen_string_literal: true

require "cgi"
require "json"
require "nokogiri"
require "uri"

site_directory = File.expand_path("../_site", __dir__)
origin = "https://liux2018.github.io"
pages = {
  "/" => "index.html",
  "/news/" => "news/index.html",
  "/publications/" => "publications/index.html",
  "/repositories/" => "repositories/index.html"
}
errors = []
descriptions = []

unless Dir.exist?(site_directory)
  abort "Build output not found at #{site_directory}. Run a production build first."
end

documents = pages.to_h do |route, relative_path|
  path = File.join(site_directory, relative_path)
  unless File.file?(path)
    errors << "Missing page: #{route} (#{relative_path})"
    next [route, nil]
  end

  [route, Nokogiri::HTML5(File.read(path))]
end

documents.each do |route, document|
  next unless document

  h1_count = document.css("h1").length
  errors << "#{route} has #{h1_count} H1 elements; expected 1" unless h1_count == 1

  description = document.at_css('meta[name="description"]')&.[]("content")&.strip
  errors << "#{route} has no meta description" if description.to_s.empty?
  descriptions << description unless description.to_s.empty?

  canonical = document.at_css('link[rel="canonical"]')&.[]("href")
  expected_canonical = "#{origin}#{route}"
  errors << "#{route} canonical is #{canonical.inspect}; expected #{expected_canonical}" unless canonical == expected_canonical

  json_ld_nodes = document.css('script[type="application/ld+json"]')
  errors << "#{route} has #{json_ld_nodes.length} JSON-LD blocks; expected 1" unless json_ld_nodes.length == 1
  begin
    schema = JSON.parse(json_ld_nodes.first&.text.to_s)
    if route == "/"
      graph_types = schema.fetch("@graph", []).map { |node| node["@type"] }
      %w[WebSite ProfilePage Person].each do |type|
        errors << "Homepage JSON-LD is missing #{type}" unless graph_types.include?(type)
      end
    else
      errors << "#{route} JSON-LD type is not CollectionPage" unless schema["@type"] == "CollectionPage"
      errors << "#{route} JSON-LD does not reference the homepage Person" unless schema.dig("about", "@id") == "#{origin}/#person"
      errors << "#{route} JSON-LD does not reference the WebSite" unless schema.dig("isPartOf", "@id") == "#{origin}/#website"
    end
  rescue JSON::ParserError => error
    errors << "#{route} has invalid JSON-LD: #{error.message}"
  end

  cv_links = document.css('a[aria-label="CV (PDF)"]')
  errors << "#{route} has #{cv_links.length} CV PDF navigation links; expected 1" unless cv_links.length == 1
  errors << "#{route} CV navigation does not link directly to the PDF" unless cv_links.first&.[]("href") == "/assets/pdf/CV_Xin_Liu.pdf"
  errors << "#{route} still links to /cv/" if document.css('a[href="/cv/"], a[href^="/cv/?"], a[href^="/cv/#"]').any?

  html = document.to_html
  errors << "#{route} still loads MathJax" if html.match?(/mathjax/i)
  badge_scripts = html.match?(/d1bxh8uas1mnw7\.cloudfront\.net|badge\.dimensions\.ai/)
  errors << "#{route} has an unexpected publication badge script" if route != "/publications/" && badge_scripts
  errors << "Publications is missing its badge scripts" if route == "/publications/" && !badge_scripts

  document.css("a[href], link[href], script[src], img[src], source[srcset]").each do |node|
    attribute = node.name == "source" ? "srcset" : (node["src"] ? "src" : "href")
    references = attribute == "srcset" ? node[attribute].to_s.split(",").map { |item| item.strip.split.first } : [node[attribute]]
    references.compact.each do |reference|
      next unless reference.start_with?("/") && !reference.start_with?("//")

      path = CGI.unescape(reference.split(/[?#]/, 2).first)
      target = File.join(site_directory, path.delete_prefix("/"))
      target = File.join(target, "index.html") if path.end_with?("/")
      errors << "#{route} references missing local resource #{reference}" unless File.file?(target)
    end
  end
end

errors << "Page descriptions are not unique" unless descriptions.uniq.length == pages.length

pdf_path = File.join(site_directory, "assets/pdf/CV_Xin_Liu.pdf")
if !File.file?(pdf_path)
  errors << "CV PDF is missing"
elsif File.binread(pdf_path, 4) != "%PDF"
  errors << "CV file does not have a PDF signature"
end
errors << "/cv/ was generated but must return 404" if File.exist?(File.join(site_directory, "cv"))

sitemap_path = File.join(site_directory, "sitemap.xml")
if File.file?(sitemap_path)
  sitemap = Nokogiri::XML(File.read(sitemap_path))
  sitemap.remove_namespaces!
  sitemap_urls = sitemap.xpath("//url/loc").map(&:text)
  expected_urls = pages.keys.map { |route| "#{origin}#{route}" }
  errors << "Sitemap URLs are #{sitemap_urls.inspect}; expected #{expected_urls.inspect}" unless sitemap_urls == expected_urls
  errors << "Sitemap must not contain priority or changefreq" if sitemap.xpath("//priority | //changefreq").any?
else
  errors << "sitemap.xml is missing"
end

robots_path = File.join(site_directory, "robots.txt")
robots = File.file?(robots_path) ? File.read(robots_path) : ""
errors << "robots.txt does not advertise the canonical sitemap" unless robots.include?("Sitemap: #{origin}/sitemap.xml")

Dir[File.join(site_directory, "assets/css/*.css")].each do |stylesheet|
  File.read(stylesheet).scan(/url\(([^)]+)\)/).flatten.each do |raw_reference|
    reference = raw_reference.strip.delete_prefix('"').delete_suffix('"').delete_prefix("'").delete_suffix("'")
    next if reference.empty? || reference.start_with?("data:", "http:", "https:", "//", "#")

    path = CGI.unescape(reference.split(/[?#]/, 2).first)
    target = File.expand_path(path, File.dirname(stylesheet))
    errors << "#{stylesheet.delete_prefix("#{site_directory}/")} references missing resource #{reference}" unless File.file?(target)
  end
end

if errors.empty?
  puts "Validated #{pages.length} HTML pages, their local resources, JSON-LD, sitemap, robots.txt, and CV PDF."
  exit 0
end

warn "Built-site validation failed:"
errors.each { |error| warn "- #{error}" }
exit 1
