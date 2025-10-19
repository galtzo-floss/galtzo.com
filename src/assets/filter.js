// Filter behavior moved to an external file so it is always emitted into output
// and does not depend on inline scripts being preserved by the templating
// pipeline. It reads JSON from the card's data-tags attribute with a
// comma-separated fallback for backward compatibility.

document.addEventListener('DOMContentLoaded', function() {
  // Only consider tag-like controls that have a data-tag attribute as
  // actual filter controls. This lets summary header controls keep the
  // same visual styling (class="tag-link") but opt out of filtering by
  // omitting data-tag.
  const tagLinks = document.querySelectorAll('.tag-link[data-tag]');
  const cards = document.querySelectorAll('.card');

  if (!cards.length) return;

  tagLinks.forEach(link => {
    // Click handler (works for mouse and keyboard). If a pointerdown
    // already handled the interaction we ignore the synthetic click.
    link.addEventListener('click', function(e) {
      if (this.dataset._handledPointer === '1') {
        // Clear the flag and ignore the synthetic click generated after pointerdown
        delete this.dataset._handledPointer;
        return;
      }

      // Toggle the active class for filtering
      this.classList.toggle('active');
      filterProjects();

      // If this tag link is inside a <summary>, ensure the surrounding
      // <details> is opened so newly-filtered content is immediately
      // reachable. We do NOT close the details when the tag is toggled
      // off; that was making it hard to interact with the content.
      const summary = this.closest('summary');
      if (summary) {
        const details = summary.parentElement;
        if (details && details.tagName && details.tagName.toLowerCase() === 'details') {
          // Always open (do not toggle).
          details.open = true;
        }
      }
    });

    // Pointerdown handler covers mouse, pen, and touch in a single API.
    // We do not call preventDefault here so scrolling/interactions are not
    // interfered with. Set a short-lived flag so the following click event
    // is ignored (avoids duplicate handling on some devices/browsers).
    link.addEventListener('pointerdown', function(e) {
      // Mark that pointer handled the interaction; click will be ignored.
      this.dataset._handledPointer = '1';

      // Toggle state and filter immediately for snappy response on touch
      this.classList.toggle('active');
      filterProjects();

      const summary = this.closest('summary');
      if (summary) {
        const details = summary.parentElement;
        if (details && details.tagName && details.tagName.toLowerCase() === 'details') {
          details.open = true;
        }
      }

      // Clear flag shortly after to allow subsequent interactions.
      setTimeout(() => { try { delete this.dataset._handledPointer; } catch (e) {} }, 500);
    }, { passive: true });
  });

  // Open details on pointer hover (pointerenter/pointerleave) and also
  // ensure pointerdown (touch/mouse/pen) can open a details. Remember the
  // previous open state so we can restore it on pointer leave.
  const detailsElements = document.querySelectorAll('details');
  detailsElements.forEach(function(details) {
    function rememberAndOpen() {
      try {
        this.dataset._wasOpenBeforeHover = this.open ? '1' : '0';
      } catch (e) {
        // ignore dataset failures in very old browsers
      }
      this.open = true;
    }
    function restoreOnLeave() {
      try {
        var was = this.dataset._wasOpenBeforeHover;
        if (was === '1') {
          this.open = true;
        } else if (was === '0') {
          this.open = false;
        }
        delete this.dataset._wasOpenBeforeHover;
      } catch (e) {
        // ignore dataset failures
      }
    }

    // Use pointer events when available (works for mouse and pens).
    details.addEventListener('pointerenter', function() { rememberAndOpen.call(this); });
    details.addEventListener('pointerleave', function() { restoreOnLeave.call(this); });

    // Fallback for environments without pointer events; these will be no-ops
    details.addEventListener('mouseenter', function() { rememberAndOpen.call(this); });
    details.addEventListener('mouseleave', function() { restoreOnLeave.call(this); });

    // Pointerdown: allow touching/pressing the details to open it. Don't
    // call preventDefault so scrolling is preserved; this simply ensures
    // touch users can open the details quickly.
    details.addEventListener('pointerdown', function() { rememberAndOpen.call(this); }, { passive: true });

    // Accessibility: keep summary[aria-expanded] in sync when the details toggles
    details.addEventListener('toggle', function() {
      const summary = this.querySelector('summary');
      if (summary) {
        try {
          summary.setAttribute('aria-expanded', this.open ? 'true' : 'false');
        } catch (e) {
          // ignore setAttribute failures
        }
      }
    });

    // Initialize aria-expanded on load
    const initSummary = details.querySelector('summary');
    if (initSummary) {
      try { initSummary.setAttribute('aria-expanded', details.open ? 'true' : 'false'); } catch (e) {}
    }
  });

  function parseCardTags(card) {
    var cardTags = [];
    var raw = card.dataset.tags;
    if (!raw) raw = '[]';
    try {
      cardTags = JSON.parse(raw);
      // ensure all tags are strings and trimmed
      cardTags = cardTags.map(function(t) { return String(t).trim(); }).filter(function(t) { return t.length > 0; });
    } catch (e) {
      raw = card.dataset.tags;
      if (!raw) raw = '';
      cardTags = raw.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t.length > 0; });
    }
    return cardTags;
  }

  function filterProjects() {
    // Only consider active filter controls that actually have a data-tag
    // attribute. Summary header buttons without data-tag won't be
    // included even if they share the visual class.
    var activeTags = Array.from(document.querySelectorAll('.tag-link.active[data-tag]')).map(function(link) { return link.dataset.tag; });
    cards.forEach(function(card) {
      var cardTags = parseCardTags(card);
      var matches;
      if (activeTags.length === 0) {
        matches = true;
      } else {
        matches = activeTags.every(function(tag) { return cardTags.indexOf(tag) !== -1; });
      }
      card.style.display = matches ? '' : 'none';
    });
  }
});
