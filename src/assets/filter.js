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
  // others.
  (function() {
    const filterContainer = document.querySelector('.filters');
    if (!filterContainer) return;
    const details = Array.from(filterContainer.querySelectorAll('details'));
    if (details.length <= 1) return;

    function getPanel(detail) {
      // Prefer a direct child .tag-list panel, fall back to any descendant
      return detail.querySelector(':scope > .tag-list') || detail.querySelector('.tag-list');
    }

    details.forEach(detail => {
      const panel = getPanel(detail);
      if (!panel) return;

      // Ensure the panel starts in a collapsed or properly-measured state
      panel.style.overflow = 'hidden';
      panel.style.maxHeight = detail.open ? panel.scrollHeight + 'px' : '0';

      // When a details toggles, animate its panel and close others
      detail.addEventListener('toggle', function() {
        // If opening, close all others first so only one is open at a time
        if (this.open) {
          details.forEach(other => {
            if (other !== this && other.open) {
              other.open = false;
              const otherPanel = getPanel(other);
              if (otherPanel) {
                // collapse other panels immediately
                otherPanel.style.maxHeight = '0';
              }
            }
          });

          // Expand this panel to its scrollHeight so the CSS max-height
          // transition animates the slide-down. After the transition
          // completes, clear maxHeight so the panel can grow/shrink
          // naturally (for accessibility/responsiveness).
          const full = panel.scrollHeight;
          panel.style.maxHeight = full + 'px';

          function onEnd() {
            if (detail.open) panel.style.maxHeight = 'none';
            panel.removeEventListener('transitionend', onEnd);
          }
          panel.addEventListener('transitionend', onEnd);
        } else {
          // Closing: snap current height then animate to 0 for a smooth collapse
          const current = panel.scrollHeight;
          // If maxHeight is 'none' (cleared after open), set it to the measured height
          panel.style.maxHeight = current + 'px';
          // Force a frame so the browser registers the starting height, then set to 0
          requestAnimationFrame(() => { panel.style.maxHeight = '0'; });
        }
      });

      // Keep open panel sizes correct when the window resizes
      window.addEventListener('resize', function() {
        if (detail.open) {
          // If maxHeight has been cleared to 'none', set it to the new height
          panel.style.maxHeight = panel.scrollHeight + 'px';
          // After a short delay, clear it again to allow natural resizing
          setTimeout(function() {
            if (detail.open) panel.style.maxHeight = 'none';
          }, 250);
        }
      });
    });
  })();

});
