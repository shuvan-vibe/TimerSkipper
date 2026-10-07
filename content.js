/**
 * TimerSkipper — Config Bridge (ISOLATED world)
 * Reads speed settings from chrome.storage and relays them
 * to the MAIN world accelerator via postMessage.
 */
(function () {
  'use strict';

  function hostname() {
    return location.hostname.replace(/^www\./, '');
  }

  function sendSpeed(speed) {
    window.postMessage({ __TS__: 1, s: speed }, '*');
  }

  function findSiteConfig(sites) {
    var h = hostname();
    for (var domain in sites) {
      if (!sites.hasOwnProperty(domain)) continue;
      if (h === domain || h.endsWith('.' + domain)) {
        return sites[domain];
      }
    }
    return null;
  }

  // Load and send speed on injection
  chrome.storage.local.get('sites', function (data) {
    var cfg = findSiteConfig(data.sites || {});
    if (cfg && cfg.enabled && cfg.speed > 1) {
      sendSpeed(cfg.speed);
    }
  });

  // Listen for live speed changes from popup / background
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === 'TS_SPEED_CHANGE') {
      sendSpeed(msg.speed);
      sendResponse({ ok: true });
    }
    if (msg.type === 'TS_PING') {
      sendResponse({ ok: true, host: hostname() });
    }
  });

  // Also react to storage changes (e.g. speed updated from another tab's popup)
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.sites) return;
    var cfg = findSiteConfig(changes.sites.newValue || {});
    if (cfg && cfg.enabled) {
      sendSpeed(cfg.speed);
    } else {
      sendSpeed(1); // disable
    }
  });
})();
