(function(root, factory) {
  'use strict';

  var bridge = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = bridge;
  if (!root || !root.addEventListener || !root.postMessage) return;
  if (root.__warRoomEspnPageBridgeV1) return;
  root.__warRoomEspnPageBridgeV1 = true;

  root.addEventListener('message', function(event) {
    var message = event && event.data;
    if (event.source !== root || !message || message.channel !== 'WAR_ROOM_ESPN_PAGE_REQUEST') return;
    var requestId = String(message.requestId || '');
    if (!requestId || !bridge.isAllowedApiUrl(message.url)) return;

    fetch(message.url, {
      credentials: 'include',
      cache: 'no-store',
      headers: bridge.buildHeaders(message.headers)
    }).then(function(response) {
      return response.text().then(function(text) {
        var payload = null;
        if (text) {
          try { payload = JSON.parse(text); }
          catch (error) { throw new Error('ESPN returned a non-JSON response'); }
        }
        root.postMessage({
          channel: 'WAR_ROOM_ESPN_PAGE_RESPONSE',
          requestId: requestId,
          ok: response.ok,
          status: response.status,
          role: response.headers.get('X-Fantasy-Role') || null,
          payload: payload,
          error: response.ok ? null : 'ESPN returned HTTP ' + response.status
        }, '*');
      });
    }).catch(function(error) {
      root.postMessage({
        channel: 'WAR_ROOM_ESPN_PAGE_RESPONSE',
        requestId: requestId,
        ok: false,
        status: 0,
        payload: null,
        error: error && error.message ? error.message : String(error)
      }, '*');
    });
  });
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';

  function isAllowedApiUrl(value) {
    try {
      var url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || url.hostname !== 'lm-api-reads.fantasy.espn.com') return false;
      return /^\/apis\/v3\/games\/ffl\/seasons\/\d{4}\/(?:segments\/0\/leagues\/\d+|players)$/.test(url.pathname);
    } catch (error) { return false; }
  }

  function buildHeaders(input) {
    var headers = {'Accept': 'application/json'};
    var fantasyFilter = input && input['X-Fantasy-Filter'];
    if (typeof fantasyFilter === 'string' && fantasyFilter.length <= 12000) {
      headers['X-Fantasy-Filter'] = fantasyFilter;
    }
    return headers;
  }

  return {isAllowedApiUrl: isAllowedApiUrl, buildHeaders: buildHeaders};
});
