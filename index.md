---
layout: default
title: Kyle Beck - Musician & Developer
---





## Latest Activity

<div class="activity-feed">
  {% for activity in site.data.activity limit:5 %}
  <div class="activity-item">
    <div class="activity-meta">
      <span class="activity-date">{{ activity.date | date: "%b %d, %Y" }}</span>
      <span class="activity-type type-{{ activity.type | downcase }}">{{ activity.type }}</span>
    </div>
    <h3 class="activity-title"><a href="{{ activity.url }}">{{ activity.title }}</a></h3>
    <p class="activity-desc">{{ activity.description }}</p>
  </div>
  {% endfor %}
</div>

<hr style="margin: 3rem 0; border: 0; border-top: 1px solid #eee;">




<br>

<div style="text-align: center;">
  <a href="https://buymeacoffee.com/kylebeck" target="_blank" style="display: inline-block;"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
</div>
