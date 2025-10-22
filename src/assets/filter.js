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
      // Reflect filter state on the parent <details> so the summary-control can look active
      updateDetailsActiveState();
    });

    // Pointerdown (unified for mouse/pen/touch) for snappy responses on
    // touch devices. We set a short flag so the following synthetic click
    // (if any) is ignored to avoid duplicate actions.
    // Updated behavior: for touch pointers, don't toggle immediately on
    // pointerdown because a touch that starts a scroll should not toggle
    // the filter. Instead, track pointer movement and only toggle on
    // pointerup if movement is within a small threshold. For mouse/pen,
    // keep the original immediate toggle for snappy response.
    link.addEventListener('pointerdown', function(e) {
      // Only handle primary button (left-click) to avoid interfering with right-click context menu
      if (e.button !== 0) return;

      const el = this;

      // If not a touch pointer, behave as before (immediate toggle)
      if (e.pointerType !== 'touch') {
        el.dataset._handledPointer = '1';
        el.classList.toggle('active');
        filterProjects();
        // Keep summary visuals in sync
        updateDetailsActiveState();
        setTimeout(() => { try { delete el.dataset._handledPointer; } catch (err) {} }, 500);
        return;
      }

      // For touch: track movement and only treat as a tap if the touch
      // doesn't move beyond the threshold.
      const startX = e.clientX;
      const startY = e.clientY;
      const pointerId = e.pointerId;

      const MOVE_THRESHOLD = 6; // pixels — stricter: small movements cancel the tap
      let cancelled = false;

      function cleanup() {
        document.removeEventListener('pointermove', onMove, { passive: true });
        document.removeEventListener('pointerup', onUp, { passive: true });
        document.removeEventListener('pointercancel', onUp, { passive: true });
      }

      function onMove(ev) {
        if (ev.pointerId !== pointerId) return;
        // Directional threshold: treat primarily vertical movement as a
        // scroll. Small horizontal movement (e.g. when a horizontal tag
        // list is scrolled) won't cancel an intended tap.
        const dy = Math.abs(ev.clientY - startY);
          // Consider this a vertical scroll/drag — cancel the pending tap
        if (dy > MOVE_THRESHOLD) {
          cancelled = true;
          cleanup();
        }
      }

      function onUp(ev) {
        if (ev.pointerId !== pointerId) return;
        cleanup();
        if (!cancelled) {
          // Treat as an intentional tap: toggle and mark handled so the
          // subsequent synthetic click is ignored by the click handler.
          el.dataset._handledPointer = '1';
          el.classList.toggle('active');
          filterProjects();
          updateDetailsActiveState();
          setTimeout(() => { try { delete el.dataset._handledPointer; } catch (err) {} }, 500);
        }
      }

      // Listen globally so we still observe move/up even if the finger
      // moves off the element during the gesture.
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerup', onUp, { passive: true });
      document.addEventListener('pointercancel', onUp, { passive: true });

    }, { passive: true });
  });

  // Ensure each <details> knows whether any of its tag-links are active.
  function updateDetailsActiveState() {
    const filterContainer = document.querySelector('.filters');
    if (!filterContainer) return;
    const details = Array.from(filterContainer.querySelectorAll('details'));
    details.forEach(d => {
      const hasActive = !!d.querySelector('.tag-link.active[data-tag]');
      d.classList.toggle('has-active-filter', hasActive);
      // Also toggle .active on the summary-control so it inherits .pill-outer.active styles
      const summaryControl = d.querySelector('.summary-control');
      if (summaryControl) {
        summaryControl.classList.toggle('active', hasActive);
      }
    });
  }

  // Run once on load to reflect any initial active state
  updateDetailsActiveState();

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
        document.addEventListener('keydown', docKeyHandler);
        outsideHandlerAttached = true;
      }, 0);
    }

    function removeOutsideHandler() {
      if (!outsideHandlerAttached) return;
      document.removeEventListener('pointerdown', docOutsideHandler);
      document.removeEventListener('keydown', docKeyHandler);
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

    // Close the first open details on Escape and focus its summary.
    function docKeyHandler(e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      // Find the first open details (panels are mutually exclusive so usually one)
      const openDetail = details.find(d => d.open);
      if (!openDetail) return;
      // Close it and move focus back to its summary for accessibility
      openDetail.open = false;
      const summary = openDetail.querySelector('summary');
      if (summary && typeof summary.focus === 'function') {
        summary.focus();
      }
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

  // ============================================================================
  // THEME SYSTEM - Helper Utilities
  // ============================================================================

  /**
   * Extract project data from a card element's data attributes
   * @param {HTMLElement} card - The card element
   * @returns {Object} Project data object
   */
  window.getProjectDataForCard = function(card) {
    return {
      theme: card.dataset.theme || null,
      familyId: card.dataset.familyId || null,
      familyPosition: parseInt(card.dataset.familyPosition) || null,
      tags: (() => {
        try {
          return JSON.parse(card.dataset.tags || '[]');
        } catch (e) {
          return [];
        }
      })()
    };
  };

  /**
   * Apply theme-specific classes to a card
   * @param {HTMLElement} card - The card element
   * @param {string} theme - Theme name
   */
  window.applyThemeClasses = function(card, theme) {
    // Remove any existing theme classes
    const themeClasses = ['theme-adopt-me', 'theme-update-me', 'theme-avoid-me', 'theme-family', 'theme-holiday'];
    themeClasses.forEach(cls => card.classList.remove(cls));

    // Add new theme class if specified
    if (theme) {
      card.classList.add('theme-' + theme);
    }
  };

  /**
   * Initialize theme-specific features
   */
  function initThemes() {
    const themedCards = document.querySelectorAll('.card[data-theme]');

    themedCards.forEach(card => {
      const projectData = window.getProjectDataForCard(card);

      // Theme-specific initialization can be added here
      // For now, this is a placeholder for future theme features

      if (projectData.theme) {
        console.log('Initialized theme:', projectData.theme, 'for card');
      }
    });

    // Initialize family stacks
    initFamilyStacks();
  }

  // ============================================================================
  // PHASE 4: FAMILY THEME - Stacked Cards Interaction
  // ============================================================================

  /**
   * Initialize family stack interactions
   * Sets up hover effects and dynamic width calculations for family card stacks
   * Fully dynamic - supports any number of cards (tested up to 20+)
   */
  function initFamilyStacks() {
    const familyStacks = document.querySelectorAll('.card-family-stack');

    if (!familyStacks.length) return;

    familyStacks.forEach(stack => {
      const cards = stack.querySelectorAll('.card-in-family');
      const familySize = parseInt(stack.dataset.familySize) || cards.length;

      // Get CSS variable values
      const cardWidth = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--card-width')) || 450;
      const overlap = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--family-overlap')) || 0.15;

      // Calculate and set the stack container width dynamically
      setFamilyStackWidth(stack, familySize, cardWidth, overlap);

      // Position each card dynamically with decreasing z-index
      cards.forEach((card, index) => {
        // Position: each card offset by (cardWidth * overlap * index)
        const leftPosition = cardWidth * overlap * index;
        card.style.left = `${leftPosition}px`;

        // Ensure consistent top alignment for all cards
        card.style.top = '0';

        // Z-index: first card highest (100), decreasing for each subsequent card
        const zIndex = 100 - index;
        card.style.zIndex = zIndex;

        // First card should be relative, others absolute
        if (index === 0) {
          card.style.position = 'relative';
        } else {
          card.style.position = 'absolute';
        }

        // Apply opacity fade to all cards behind the front card
        // Front card (index 0): full opacity (1.0)
        // Cards behind: fade from 0.7 down to 0.6 for very deep stacks
        if (index === 0) {
          card.style.opacity = '1.0';
        } else {
          // Cards 1-3: 0.7 opacity
          // Cards 4+: gradually fade to 0.6
          const baseOpacity = 0.7;
          const minOpacity = 0.6;
          if (index <= 3) {
            card.style.opacity = baseOpacity.toString();
          } else {
            const fadeStep = (baseOpacity - minOpacity) / Math.max(familySize - 3, 10);
            const opacity = Math.max(minOpacity, baseOpacity - ((index - 3) * fadeStep));
            card.style.opacity = opacity.toString();
          }
        }

        // Set up hover interactions for each card
        // Hover: lift card and push subsequent cards
        card.addEventListener('mouseenter', () => {
          handleFamilyCardHover(stack, index, cardWidth);
        });

        // Mouse leave: reset all cards in this stack
        card.addEventListener('mouseleave', () => {
          resetFamilyStack(stack);
        });

        // Keyboard navigation: focus state triggers same visual as hover
        card.addEventListener('focus', () => {
          handleFamilyCardHover(stack, index, cardWidth);
        }, true);

        card.addEventListener('blur', () => {
          resetFamilyStack(stack);
        }, true);
      });
    });
  }

  /**
   * Calculate and set the width of a family stack container
   * Formula: card_width + (family_size - 1) * card_width * overlap
   * @param {HTMLElement} stack - The family stack container
   * @param {number} familySize - Number of cards in the family
   * @param {number} cardWidth - Width of each card in pixels
   * @param {number} overlap - Overlap percentage (0.15 = 15%)
   */
  function setFamilyStackWidth(stack, familySize, cardWidth, overlap) {
    // Calculate total width
    const totalWidth = cardWidth + ((familySize - 1) * cardWidth * overlap);

    // Set the container width
    stack.style.width = `${totalWidth}px`;
  }

  /**
   * Handle hover on a family card - bring to top and expand
   * The hovered card rises to the top of the stack and lifts up
   * All non-hovered cards are faded
   * @param {HTMLElement} stack - The family stack container
   * @param {number} hoveredIndex - Index of the hovered card
   * @param {number} cardWidth - Width of each card in pixels
   */
  function handleFamilyCardHover(stack, hoveredIndex, cardWidth) {
    const cards = stack.querySelectorAll('.card-in-family');
    const familySize = cards.length;

    // Adaptive expansion: smaller push for larger families
    // Small families (2-5): 10% push
    // Medium families (6-10): 7% push
    // Large families (11+): 5% push
    let expansionPercent = 0.10;
    if (familySize >= 11) {
      expansionPercent = 0.05;
    } else if (familySize >= 6) {
      expansionPercent = 0.07;
    }

    cards.forEach((card, index) => {
      if (index === hoveredIndex) {
        // Hovered card: bring to top (z-index 200), lift up, full brightness
        card.style.zIndex = '200';
        card.style.transform = 'translateY(-12px)';
        card.style.opacity = '1.0';
        // Add stronger shadow for lifted card
        card.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.3)';
      } else {
        // All other cards: fade to indicate they're not active
        card.style.opacity = '0.7';

        if (index > hoveredIndex) {
          // Cards after the hovered card: shift right to reveal space
          const additionalOffset = cardWidth * expansionPercent;
          card.style.transform = `translateX(${additionalOffset}px)`;
        }
      }
      // Cards before the hovered card: no transform change (stay in their positions)
    });
  }

  /**
   * Reset all cards in a family stack to their default positions
   * Restores original stacking order and opacity fade
   * @param {HTMLElement} stack - The family stack container
   */
  function resetFamilyStack(stack) {
    const cards = stack.querySelectorAll('.card-in-family');
    const familySize = cards.length;

    cards.forEach((card, index) => {
      // Reset transform
      card.style.transform = '';
      // Reset z-index to original stacking order (highest = first card)
      card.style.zIndex = (100 - index).toString();
      // Reset box-shadow
      card.style.boxShadow = '';

      // Restore original opacity fade: front card full brightness, back cards faded
      if (index === 0) {
        card.style.opacity = '1.0';
      } else {
        // Same fade pattern as initialization
        const baseOpacity = 0.7;
        const minOpacity = 0.6;
        if (index <= 3) {
          card.style.opacity = baseOpacity.toString();
        } else {
          const fadeStep = (baseOpacity - minOpacity) / Math.max(familySize - 3, 10);
          const opacity = Math.max(minOpacity, baseOpacity - ((index - 3) * fadeStep));
          card.style.opacity = opacity.toString();
        }
      }
    });
  }

  // Initialize themes on page load
  initThemes();

});
