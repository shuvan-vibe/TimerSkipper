/**
 * TimerSkipper — Background Service Worker
 * Manages dynamic content script registration per whitelisted site.
 */

/* ── Update registered content scripts based on stored site list ── */
async function updateScripts() {
  var data = await chrome.storage.local.get('sites');
  var sites = data.sites || {};

  var speeds = { 2: [], 5: [], 10: [], 15: [] };

  for (var domain in sites) {
    if (!sites.hasOwnProperty(domain)) continue;
    if (sites[domain].enabled && speeds[sites[domain].speed]) {
      speeds[sites[domain].speed].push('*://' + domain + '/*');
      speeds[sites[domain].speed].push('*://*.' + domain + '/*');
    }
  }

  // Remove old registrations
  var ids = ['ts-cfg', 'ts-accel-2', 'ts-accel-5', 'ts-accel-10', 'ts-accel-15'];
  try { await chrome.scripting.unregisterContentScripts({ ids: ids }); } catch (_) { }

  var registrations = [];
  var allPatterns = [];

  for (var s in speeds) {
    if (speeds[s].length > 0) {
      allPatterns = allPatterns.concat(speeds[s]);
      registrations.push({
        id: 'ts-accel-' + s,
        matches: speeds[s],
        js: ['speed' + s + '.js', 'accelerator.js'],
        runAt: 'document_start',
        world: 'MAIN',
        allFrames: true
      });
    }
  }

  if (allPatterns.length > 0) {
    registrations.push({
      id: 'ts-cfg',
      matches: allPatterns,
      js: ['content.js'],
      runAt: 'document_start',
      allFrames: true
    });
    await chrome.scripting.registerContentScripts(registrations);
  }
}

/* ── Initialise storage on first install ─────────────────────────── */
chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get('sites', function (d) {
    if (!d.sites) chrome.storage.local.set({ sites: {} });
  });
  updateScripts();
});

/* ── Re-register on browser restart ──────────────────────────────── */
chrome.runtime.onStartup.addListener(function () {
  updateScripts();
});

/* ── Re-register whenever site list changes ──────────────────────── */
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.sites) updateScripts();
});

/* ── Messages from popup ─────────────────────────────────────────── */
chrome.runtime.onMessage.addListener(function (msg, sender, reply) {

  /* Return the active tab's hostname */
  if (msg.type === 'GET_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) return reply({ host: '', id: null });
      try {
        var u = new URL(tabs[0].url);
        reply({ host: u.hostname.replace(/^www\./, ''), id: tabs[0].id });
      } catch (_) {
        reply({ host: '', id: null });
      }
    });
    return true; // async
  }

  /* Relay a speed change to the content script in a specific tab */
  if (msg.type === 'RELAY_SPEED') {
    chrome.tabs.sendMessage(msg.tabId, {
      type: 'TS_SPEED_CHANGE',
      speed: msg.speed
    }).catch(function () { /* tab may not have content script yet */ });
  }

  /* Inject scripts immediately into a tab (no reload needed) */
  if (msg.type === 'INJECT_NOW') {
    (async function () {
      try {
        var data = await chrome.storage.local.get('sites');
        var sites = data.sites || {};
        var tab = await chrome.tabs.get(msg.tabId);
        var u = new URL(tab.url);
        var host = u.hostname.replace(/^www\./, '');
        
        var cfg = sites[host];
        var speed = cfg ? cfg.speed : 2;
        var speedFile = 'speed' + speed + '.js';

        await chrome.scripting.executeScript({
          target: { tabId: msg.tabId, allFrames: true },
          files: [speedFile, 'accelerator.js'],
          world: 'MAIN',
          injectImmediately: true
        });
        await chrome.scripting.executeScript({
          target: { tabId: msg.tabId, allFrames: true },
          files: ['content.js']
        });
        reply({ ok: true });
      } catch (e) {
        reply({ ok: false, err: e.message });
      }
    })();
    return true; // async
  }
});
