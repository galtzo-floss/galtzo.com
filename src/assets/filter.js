// Filter behavior moved to an external file so it is always emitted into output
// and does not depend on inline scripts being preserved by the templating
// pipeline. It reads JSON from the card's data-tags attribute with a
// comma-separated fallback for backward compatibility.

document.addEventListener('DOMContentLoaded', function() {
  const tagLinks = document.querySelectorAll('.tag-link');
  const cards = document.querySelectorAll('.card');

  if (!tagLinks.length) return;
  if (!cards.length) return;

  tagLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      this.classList.toggle('active');
      filterProjects();
    });
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
    var activeTags = Array.from(document.querySelectorAll('.tag-link.active')).map(function(link) { return link.dataset.tag; });
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
