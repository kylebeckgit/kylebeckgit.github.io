---
layout: default
title: Kyle Beck - Musician & Developer
---





## Library

<input type="text" id="search-input" placeholder="Search library..." style="width: 100%; padding: 12px; margin-bottom: 20px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 16px; background-color: var(--code-bg); color: var(--text-color);">

<ul id="library-list" style="list-style-type: none; padding: 0;">
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
    var ul = document.getElementById("library-list");
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

<hr style="margin: 3rem 0; border: 0; border-top: 1px solid #eee;">

## Recent Updates

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


<br>

