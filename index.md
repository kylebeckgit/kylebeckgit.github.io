---
layout: default
title: Kyle Beck - Musician & Developer
---





## Library

<ul id="library-list" style="list-style-type: none; padding: 0;">
  <li>
    <h3><a href="/plus3-doremidi-guide/">Endorphin.es Plus 3 + DOREMIDI Guide</a></h3>
    <p>A complete configuration guide for connecting the <strong>Endorphin.es Plus 3</strong> expression pedal to software synthesizers using the <strong>DOREMIDI MPC-10</strong>.</p>
  </li>
  <li>
    <h3><a href="/tonverk-presets/">Tonverk Presets</a></h3>
    <p>A collection of multisample presets for the <strong>Tonverk</strong>.</p>
  </li>
</ul>

<hr style="margin: 3rem 0; border: 0; border-top: 1px solid #eee;">

## Tools
<ul style="list-style-type: none; padding: 0;">

  <li>
    <h3><a href="/z3-webgpu.html">Zebra 3 Gen (WebGPU Prototype)</a></h3>
    <p>Experimental Modal Resonator profile generator for <strong>Zebra 3</strong>. Runs locally on your GPU (initial download required, caches for later use).</p>
  </li>
  <li>
    <h3><a href="/uhm-generator.html">Hive 2 UHM Generator</a></h3>
    <p>Experimental UHM wavetable generator for <strong>u-he Hive</strong>. Runs locally on your GPU (initial download required, caches for later use).</p>
  </li>
</ul>



<hr style="margin: 3rem 0; border: 0; border-top: 1px solid #eee;">

## New Stuff

<div class="activity-feed">
  {% assign sorted_activity = site.data.activity | sort: 'date' | reverse %}

  {% for activity in sorted_activity limit:5 %}
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

