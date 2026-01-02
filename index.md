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
    <h3><a href="/z3-modal-generator.html">Zebra 3 Modal Generator</a></h3>
    <p>A physics-based tool to generate specific <strong>Modal Resonator</strong> profiles for U-He Zebra 3 from natural language descriptions.</p>
  </li>
  <li>
    <h3><a href="/z3-webgpu.html">Zebra 3 Gen (WebGPU Prototype)</a></h3>
    <p>Experimental <strong>AI-Powered</strong> generator running locally on your GPU. Semantic understanding for complex requests.</p>
  </li>
  <li>
    <h3><a href="/uhm-generator.html">Hive 2 UHM Generator</a></h3>
    <p>Generate wavetable scripts for <strong>u-he Hive 2</strong> using mathematical formulas and interpolation.</p>
  </li>
  <li>
    <h3><a href="/converter/">Tonverk Elmulti Converter</a></h3>
    <p>Convert <strong>EXS24</strong> and <strong>SFZ</strong> instruments to Tonverk format directly in your browser. No installation required.</p>
  </li>
</ul>



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

