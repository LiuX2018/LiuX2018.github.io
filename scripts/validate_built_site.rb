# frozen_string_literal: true

require "cgi"
require "json"
require "nokogiri"
require "uri"
require "yaml"

source_root = File.expand_path("..", __dir__)
site_directory = File.expand_path(ENV.fetch("SITE_DIR", "_site"), source_root)
origin = "https://liux2018.github.io"
pages = {
  "/" => "index.html",
  "/news/" => "news/index.html",
  "/publications/" => "publications/index.html",
  "/repositories/" => "repositories/index.html"
}
errors = []
descriptions = []

news_files = Dir[File.join(source_root, "_news", "*.md")]
bibliography_source = File.read(File.join(source_root, "_bibliography", "papers.bib"))
publication_count = bibliography_source.scan(/^@\w+\s*[{(]/).length
selected_publication_count = bibliography_source.scan(/^\s*selected\s*=\s*[{\"]true[}\"]/i).length
preview_count = bibliography_source.scan(/^\s*preview\s*=\s*[{\"][^}\"]+[}\"]/i).length
repositories = YAML.safe_load(File.read(File.join(source_root, "_data", "repositories.yml")), aliases: true)
repository_entries = repositories.fetch("github_repos", [])
repository_count = repository_entries.length
repository_fields = %w[repository description language stars forks]
repository_entries.each_with_index do |entry, index|
  unless entry.is_a?(Hash)
    errors << "Software repository #{index + 1} is not a mapping"
    next
  end

  missing_fields = repository_fields - entry.keys
  errors << "Software repository #{index + 1} is missing #{missing_fields.join(', ')}" if missing_fields.any?
  identifier = entry["repository"]
  errors << "Software repository #{index + 1} has an invalid identifier" unless identifier.is_a?(String) && identifier.match?(%r{\A[^/\s]+/[^/\s]+\z})
  %w[description language].each do |field|
    value = entry[field]
    errors << "Software repository #{index + 1} #{field} must be text or null" unless value.nil? || value.is_a?(String)
  end
  %w[stars forks].each do |field|
    value = entry[field]
    errors << "Software repository #{index + 1} #{field} must be a non-negative integer" unless value.is_a?(Integer) && value >= 0
  end
end

expected_source_counts = {
  "news items" => [news_files.length, 9],
  "publications" => [publication_count, 26],
  "selected publications" => [selected_publication_count, 12],
  "publication previews" => [preview_count, 26],
  "software repositories" => [repository_count, 6]
}
expected_source_counts.each do |label, (actual, expected)|
  errors << "Source has #{actual} #{label}; expected #{expected}" unless actual == expected
end

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

  nav_labels = document.css("#navbarNav a.nav-link").map { |link| link.text.gsub("(current)", "").strip }.reject(&:empty?)
  expected_nav_labels = ["About", "Publications", "Software", "CV"]
  errors << "#{route} navigation is #{nav_labels.inspect}; expected #{expected_nav_labels.inspect}" unless nav_labels == expected_nav_labels

  html = document.to_html
  errors << "#{route} still loads MathJax" if html.match?(/mathjax/i)
  badge_scripts = html.match?(/d1bxh8uas1mnw7\.cloudfront\.net|badge\.dimensions\.ai/)
  badge_routes = ["/", "/publications/"]
  errors << "#{route} has an unexpected publication badge script" if !badge_routes.include?(route) && badge_scripts
  errors << "#{route} is missing its publication badge scripts" if badge_routes.include?(route) && !badge_scripts

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

if (homepage = documents["/"])
  homepage_selected_count = homepage.css(".publications ol.bibliography > li").length
  errors << "Homepage renders #{homepage_selected_count} selected publications; expected 12" unless homepage_selected_count == 12
  errors << "Homepage profile image is missing" unless homepage.at_css('.profile img[alt="Portrait of Xin Liu"]')
  errors << "Homepage does not preload its profile image" unless homepage.at_css('link[rel="preload"][as="image"][href*="xin_recent_photo.png"]')
end

if (news_document = documents["/news/"])
  built_news_count = news_document.css(".news table tr").length
  errors << "News page renders #{built_news_count} items; expected 9" unless built_news_count == 9
end

if (publications_document = documents["/publications/"])
  built_publication_count = publications_document.css(".publications ol.bibliography > li").length
  built_preview_count = publications_document.css(".publications img.preview, .publications video.preview").length
  errors << "Publications page renders #{built_publication_count} entries; expected 26" unless built_publication_count == 26
  errors << "Publications page renders #{built_preview_count} previews; expected 26" unless built_preview_count == 26
end

if (repositories_document = documents["/repositories/"])
  cards = repositories_document.css(".repositories .repo .repository-card")
  built_repository_count = cards.length
  errors << "Software page renders #{built_repository_count} repository cards; expected 6" unless built_repository_count == 6
  errors << "Software page must render repository cards as local HTML, not images" if repositories_document.css(".repositories .repo img").any?
  errors << "Software page still references the retired Vercel card service" if repositories_document.to_html.include?("github-readme-stats")

  repository_entries.each do |entry|
    repository = entry["repository"]
    next unless repository.is_a?(String)

    card = cards.find { |candidate| candidate["href"] == "https://github.com/#{repository}" }
    unless card
      errors << "Software page is missing the #{repository} card"
      next
    end

    errors << "#{repository} card has an incorrect accessible label" unless card["aria-label"] == "Open #{repository} on GitHub"
    heading = card.at_css(".repository-heading")&.text.to_s.gsub(/\s+/, "")
    errors << "#{repository} card has an incorrect heading" unless heading == repository

    description = entry["description"].to_s.strip
    built_description = card.at_css(".repository-description")&.text.to_s.strip
    if description.empty?
      errors << "#{repository} card renders an empty description element" if card.at_css(".repository-description")
    elsif built_description != description
      errors << "#{repository} card has an incorrect description"
    end

    language = entry["language"].to_s.strip
    built_language = card.at_css(".repository-language")&.text.to_s.strip
    if language.empty?
      errors << "#{repository} card renders an empty language element" if card.at_css(".repository-language")
    elsif built_language != language
      errors << "#{repository} card has an incorrect language"
    end

    metadata = card.at_css(".repository-meta")&.text.to_s.gsub(/\s+/, " ").strip
    star_label = entry["stars"] == 1 ? "1 star" : "#{entry['stars']} stars"
    fork_label = entry["forks"] == 1 ? "1 fork" : "#{entry['forks']} forks"
    errors << "#{repository} card is missing its star snapshot" unless metadata.include?(star_label)
    errors << "#{repository} card is missing its fork snapshot" unless metadata.include?(fork_label)
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
errors << "feed.xml was generated even though the blog is disabled" if File.exist?(File.join(site_directory, "feed.xml"))

%w[blog projects people teaching dropdown].each do |demo_route|
  errors << "/#{demo_route}/ was generated but template examples must stay removed" if File.exist?(File.join(site_directory, demo_route))
end

Dir.glob(File.join(site_directory, "**", "*"), File::FNM_DOTMATCH).select { |path| File.file?(path) }.each do |path|
  next unless File.extname(path).match?(/\A\.(?:html|css|js|json)\z/i)

  contents = File.read(path)
  errors << "#{path.delete_prefix("#{site_directory}/")} references vulnerable Swiper 10/11" if contents.match?(/swiper(?:@|\/)(?:10|11)\./i)
  errors << "#{path.delete_prefix("#{site_directory}/")} references the retired GitHub card service" if contents.include?("github-readme-stats")
end

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
