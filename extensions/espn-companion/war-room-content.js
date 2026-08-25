(function() {
  'use strict';

  if (!globalThis.chrome || !chrome.runtime) return;
  var CHANNEL = 'the-war-room:espn-sync:v1';
  var EXTENSION_VERSION = chrome.runtime.getManifest().version;

  function sendRuntime(message) {
    try {
      var response = chrome.runtime.sendMessage(message);
      if (response && typeof response.catch === 'function') response.catch(function() {});
    } catch (error) {}
  }

  function postToWarRoom(message) {
    window.postMessage(Object.assign({channel: CHANNEL}, message), '*');
  }

  chrome.runtime.onMessage.addListener(function(message) {
    if (!message) return;
    if (message.type === 'WAR_ROOM_SNAPSHOT') {
      postToWarRoom({type: 'PICKS_SNAPSHOT', snapshot: message.snapshot});
    }
    if (message.type === 'WAR_ROOM_STATUS') {
      postToWarRoom({
        type: 'EXTENSION_STATUS',
        status: message.status,
        detail: message.detail,
        extensionVersion: message.extensionVersion || EXTENSION_VERSION
      });
    }
  });

  window.addEventListener('message', function(event) {
    if (event.source !== window || !event.data || event.data.channel !== CHANNEL) return;
    if (event.data.type === 'SYNC_ACK') {
      sendRuntime({
        type: 'WAR_ROOM_ACK',
        result: event.data.result,
        settings: event.data.settings,
        requiredExtensionVersion: event.data.requiredExtensionVersion,
        url: location.href
      });
    }
    if (event.data.type === 'SETTINGS_UPDATE') {
      sendRuntime({
        type: 'WAR_ROOM_SETTINGS_UPDATE',
        config: event.data.settings,
        requiredExtensionVersion: event.data.requiredExtensionVersion,
        url: location.href
      });
    }
    if (event.data.type === 'RANKINGS_REFRESH_REQUEST') {
      sendRuntime({type: 'WAR_ROOM_RANKINGS_REFRESH', url: location.href});
    }
  });

  postToWarRoom({
    type: 'EXTENSION_STATUS',
    status: 'connected',
    detail: 'ESPN companion connected',
    extensionVersion: EXTENSION_VERSION
  });
  sendRuntime({type: 'WAR_ROOM_READY', url: location.href});
})();
