---
layout: default
title: Kyle Beck - Musician & Developer
---


<input type="text" id="search-input" onkeyup="filterProjects()" placeholder="Search projects..." style="width: 100%; padding: 12px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;">

## Projects

<ul id="project-list" style="list-style-type: none; padding: 0;">
  <li>
    <h3>🎹 <a href="/plus3-doremidi-guide/">Endorphin.es Plus 3 + DOREMIDI Guide</a></h3>
    <p>A complete configuration guide for connecting the <strong>Endorphin.es Plus 3</strong> expression pedal to software synthesizers using the <strong>DOREMIDI MPC-10</strong>.</p>
  </li>
</ul>

<script>
function filterProjects() {
  var input, filter, ul, li, a, i, txtValue;
  input = document.getElementById('search-input');
  filter = input.value.toUpperCase();
  ul = document.getElementById("project-list");
  li = ul.getElementsByTagName('li');

  for (i = 0; i < li.length; i++) {
    a = li[i].getElementsByTagName("a")[0];
    txtValue = a.textContent || a.innerText;
    if (txtValue.toUpperCase().indexOf(filter) > -1) {
      li[i].style.display = "";
    } else {
      li[i].style.display = "none";
    }
  }
}
</script>

<br>

<div style="text-align: center;">
  <a href="https://buymeacoffee.com/kylebeck" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
</div>
