(function() {
  'use strict';

  if (globalThis.__warRoomEspnContentV1) return;
  globalThis.__warRoomEspnContentV1 = true;

  var parser = globalThis.WarRoomEspnParser;
  if (!parser || !globalThis.chrome || !chrome.runtime) return;

  var scanTimer = null;
  var lastSignature = '';
  var config = {teams: 10, draftSlot: 1};
  var topFrame = false;
  try { topFrame = window.top === window; } catch (error) {}

  function send(message) {
    try {
      var response = chrome.runtime.sendMessage(message);
      if (response && typeof response.catch === 'function') response.catch(function() {});
    } catch (error) {}
  }

  function isDraftPage() {
    return /draft/i.test(location.pathname + location.search + document.title) ||
      /on the clock|draft room|draft board/i.test(document.body ? document.body.innerText.slice(0, 5000) : '');
  }

  function scan(force) {
    scanTimer = null;
    if (!isDraftPage()) {
      send({type: 'ESPN_HEARTBEAT', draftPage: false, topFrame: topFrame, url: location.href});
      return;
    }

    var scanResult = parser.scanDocumentDetailed
      ? parser.scanDocumentDetailed(document, config)
      : {picks: parser.scanDocument(document, config), candidateCount: 0};
    var picks = scanResult.picks;
    var signature = JSON.stringify(picks);
    if (force || signature !== lastSignature) {
      lastSignature = signature;
      send({type: 'ESPN_PICKS_FOUND', picks: picks, url: location.href});
    }
    send({
      type: 'ESPN_HEARTBEAT',
      draftPage: true,
      captured: picks.length,
      candidates: scanResult.candidateCount,
      topFrame: topFrame,
      url: location.href
    });
  }

  function scheduleScan(force) {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(function() { scan(force); }, 350);
  }

  chrome.runtime.onMessage.addListener(function(message) {
    if (!message) return;
    if (message.type === 'COMPANION_CONFIG') {
      config = Object.assign({}, config, message.config || {});
      scheduleScan(true);
    }
    if (message.type === 'RESCAN_ESPN') scheduleScan(true);
  });

  send({type: 'ESPN_CONTENT_READY', url: location.href});

  var observer = new MutationObserver(function(mutations) {
    var relevant = mutations.some(function(mutation) {
      return mutation.addedNodes && mutation.addedNodes.length;
    });
    if (relevant) scheduleScan(false);
  });

  observer.observe(document.documentElement, {childList: true, subtree: true});
  scheduleScan(true);
  setInterval(function() { scan(false); }, 10000);
})();
