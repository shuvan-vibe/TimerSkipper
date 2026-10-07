/**
 * TimerSkipper — Accelerator Engine
 * Injected into MAIN world at document_start.
 * Overrides timer/time APIs to speed up countdowns.
 */
(function () {
  'use strict';

  // Guard against double-injection
  if (window.__TS_INJECTED__) return;
  Object.defineProperty(window, '__TS_INJECTED__', {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false
  });

  /* ── speed multiplier (updated synchronously and via postMessage) ── */
  let S = window.__TS_SPEED__ || 1;

  /* ── original references ───────────────────────────────────────── */
  const _setTimeout      = window.setTimeout;
  const _setInterval     = window.setInterval;
  const _clearTimeout    = window.clearTimeout;
  const _clearInterval   = window.clearInterval;
  const _DateNow         = Date.now;
  const _perfNow         = performance.now.bind(performance);
  const _rAF             = window.requestAnimationFrame;
  const _cAF             = window.cancelAnimationFrame;
  const _OrigDate        = Date;

  /* ── time anchors ──────────────────────────────────────────────── */
  const T0_PERF = _perfNow();
  const T0_DATE = _DateNow();

  /* ── accelerated time helpers ──────────────────────────────────── */
  function accelDateNow() {
    if (S <= 1) return _DateNow();
    return T0_DATE + (_perfNow() - T0_PERF) * S;
  }

  function accelPerfNow() {
    if (S <= 1) return _perfNow();
    return T0_PERF + (_perfNow() - T0_PERF) * S;
  }

  /* ── setTimeout / setInterval ──────────────────────────────────── */
  window.setTimeout = function setTimeout(fn, delay) {
    var a = arguments;
    if (S > 1 && typeof delay === 'number' && delay > 0)
      a[1] = Math.max(1, (delay / S) | 0);
    return _setTimeout.apply(this, a);
  };

  window.setInterval = function setInterval(fn, delay) {
    var a = arguments;
    if (S > 1 && typeof delay === 'number' && delay > 0)
      a[1] = Math.max(1, (delay / S) | 0);
    return _setInterval.apply(this, a);
  };

  window.clearTimeout = function clearTimeout(id) {
    return _clearTimeout.call(this, id);
  };

  window.clearInterval = function clearInterval(id) {
    return _clearInterval.call(this, id);
  };

  /* ── Date constructor ──────────────────────────────────────────── */
  var _D = function Date() {
    var args = arguments;
    if (new.target) {
      if (args.length === 0) return new _OrigDate(accelDateNow());
      switch (args.length) {
        case 1: return new _OrigDate(args[0]);
        case 2: return new _OrigDate(args[0], args[1]);
        case 3: return new _OrigDate(args[0], args[1], args[2]);
        case 4: return new _OrigDate(args[0], args[1], args[2], args[3]);
        case 5: return new _OrigDate(args[0], args[1], args[2], args[3], args[4]);
        case 6: return new _OrigDate(args[0], args[1], args[2], args[3], args[4], args[5]);
        default: return new _OrigDate(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
      }
    }
    // Called without new — returns string
    return new _OrigDate(accelDateNow()).toString();
  };

  _D.prototype = _OrigDate.prototype;
  _D.prototype.constructor = _D;
  _D.now   = function now() { return accelDateNow() | 0; };
  _D.parse = _OrigDate.parse;
  _D.UTC   = _OrigDate.UTC;

  // Copy remaining static own properties
  Object.getOwnPropertyNames(_OrigDate).forEach(function (k) {
    if (['prototype', 'now', 'parse', 'UTC', 'length', 'name', 'caller', 'arguments'].indexOf(k) !== -1) return;
    try {
      var d = Object.getOwnPropertyDescriptor(_OrigDate, k);
      if (d) Object.defineProperty(_D, k, d);
    } catch (_) { /* skip non-configurable */ }
  });

  window.Date = _D;

  /* ── performance.now ───────────────────────────────────────────── */
  performance.now = function now() {
    return accelPerfNow();
  };

  /* ── requestAnimationFrame ─────────────────────────────────────── */
  window.requestAnimationFrame = function requestAnimationFrame(cb) {
    return _rAF.call(this, function (ts) {
      if (S > 1) ts = T0_PERF + (ts - T0_PERF) * S;
      cb(ts);
    });
  };

  window.cancelAnimationFrame = function cancelAnimationFrame(id) {
    return _cAF.call(this, id);
  };

  /* ── Anti-Detection: toString masking ──────────────────────────── */
  var _nts = Function.prototype.toString;
  var _m   = new WeakMap();

  _m.set(window.setTimeout,              'function setTimeout() { [native code] }');
  _m.set(window.setInterval,             'function setInterval() { [native code] }');
  _m.set(window.clearTimeout,            'function clearTimeout() { [native code] }');
  _m.set(window.clearInterval,           'function clearInterval() { [native code] }');
  _m.set(performance.now,                'function now() { [native code] }');
  _m.set(window.requestAnimationFrame,   'function requestAnimationFrame() { [native code] }');
  _m.set(window.cancelAnimationFrame,    'function cancelAnimationFrame() { [native code] }');
  _m.set(_D,                             'function Date() { [native code] }');
  _m.set(_D.now,                         'function now() { [native code] }');

  Function.prototype.toString = function toString() {
    return _m.has(this) ? _m.get(this) : _nts.call(this);
  };
  _m.set(Function.prototype.toString,    'function toString() { [native code] }');

  /* ── Visibility / Focus spoofing (Anti-pause) ──────────────────── */
  Object.defineProperty(document, 'hidden', { get: () => false });
  Object.defineProperty(document, 'webkitHidden', { get: () => false });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
  Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible' });
  Document.prototype.hasFocus = function() { return true; };

  /* ── CSS Animations Acceleration ───────────────────────────────── */
  function speedUpCSSAnimations() {
    if (S <= 1 || typeof document.getAnimations !== 'function') return;
    try {
      document.getAnimations().forEach(function(anim) {
        if (anim.playbackRate !== S) {
          anim.playbackRate = S;
        }
      });
    } catch (e) { /* ignore */ }
  }
  // Periodically check and speed up any active CSS animations
  _setInterval(speedUpCSSAnimations, 250);

  /* ── Speed listener (from content.js via postMessage) ──────────── */
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__TS__ === 1 && typeof e.data.s === 'number' && e.data.s >= 1) {
      S = e.data.s;
    }
  });
})();
