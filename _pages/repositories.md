---
layout: page
permalink: /repositories/
title: Software
meta_description: Open-source software by Xin Liu and collaborators for computational optics, diffraction modeling, and optical field simulation.
schema_type: CollectionPage
math: false
publication_badges: false
nav: true
nav_order: 3
---

{% if site.data.repositories.github_users %}

{% if site.github_stats.enabled %}

## GitHub users

<div class="repositories d-flex flex-wrap flex-md-row flex-column justify-content-between align-items-center">
  {% for user in site.data.repositories.github_users %}
    {% include repository/repo_user.liquid username=user %}
  {% endfor %}
</div>

---

{% endif %}

{% if site.repo_trophies.enabled %}
{% for user in site.data.repositories.github_users %}
{% if site.data.repositories.github_users.size > 1 %}

  <h4>{{ user }}</h4>
  {% endif %}
  <div class="repositories d-flex flex-wrap flex-md-row flex-column justify-content-between align-items-center">
  {% include repository/repo_trophies.liquid username=user %}
  </div>

---

{% endfor %}
{% endif %}
{% endif %}

{% if site.data.repositories.github_repos %}

## GitHub Repositories

<div class="repositories d-flex flex-wrap flex-md-row flex-column align-items-stretch">
  {% for repo in site.data.repositories.github_repos %}
    {% assign repository_parts = repo.repository | split: '/' %}
    {% assign repository_owner = repository_parts[0] %}
    {% assign repository_name = repository_parts[1] %}
    <div class="repo p-2">
      <a
        class="repository-card"
        href="https://github.com/{{ repo.repository }}"
        aria-label="Open {{ repo.repository }} on GitHub"
      >
        <h3 class="repository-heading">
          <span class="repository-owner">{{ repository_owner }}/</span><span class="repository-name">{{ repository_name }}</span>
        </h3>
        {% if repo.description and repo.description != empty %}
          <p class="repository-description">{{ repo.description }}</p>
        {% endif %}
        <div class="repository-meta">
          {% if repo.language and repo.language != empty %}
            <span class="repository-language">{{ repo.language }}</span>
          {% endif %}
          <span class="repository-stat">
            {{ repo.stars }} {% if repo.stars == 1 %}star{% else %}stars{% endif %}
          </span>
          <span class="repository-stat">
            {{ repo.forks }} {% if repo.forks == 1 %}fork{% else %}forks{% endif %}
          </span>
        </div>
      </a>
    </div>
  {% endfor %}
</div>
{% endif %}
