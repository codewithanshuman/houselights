/* Organizer credential stays in memory and is never placed in a URL or export. */
(() => {
  let token = '';
  const original = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    if (token && typeof input === 'string' && input.startsWith('/api/')) {
      const headers = new Headers(options.headers); headers.set('Authorization', `Bearer ${token}`);
      return original(input, { ...options, headers });
    }
    return original(input, options);
  };
  window.organizerAccess = { setToken(value) { token = value; }, clear() { token = ''; } };
})();
