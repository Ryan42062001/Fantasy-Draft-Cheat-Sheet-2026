(function(root, factory) {
  'use strict';
  var observer = factory(root && root.WarRoomEspnLiveCapture);
  if (typeof module !== 'undefined' && module.exports) module.exports = observer;
  if (!root || !root.addEventListener || !root.postMessage || !observer.install) return;
  if (root.__warRoomEspnLiveObserverV2) return;
  root.__warRoomEspnLiveObserverV2 = true;
  observer.install(root);
})(typeof window !== 'undefined' ? window : null, function(capture) {
  'use strict';

  var CHANNEL = 'WAR_ROOM_ESPN_LIVE_OBSERVATION';
  var installed = false;
  var reactTimer = null;
  var lastReactSignature = '';
  var counters = {sockets:0, socketMessages:0, binarySocketMessages:0, eventSources:0,
    eventSourceMessages:0, fetchResponses:0, xhrResponses:0, reactScans:0};

  function relevantUrl(value) {
    try {
      var url = new URL(String(value || ''), location.href);
      return /(^|\.)espn\.com$/i.test(url.hostname) || /(^|\.)fantasy\.espn\.com$/i.test(url.hostname);
    } catch (error) { return false; }
  }

  function emit(root, source, sourceDetail, payload, extra) {
    if (!capture) return;
    var fields = capture.topLevelFields(payload);
    var candidates = capture.extractPickCandidates(payload, {
      source:source,
      sourceDetail:capture.safeUrl(sourceDetail),
      maxObjects:source === 'react' ? 5000 : 3000,
      maxCandidates:300
    });
    var telemetry = capture.sanitizeTelemetry({
      source:source, sourceDetail:sourceDetail, fields:fields,
      candidateCount:candidates.length
    });
    root.postMessage({
      channel:CHANNEL,
      type:'OBSERVATION',
      source:source,
      candidates:candidates,
      telemetry:telemetry,
      counters:Object.assign({}, counters),
      detail:extra || null
    }, '*');
  }

  function inspectText(root, source, detail, text) {
    if (typeof text !== 'string' || !text || text.length > 2000000) return;
    var payload = capture && capture.parsePayload(text);
    if (payload) emit(root, source, detail, payload);
  }

  function inspectSocketData(root, detail, data) {
    if (typeof data === 'string') {
      inspectText(root, 'websocket', detail, data);
      return;
    }
    counters.binarySocketMessages++;
    if (root.Blob && data instanceof root.Blob && typeof data.text === 'function') {
      data.text().then(function(text) { inspectText(root, 'websocket', detail, text); }).catch(function() {});
      return;
    }
    var buffer = null;
    if (root.ArrayBuffer && data instanceof root.ArrayBuffer) buffer = data;
    else if (root.ArrayBuffer && root.ArrayBuffer.isView && root.ArrayBuffer.isView(data)) {
      buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    if (buffer && root.TextDecoder) {
      try { inspectText(root, 'websocket', detail, new root.TextDecoder('utf-8').decode(buffer)); return; } catch (error) {}
    }
    root.postMessage({
      channel:CHANNEL, type:'TELEMETRY', source:'websocket',
      telemetry:{source:'websocket', sourceDetail:detail, fields:[], candidateCount:0,
        observedAt:new Date().toISOString()},
      counters:Object.assign({}, counters), detail:{binaryIgnored:true}
    }, '*');
  }

  function installWebSocket(root) {
    var NativeWebSocket = root.WebSocket;
    if (typeof NativeWebSocket !== 'function' || typeof Proxy !== 'function') return;
    var Wrapped = new Proxy(NativeWebSocket, {
      construct:function(Target, args, NewTarget) {
        var socket = Reflect.construct(Target, args, NewTarget);
        counters.sockets++;
        var detail = capture ? capture.safeUrl(args && args[0]) : '';
        socket.addEventListener('message', function(event) {
          counters.socketMessages++;
          inspectSocketData(root, detail, event.data);
        });
        return socket;
      }
    });
    root.WebSocket = Wrapped;
  }

  function installEventSource(root) {
    var NativeEventSource = root.EventSource;
    if (typeof NativeEventSource !== 'function' || typeof Proxy !== 'function') return;
    root.EventSource = new Proxy(NativeEventSource, {
      construct:function(Target, args, NewTarget) {
        var stream = Reflect.construct(Target, args, NewTarget);
        counters.eventSources++;
        var detail = capture ? capture.safeUrl(args && args[0]) : '';
        stream.addEventListener('message', function(event) {
          counters.eventSourceMessages++;
          inspectText(root, 'eventsource', detail, event && event.data);
        });
        return stream;
      }
    });
  }

  function installFetch(root) {
    var nativeFetch = root.fetch;
    if (typeof nativeFetch !== 'function') return;
    root.fetch = function() {
      var args = arguments;
      var requestUrl = args[0] && args[0].url ? args[0].url : args[0];
      var result = nativeFetch.apply(this, args);
      if (!relevantUrl(requestUrl)) return result;
      result.then(function(response) {
        counters.fetchResponses++;
        var contentType = String(response.headers && response.headers.get('content-type') || '');
        if (!/json|text|javascript/i.test(contentType)) return;
        response.clone().text().then(function(text) {
          inspectText(root, 'fetch', response.url || requestUrl, text);
        }).catch(function() {});
      }).catch(function() {});
      return result;
    };
  }

  function installXhr(root) {
    var Xhr = root.XMLHttpRequest;
    if (!Xhr || !Xhr.prototype) return;
    var nativeOpen = Xhr.prototype.open;
    var requestUrls = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    Xhr.prototype.open = function(method, url) {
      if (requestUrls) requestUrls.set(this, url);
      return nativeOpen.apply(this, arguments);
    };
    var nativeSend = Xhr.prototype.send;
    Xhr.prototype.send = function() {
      var xhr = this;
      var url = requestUrls ? requestUrls.get(xhr) : '';
      if (relevantUrl(url)) {
        xhr.addEventListener('loadend', function() {
          counters.xhrResponses++;
          try {
            if (xhr.responseType === 'json' && xhr.response) emit(root, 'xhr', xhr.responseURL || url, xhr.response);
            else if (!xhr.responseType || xhr.responseType === 'text') inspectText(root, 'xhr', xhr.responseURL || url, xhr.responseText);
          } catch (error) {}
        }, {once:true});
      }
      return nativeSend.apply(this, arguments);
    };
  }

  function likelyReactRoots(root) {
    var document = root.document;
    if (!document || !document.querySelectorAll) return [];
    var nodes = Array.prototype.slice.call(document.querySelectorAll(
      '#root,#fitt-portal-root,[data-reactroot],[id*="draft" i],[class*="draft" i]'
    )).slice(0, 30);
    if (document.body && nodes.indexOf(document.body) < 0) nodes.push(document.body);
    return nodes;
  }

  function reactValues(root) {
    var values = [];
    likelyReactRoots(root).forEach(function(node) {
      Object.keys(node).filter(function(key) {
        return /^__react(Fiber|Container|Props)\$/i.test(key) || /^__react(Fiber|Container|Props)/i.test(key);
      }).slice(0, 3).forEach(function(key) {
        var fiber;
        try { fiber = node[key]; } catch (error) { return; }
        var cursor = fiber;
        var hops = 0;
        while (cursor && hops++ < 80) {
          if (cursor.memoizedProps) values.push(cursor.memoizedProps);
          if (cursor.memoizedState) values.push(cursor.memoizedState);
          if (cursor.updateQueue && cursor.updateQueue.lastRenderedState) values.push(cursor.updateQueue.lastRenderedState);
          cursor = cursor.child || cursor.sibling || cursor.return;
          if (values.length >= 250) break;
        }
      });
    });
    return values;
  }

  function scanReact(root, force) {
    if (!capture || !root.document) return;
    counters.reactScans++;
    var values = reactValues(root);
    var candidates = [];
    values.forEach(function(value) {
      candidates = candidates.concat(capture.extractPickCandidates(value, {
        source:'react', sourceDetail:'page-state', maxObjects:1200, maxCandidates:200
      }));
    });
    var signature = JSON.stringify(candidates.map(function(item) {
      return [item.overallPick, item.playerId, item.playerName];
    }).sort());
    if (!force && signature === lastReactSignature) return;
    lastReactSignature = signature;
    root.postMessage({
      channel:CHANNEL, type:'OBSERVATION', source:'react', candidates:candidates,
      telemetry:{source:'react', sourceDetail:'page-state', fields:[], candidateCount:candidates.length,
        observedAt:new Date().toISOString()},
      counters:Object.assign({}, counters), detail:{roots:likelyReactRoots(root).length, stateObjects:values.length}
    }, '*');
  }

  function install(root) {
    if (installed || !root || !capture) return false;
    installed = true;
    installWebSocket(root);
    installEventSource(root);
    installFetch(root);
    installXhr(root);
    root.addEventListener('message', function(event) {
      if (event.source !== root || !event.data || event.data.channel !== CHANNEL) return;
      if (event.data.type === 'RESCAN_REACT') scanReact(root, true);
    });
    function startReact() {
      scanReact(root, true);
      if (!reactTimer) reactTimer = root.setInterval(function() { scanReact(root, false); }, 5000);
    }
    if (root.document && root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', startReact, {once:true});
    } else startReact();
    return true;
  }

  return {
    install:install,
    relevantUrl:relevantUrl,
    inspectText:inspectText,
    inspectSocketData:inspectSocketData,
    reactValues:reactValues,
    scanReact:scanReact
  };
});
