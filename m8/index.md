---
layout: default
title: M8 Themes
---

# M8 Themes

Custom themes for the Dirtywave M8 Tracker.

{% for category in site.data.m8_themes %}
## {{ category.category }}

{% for item in category.items %}
- [{{ item.name }}]({{ item.url }}){% if item.description %} - {{ item.description }}{% endif %}
{% endfor %}

{% endfor %}
