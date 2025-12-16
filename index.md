---
layout: default
title: Kyle Beck - Musician & Developer
---



<input type="text" id="search-input" placeholder="Search projects..." style="width: 100%; padding: 12px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;">

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

## Projects


<ul id="project-list" style="list-style-type: none; padding: 0;">
  <li>
    <h3>🎹 <a href="/plus3-doremidi-guide/">Endorphin.es Plus 3 + DOREMIDI Guide</a></h3>
    <p>A complete configuration guide for connecting the <strong>Endorphin.es Plus 3</strong> expression pedal to software synthesizers using the <strong>DOREMIDI MPC-10</strong>.</p>
  </li>
  <li>
    <h3>🎛️ <a href="/tonverk-presets/">Tonverk Presets</a></h3>
    <p>A collection of multisample presets for the <strong>Tonverk</strong>.</p>
  </li>
</ul>

<script>
document.addEventListener("DOMContentLoaded", function() {
  var input = document.getElementById('search-input');
  input.addEventListener('keyup', function() {
    var filter = input.value.toUpperCase();
    var ul = document.getElementById("project-list");
    var li = ul.getElementsByTagName('li');

    for (var i = 0; i < li.length; i++) {
      var txtValue = li[i].textContent || li[i].innerText;
      if (txtValue.toUpperCase().indexOf(filter) > -1) {
        li[i].style.display = "";
      } else {
        li[i].style.display = "none";
      }
    }
  });
});
</script>


<br>

<div style="text-align: center;">
  <a href="https://buymeacoffee.com/kylebeck" target="_blank" style="display: inline-block;"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
</div>
