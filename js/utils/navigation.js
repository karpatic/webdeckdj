// Navigation is invoked by user actions, never by rendering or audio updates.
(function () {
  window.dj = window.dj || {};
  const behavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'instant' : 'smooth';
  window.dj.navigation = {
    showDecks() {
      window.scrollTo({ top: 0, left: 0, behavior: behavior() });
    },
    showDirectory(element) {
      if (element) element.scrollIntoView({ block: 'start', behavior: behavior() });
    }
  };
})();
