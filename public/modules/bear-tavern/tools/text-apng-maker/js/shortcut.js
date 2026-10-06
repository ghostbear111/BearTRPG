(() => {
  'use strict';

  const CODE_ACTIONS = {
    KeyP: api => api.togglePlay(),
    KeyE: api => api.exportApng(),
    KeyK: api => api.exportStill(),
    KeyT: api => api.toggleTheme(),
    Digit1: api => api.setMode(0),
    Digit2: api => api.setMode(1),
    Digit3: api => api.setMode(2)
  };

  const hasModifier = event => event.shiftKey && (event.metaKey || event.ctrlKey || event.altKey);

  document.addEventListener('keydown', event => {
    const api = window.TextApngMakerApi;
    if (!api) return;
    if (event.key === 'Escape') {
      if (api.closeDrawers() || api.stopPreview()) event.preventDefault();
      return;
    }
    if (!hasModifier(event)) return;
    const action = CODE_ACTIONS[event.code];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action(api);
  }, true);
})();
