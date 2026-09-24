// Document-local account reads shared by the dashboard gate, header and chat.
// This is display state only: API routes continue to authorize every request.
(function () {
  var cached = null;
  var expires = 0;
  var pending = null;
  var generation = 0;
  var subscribed = false;

  function clear() {
    generation++;
    cached = null;
    expires = 0;
    pending = null;
  }

  function connect() {
    var auth = window.shapeDb && window.shapeDb.client && window.shapeDb.client.auth;
    if (!subscribed && auth && auth.onAuthStateChange) {
      subscribed = true;
      auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_OUT' || event === 'USER_UPDATED'
            || (event === 'SIGNED_IN' && (!cached || cached.user.id !== session?.user?.id))) clear();
      });
    }
  }

  function read() {
    connect();
    if (cached && Date.now() < expires) return Promise.resolve(cached);
    if (pending) return pending;
    var gen = generation;
    var request = fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        // A response from before sign-out or an auth change cannot restore the
        // previous account, even for consumers already awaiting this request.
        if (gen !== generation) return read();
        if (data && data.user) {
          cached = data;
          expires = Date.now() + 15000;
        } else if (data && Object.prototype.hasOwnProperty.call(data, 'user')) {
          cached = null;
          expires = 0;
        }
        return data;
      })
      .finally(function () { if (pending === request) pending = null; });
    pending = request;
    return request;
  }

  window.ShapePortalSession = { read: read, clear: clear, peek: function () { return cached; } };
  window.addEventListener('storage', function (event) {
    if (!event.key || event.key === 'shape.auth' || event.key === 'shape.signedOutAt'
        || event.key.indexOf('sb-') === 0) clear();
  });
  window.addEventListener('pageshow', function (event) { if (event.persisted) clear(); });
})();
