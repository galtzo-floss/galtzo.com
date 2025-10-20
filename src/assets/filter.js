// Filter behavior moved to an external file so it is always emitted into output
// and does not depend on inline scripts being preserved by the templating
// pipeline. It reads JSON from the card's data-tags attribute with a
// comma-separated fallback for backward compatibility.

document.addEventListener('DOMContentLoaded', function() {
  // Only consider controls that have a data-tag attribute as actual
  // filter controls. Elements that share the visual class but omit
  // data-tag will not be treated as filter controls.
  const tagLinks = document.querySelectorAll('.tag-link[data-tag]');
  const cards = document.querySelectorAll('.card');

  // Nothing to filter
  if (!tagLinks.length) return;
  if (!cards.length) return;

  tagLinks.forEach(link => {
    // Click handler (keyboard/mouse activation)
    link.addEventListener('click', function(e) {
      if (this.dataset._handledPointer === '1') {
        delete this.dataset._handledPointer;
        return;
      }

      this.classList.toggle('active');
      filterProjects();
    });

    // Pointerdown (unified for mouse/pen/touch) for snappy responses on
    // touch devices. We set a short flag so the following synthetic click
    // (if any) is ignored to avoid duplicate actions.
    link.addEventListener('pointerdown', function(e) {
      this.dataset._handledPointer = '1';
      this.classList.toggle('active');
      filterProjects();
      setTimeout(() => { try { delete this.dataset._handledPointer; } catch (e) {} }, 500);
    }, { passive: true });
  });

  function parseCardTags(card) {
    var cardTags = [];
    var raw = card.dataset.tags;
    if (!raw) raw = '[]';
    try {
      cardTags = JSON.parse(raw);
      cardTags = cardTags.map(function(t) { return String(t).trim(); }).filter(function(t) { return t.length > 0; });
    } catch (e) {
      raw = card.dataset.tags || '';
      cardTags = raw.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t.length > 0; });
    }
    return cardTags;
  }

  function filterProjects() {
    var activeTags = Array.from(document.querySelectorAll('.tag-link.active[data-tag]')).map(function(link) { return link.dataset.tag; });
    cards.forEach(function(card) {
      var cardTags = parseCardTags(card);
      var matches = activeTags.length === 0 ? true : activeTags.every(function(tag) { return cardTags.indexOf(tag) !== -1; });
      card.style.display = matches ? '' : 'none';
    });
  }

  // Close other <details> elements when one is opened. This keeps the
  // three filter panels mutually exclusive: opening one will close the
  // others. Use minimal JS: don't animate heights or set inline sizes —
  // let CSS handle visibility (panels are absolutely positioned overlays).
  (function() {
    const filterContainer = document.querySelector('.filters');
    if (!filterContainer) return;
    const details = Array.from(filterContainer.querySelectorAll('details'));
    if (details.length <= 1) return;

    // Store outside-click handlers so we can remove them when panels close
    // const outsideHandlers = new WeakMap();

    // Global outside-click handler: attach once (after the open event tick)
    // and close any open details when clicking/tapping outside of them.
    let outsideHandlerAttached = false;
    function positionPanel(detail) {
      const panel = detail.querySelector('.tag-list');
      if (!panel) return;
      // Panel is displayed via CSS when detail.open is true. Use rAF so
      // measurements occur after layout and the panel is rendered.
      requestAnimationFrame(() => {
        const rect = panel.getBoundingClientRect();
        const pad = 8; // small padding from viewport edge
        // If the panel's right edge would overflow the viewport, align to the right
        if (rect.right > window.innerWidth - pad) {
          detail.classList.add('align-right');
        } else {
          detail.classList.remove('align-right');
        }
      });
    }

    function ensureOutsideHandler() {
      if (outsideHandlerAttached) return;
      // Attach after a tick so the pointerdown that opened the panel doesn't
      // immediately trigger the handler and close it.
      setTimeout(() => {
        document.addEventListener('pointerdown', docOutsideHandler);
        outsideHandlerAttached = true;
      }, 0);
    }

    function removeOutsideHandler() {
      if (!outsideHandlerAttached) return;
      document.removeEventListener('pointerdown', docOutsideHandler);
      outsideHandlerAttached = false;
    }

    function docOutsideHandler(e) {
      // If the event target is inside any open detail, do nothing.
      for (const d of details) {
        if (d.open && d.contains(e.target)) return;
      }
      // Otherwise close all open details and remove the handler.
      details.forEach(d => { if (d.open) d.open = false; });
      removeOutsideHandler();
    }

    // When a <details> toggles open, close the rest, position the panel,
    // and attach an outside-close handler. When it closes, clean up.
    details.forEach(detail => {
      detail.addEventListener('toggle', function() {
        if (!this.open) {
          // closed: cleanup
          // If no other detail is open, remove the global outside handler
          this.classList.remove('align-right');
          if (!details.some(d => d.open)) removeOutsideHandler();
          return;
        }

        // Close siblings
        details.forEach(other => {
          if (other !== this && other.open) other.open = false;
        });

        // Position the panel (may add .align-right)
        positionPanel(this);

        // Ensure the document-level outside handler is installed
        ensureOutsideHandler();
      });
    });

    // Recalculate alignment on resize for any open panels
    let resizeRaf = null;
    window.addEventListener('resize', function() {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        details.forEach(d => { if (d.open) positionPanel(d); });
      });
    });
  })();

});
