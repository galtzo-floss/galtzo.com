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

    // Check if special filters are active
    var adoptableFilterActive = activeTags.indexOf('adoptable') !== -1;
    var archivedFilterActive = activeTags.indexOf('archived') !== -1;

    // Handle regular cards (not in family stacks)
    cards.forEach(function(card) {
      // Skip cards that are inside family stacks - they'll be handled separately
      if (card.classList.contains('card-in-family')) return;

      var cardTags = parseCardTags(card);
      var matches = activeTags.length === 0 ? true : activeTags.every(function(tag) { return cardTags.indexOf(tag) !== -1; });
      card.style.display = matches ? '' : 'none';
    });

    // Handle family stacks: filter individual cards within each stack
    var familyStacks = document.querySelectorAll('.card-family-stack');
    familyStacks.forEach(function(stack) {
      var familyId = stack.getAttribute('data-family-id');
      var isAdoptableFamily = familyId === 'adoptable-family';
      var isArchivedFamily = familyId === 'archived-family';

      // Special families should be hidden by default, but shown when their filter is active
      var shouldHideSpecialFamily = false;
      if (isAdoptableFamily && !adoptableFilterActive) {
        shouldHideSpecialFamily = true;
      } else if (isArchivedFamily && !archivedFilterActive) {
        shouldHideSpecialFamily = true;
      }

      if (shouldHideSpecialFamily) {
        stack.style.display = 'none';
        return;
      }

      var familyCards = stack.querySelectorAll('.card-in-family');
      var visibleCount = 0;

      // Filter each card individually within the family stack
      familyCards.forEach(function(card) {
        var cardTags = parseCardTags(card);
        var matches = activeTags.length === 0 ? true : activeTags.every(function(tag) { return cardTags.indexOf(tag) !== -1; });

        // Hide/show individual cards based on filter match
        card.style.display = matches ? '' : 'none';

        if (matches) {
          visibleCount++;
        }
      });

      // Hide the entire family stack container only if NO cards match the filter
      // If at least one card matches, keep the stack visible (but with filtered cards)
      // For special families that are shown, use 'inline-block' to override CSS
      if (visibleCount > 0) {
        stack.style.display = (isAdoptableFamily || isArchivedFamily) ? 'inline-block' : '';
      } else {
        stack.style.display = 'none';
      }

      // Reposition visible cards to close gaps left by hidden cards
      if (visibleCount > 0) {
        repositionFamilyStack(stack);
      }
    });
  }

  /**
   * Reposition visible cards in a family stack after filtering
   * This closes gaps left by hidden cards and recalculates height
   * Adapts to mobile viewports with vertical stacking
   * @param {HTMLElement} stack - The family stack container
   */
  function repositionFamilyStack(stack) {
    var allCards = stack.querySelectorAll('.card-in-family');
    var visibleCards = Array.from(allCards).filter(function(card) {
      return card.style.display !== 'none';
    });

    if (visibleCards.length === 0) return;

    // Detect if we're on a mobile viewport
    const isMobile = window.innerWidth <= 768;

    // Get CSS variable values
    const cardWidth = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--card-width')) || 450;
    const overlap = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue(isMobile ? '--family-overlap-mobile' : '--family-overlap')) || (isMobile ? 0.25 : 0.15);
    const mobileHorizontalOffset = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--family-mobile-horizontal-offset')) || 20;
    const mobileTouchSpacing = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--family-mobile-touch-spacing')) || 60;

    // Get the role banner height for stagger calculation (desktop only)
    const roleBanner = visibleCards[0] ? visibleCards[0].querySelector('.banner-role') : null;
    const roleBannerHeight = roleBanner ? roleBanner.offsetHeight : 30;
    const staggerOffset = roleBannerHeight * 1.5;

    // Recalculate maximum height based ONLY on visible cards
    // First, temporarily clear heights to get natural content heights
    let maxVisibleHeight = 0;
    visibleCards.forEach(function(card) {
      const currentHeight = card.style.height;
      card.style.height = '';
      const naturalHeight = card.offsetHeight;
      maxVisibleHeight = Math.max(maxVisibleHeight, naturalHeight);
      // Restore the height temporarily
      if (currentHeight) card.style.height = currentHeight;
    });

    if (isMobile) {
      // MOBILE: Vertical stacking with horizontal offsets
      // Cards overlap - showing a percentage of each card with minimum 60px touch area
      let cardHeights = [];

      // Measure each visible card's natural height
      visibleCards.forEach(function(card) {
        const currentHeight = card.style.height;
        card.style.height = '';
        const naturalHeight = card.offsetHeight;
        cardHeights.push(naturalHeight);
        if (currentHeight) card.style.height = currentHeight;
      });

      // Calculate total stack height and positions
      let currentTop = 0;

      // Calculate offsets for each card
      let cardOffsets = [0]; // First card at top (0)
      let previousCardBottom = cardHeights[0]; // Bottom of first card

      for (let i = 1; i < cardHeights.length; i++) {
        // Position next card so its bottom is exactly mobileTouchSpacing (60px) below the previous card's bottom
        // Next card bottom = previous card bottom + 60px
        // Next card top = next card bottom - next card height
        const nextCardBottom = previousCardBottom + mobileTouchSpacing;
        const nextCardTop = nextCardBottom - cardHeights[i];
        cardOffsets.push(nextCardTop);
        previousCardBottom = nextCardBottom;
      }

      // Calculate total height: last card's bottom position
      const totalHeight = previousCardBottom;

      // Set stack dimensions
      stack.style.height = totalHeight + 'px';
      stack.style.width = '100%';

      // Reposition visible cards vertically with overlap
      visibleCards.forEach(function(card, visualIndex) {
        // Keep natural card height on mobile
        card.style.height = '';

        // Vertical position: use pre-calculated offset
        card.style.top = cardOffsets[visualIndex] + 'px';
        card.style.bottom = 'auto';

        // Horizontal position: three-layer wave pattern
        // Pattern: 0, 20px, 40px, 20px, 0, 20px, 40px, 20px...
        // Creates a wave where each card is offset from both neighbors
        const wavePosition = visualIndex % 4;
        let horizontalOffset = 0;
        if (wavePosition === 1 || wavePosition === 3) {
          horizontalOffset = mobileHorizontalOffset / 2; // 20px
        } else if (wavePosition === 2) {
          horizontalOffset = mobileHorizontalOffset; // 40px
        }

        card.style.left = horizontalOffset + 'px';
        card.style.right = 'auto';

        // Update z-index based on visual position
        card.style.zIndex = (100 - visualIndex).toString();

        // Apply brightness fade based on visual position
        if (visualIndex === 0) {
          card.style.filter = 'none';
        } else {
          const baseBrightness = 0.8;
          const minBrightness = 0.6;
          let brightness;
          if (visualIndex <= 3) {
            brightness = baseBrightness;
          } else {
            const fadeStep = (baseBrightness - minBrightness) / Math.max(visibleCards.length - 3, 10);
            brightness = Math.max(minBrightness, baseBrightness - ((visualIndex - 3) * fadeStep));
          }
          card.style.filter = 'brightness(' + brightness + ')';
        }
      });
    } else {
      // DESKTOP: Horizontal stacking with vertical offsets (existing behavior)
      // Reposition visible cards with continuous positioning (no gaps)
      visibleCards.forEach(function(card, visualIndex) {
        // Set all visible cards to the new maximum height (based only on visible cards)
        card.style.height = maxVisibleHeight + 'px';

        // Position based on visual index (position in the visible sequence)
        const leftPosition = cardWidth * overlap * visualIndex;
        card.style.left = leftPosition + 'px';
        card.style.right = 'auto';

        // Update z-index based on visual position
        card.style.zIndex = (100 - visualIndex).toString();

        // Three-layer vertical wave pattern
        // Pattern: 0, stagger/2, stagger, stagger/2, 0, stagger/2, stagger, stagger/2...
        // Creates a wave where each card is offset from both neighbors
        const wavePosition = visualIndex % 4;
        let verticalOffset = 0;
        if (wavePosition === 1 || wavePosition === 3) {
          verticalOffset = staggerOffset / 2;
        } else if (wavePosition === 2) {
          verticalOffset = staggerOffset;
        }
        card.style.top = verticalOffset + 'px';

        // Apply brightness fade based on visual position
        if (visualIndex === 0) {
          card.style.filter = 'none';
        } else {
          const baseBrightness = 0.8;
          const minBrightness = 0.6;
          let brightness;
          if (visualIndex <= 3) {
            brightness = baseBrightness;
          } else {
            const fadeStep = (baseBrightness - minBrightness) / Math.max(visibleCards.length - 3, 10);
            brightness = Math.max(minBrightness, baseBrightness - ((visualIndex - 3) * fadeStep));
          }
          card.style.filter = 'brightness(' + brightness + ')';
        }
      });

      // Update stack width based on number of visible cards
      const totalWidth = cardWidth + ((visibleCards.length - 1) * cardWidth * overlap);
      stack.style.width = totalWidth + 'px';
    }

    // Update stack height based on the NEW maximum height of visible cards
    const containerHeight = maxVisibleHeight + staggerOffset;
    stack.style.height = containerHeight + 'px';
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
   * Adapts to mobile viewports with vertical stacking
   */
  function initFamilyStacks() {
    const familyStacks = document.querySelectorAll('.card-family-stack');

    if (!familyStacks.length) return;

    // Detect if we're on a mobile viewport
    const isMobile = window.innerWidth <= 768;

    familyStacks.forEach(stack => {
      const cards = stack.querySelectorAll('.card-in-family');
      const familySize = parseInt(stack.dataset.familySize) || cards.length;

      // Get CSS variable values
      const cardWidth = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--card-width')) || 450;
      const overlap = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue(isMobile ? '--family-overlap-mobile' : '--family-overlap')) || (isMobile ? 0.25 : 0.15);
      const mobileHorizontalOffset = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--family-mobile-horizontal-offset')) || 20;
      const mobileTouchSpacing = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--family-mobile-touch-spacing')) || 60;

      // Calculate and set the stack container width dynamically
      setFamilyStackWidth(stack, familySize, cardWidth, overlap);

      // Get the role banner height for vertical stagger calculation
      // Role banner is typically around 28-32px, but we'll measure it
      const firstCard = cards[0];
      const roleBanner = firstCard ? firstCard.querySelector('.banner-role') : null;
      const roleBannerHeight = roleBanner ? roleBanner.offsetHeight : 30; // fallback to 30px

      // Use 1.5x the role banner height for stagger to avoid visual alignment
      // issues where card tops align perfectly with role banner bottoms
      const staggerOffset = roleBannerHeight * 1.5;

      // Calculate the maximum height of all cards in the stack
      // This ensures all cards have uniform height like in a grid row
      // We need to account for the stagger when calculating max height
      let maxHeight = 0;
      cards.forEach(card => {
        // Temporarily remove any inline height to get natural height
        const currentHeight = card.style.height;
        card.style.height = '';
        const naturalHeight = card.offsetHeight;
        maxHeight = Math.max(maxHeight, naturalHeight);
        // Restore previous height
        if (currentHeight) card.style.height = currentHeight;
      });


      if (isMobile) {
        // MOBILE: Vertical stacking with horizontal offsets
        // Cards overlap - showing a percentage of each card with minimum 60px touch area
        let cardHeights = [];

        // First, measure each card's natural height
        cards.forEach(card => {
          const currentHeight = card.style.height;
          card.style.height = '';
          const naturalHeight = card.offsetHeight;
          cardHeights.push(naturalHeight);
          if (currentHeight) card.style.height = currentHeight;
        });

        // Calculate total stack height and positions
        let currentTop = 0;

        // Calculate offsets for each card
        let cardOffsets = [0]; // First card at top (0)
        let previousCardBottom = cardHeights[0]; // Bottom of first card

        for (let i = 1; i < cardHeights.length; i++) {
          // Position next card so its bottom is exactly mobileTouchSpacing (60px) below the previous card's bottom
          // Next card bottom = previous card bottom + 60px
          // Next card top = next card bottom - next card height
          const nextCardBottom = previousCardBottom + mobileTouchSpacing;
          const nextCardTop = nextCardBottom - cardHeights[i];
          cardOffsets.push(nextCardTop);
          previousCardBottom = nextCardBottom;
        }

        // Calculate total height: last card's bottom position
        const totalHeight = previousCardBottom;

        // Set stack dimensions
        stack.style.height = `${totalHeight}px`;
        stack.style.width = '100%';

        // Position each card vertically with overlap
        cards.forEach((card, index) => {
          // Keep natural card height on mobile
          card.style.height = '';

          // Vertical position: use pre-calculated offset
          card.style.top = `${cardOffsets[index]}px`;
          card.style.bottom = 'auto';

          // Horizontal position: three-layer wave pattern
          // Pattern: 0, 20px, 40px, 20px, 0, 20px, 40px, 20px...
          // Creates a wave where each card is offset from both neighbors
          const wavePosition = index % 4;
          let horizontalOffset = 0;
          if (wavePosition === 1 || wavePosition === 3) {
            horizontalOffset = mobileHorizontalOffset / 2; // 20px
          } else if (wavePosition === 2) {
            horizontalOffset = mobileHorizontalOffset; // 40px
          }

          card.style.left = `${horizontalOffset}px`;
          card.style.right = 'auto';

          // Z-index: first card highest (100), decreasing for each subsequent card
          card.style.zIndex = 100 - index;

          card.style.position = 'absolute';

          // Apply darkening effect to cards behind the front card
          if (index === 0) {
            card.style.filter = 'none';
            // Mark first card as active
            card.classList.add('active-card');
          } else {
            const baseBrightness = 0.8;
            const minBrightness = 0.6;
            let brightness;
            if (index <= 3) {
              brightness = baseBrightness;
            } else {
              const fadeStep = (baseBrightness - minBrightness) / Math.max(familySize - 3, 10);
              brightness = Math.max(minBrightness, baseBrightness - ((index - 3) * fadeStep));
            }
            card.style.filter = `brightness(${brightness})`;
          }

          // Add hover overlay and "Click to View" message to each card
          if (!card.querySelector('.card-hover-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'card-hover-overlay';
            card.appendChild(overlay);
          }

          if (!card.querySelector('.card-click-message')) {
            const message = document.createElement('div');
            message.className = 'card-click-message';
            message.textContent = 'Click to View';
            card.appendChild(message);
          }

          // Set up click handler to bring card to front and make it active
          card.addEventListener('click', (e) => {
            // Prevent event bubbling
            e.stopPropagation();
            bringCardToFront(stack, index);
          });
        });
      } else {
        // DESKTOP: Horizontal stacking with vertical offsets (existing behavior)
        // Adjust container height to account for stagger (using 1.5x multiplier)
        const containerHeight = maxHeight + staggerOffset;
        stack.style.height = `${containerHeight}px`;

        // Position each card dynamically with decreasing z-index
        // Stack orientation: left to right (top card on left, stack extends right)
        cards.forEach((card, index) => {
          // Set all cards to the same height (tallest card's height)
          card.style.height = `${maxHeight}px`;

          // Position: cards stack from left to right
          // First card (index 0) is on the far left
          // Each subsequent card is positioned to the right of the previous one
          const leftPosition = cardWidth * overlap * index;
          card.style.left = `${leftPosition}px`;
          card.style.right = 'auto'; // Clear any right positioning

          // Three-layer vertical wave pattern
          // Pattern: 0, stagger/2, stagger, stagger/2, 0, stagger/2, stagger, stagger/2...
          // Creates a wave where each card is offset from both neighbors
          const wavePosition = index % 4;
          let verticalOffset = 0;
          if (wavePosition === 1 || wavePosition === 3) {
            verticalOffset = staggerOffset / 2;
          } else if (wavePosition === 2) {
            verticalOffset = staggerOffset;
          }
          card.style.top = `${verticalOffset}px`;

          // Z-index: first card highest (100), decreasing for each subsequent card
          card.style.zIndex = 100 - index;

          // All cards need to be absolute for right-to-left positioning to work
          card.style.position = 'absolute';

          // Apply darkening effect to cards behind the front card
          // Front card (index 0): full brightness (no filter)
          // Cards behind: darken progressively without transparency
          if (index === 0) {
            card.style.filter = 'none';
            // Mark first card as active
            card.classList.add('active-card');
          } else {
            // Cards 1-3: 80% brightness
            // Cards 4+: gradually darken to 60%
            const baseBrightness = 0.8;
            const minBrightness = 0.6;
            let brightness;
            if (index <= 3) {
              brightness = baseBrightness;
            } else {
              const fadeStep = (baseBrightness - minBrightness) / Math.max(familySize - 3, 10);
              brightness = Math.max(minBrightness, baseBrightness - ((index - 3) * fadeStep));
            }
            card.style.filter = `brightness(${brightness})`;
          }

          // Add hover overlay and "Click to View" message to each card
          if (!card.querySelector('.card-hover-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'card-hover-overlay';
            card.appendChild(overlay);
          }

          if (!card.querySelector('.card-click-message')) {
            const message = document.createElement('div');
            message.className = 'card-click-message';
            message.textContent = 'Click to View';
            card.appendChild(message);
          }

          // Set up click handler to bring card to front and make it active
          card.addEventListener('click', (e) => {
            // Prevent event bubbling
            e.stopPropagation();
            bringCardToFront(stack, index);
          });
        });
      }
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
   * Bring a clicked card to the front of the stack and make it active
   * Updates z-index and brightness without any movement
   * @param {HTMLElement} stack - The family stack container
   * @param {number} clickedIndex - Index of the clicked card
   */
  function bringCardToFront(stack, clickedIndex) {
    const cards = stack.querySelectorAll('.card-in-family');
    const familySize = cards.length;
    const clickedCard = cards[clickedIndex];

    // Remove active class from all cards
    cards.forEach(card => card.classList.remove('active-card'));

    // Mark clicked card as active
    clickedCard.classList.add('active-card');

    // Reorder z-index: clicked card gets highest, others maintain relative order
    cards.forEach((card, index) => {
      if (index === clickedIndex) {
        // Clicked card goes to the front
        card.style.zIndex = 100;
        card.style.filter = 'none'; // Full brightness
      } else {
        // Other cards: assign z-index based on their position relative to clicked card
        // Cards before clicked card get lower z-index than cards after
        const relativePosition = index < clickedIndex ? index : index - 1;
        card.style.zIndex = 99 - relativePosition;

        // Apply darkening to non-active cards
        const baseBrightness = 0.8;
        const minBrightness = 0.6;
        let brightness;
        if (relativePosition <= 2) {
          brightness = baseBrightness;
        } else {
          const fadeStep = (baseBrightness - minBrightness) / Math.max(familySize - 3, 10);
          brightness = Math.max(minBrightness, baseBrightness - ((relativePosition - 2) * fadeStep));
        }
        card.style.filter = `brightness(${brightness})`;
      }
    });
  }

  // Initialize themes on page load
  initThemes();

  // Handle viewport resize: reinitialize stacks when crossing mobile/desktop breakpoint
  let resizeTimeout = null;
  let previousIsMobile = window.innerWidth <= 768;

  window.addEventListener('resize', function() {
    // Debounce resize events
    if (resizeTimeout) clearTimeout(resizeTimeout);

    resizeTimeout = setTimeout(() => {
      const currentIsMobile = window.innerWidth <= 768;

      // Only reinitialize if we've crossed the mobile/desktop boundary
      if (currentIsMobile !== previousIsMobile) {
        previousIsMobile = currentIsMobile;
        initFamilyStacks();
      }
    }, 150); // 150ms debounce
  });

});
