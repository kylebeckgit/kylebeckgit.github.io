---
layout: default
title: Get in Touch
permalink: /contact/
---

<h1>Get in Touch</h1>

<form action="https://formspree.io/f/kyle@kyle-beck.com" method="POST" class="contact-form">
  <!-- Honeypot -->
  <input type="text" name="_gotcha" style="display:none" />

  <div class="form-group">
    <label for="name">Name</label>
    <input type="text" id="name" name="name" required placeholder="Your Name">
  </div>

  <div class="form-group">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" required placeholder="your.email@example.com">
  </div>

  <div class="form-group">
    <label for="message">Message</label>
    <textarea id="message" name="message" rows="5" required placeholder="What's on your mind?"></textarea>
  </div>

  <button type="submit">Send Message</button>
</form>

<style>
  .contact-form {
    max-width: 600px;
    margin-top: 2rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: var(--text-color);
  }

  input,
  textarea {
    width: 100%;
    padding: 0.75rem;
    border-radius: 6px;
    border: 1px solid rgba(0,0,0,0.2);
    background-color: rgba(255,255,255,0.8);
    color: #333;
    font-family: inherit;
    font-size: 1rem;
    transition: all 0.2s;
  }

  [data-theme="dark"] input,
  [data-theme="dark"] textarea {
    background-color: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    color: var(--text-color);
  }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--link-color);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
  }

  button {
    background-color: var(--link-color);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  button:hover {
    opacity: 0.9;
  }
</style>
