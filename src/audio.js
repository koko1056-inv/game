/*
 * audio.js — Procedural sound engine for the forestry tycoon game.
 *
 * Everything here is 100% procedural using the Web Audio API: no audio files,
 * no network requests, no external libraries. Exposes a single global object
 * `window.GameAudio`.
 *
 * Design goals:
 *   - Tasteful, "juicy" but gentle sounds (modest master volume ~0.3).
 *   - Degrade gracefully: if Web Audio is unavailable every method is a no-op.
 *   - Avoid clicks/pops by always ramping gains to/from near-zero (0.0001).
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------
  var AudioCtx = (typeof window !== 'undefined') &&
    (window.AudioContext || window.webkitAudioContext);

  var ctx = null;          // the AudioContext (created lazily)
  var master = null;       // master gain node
  var supported = !!AudioCtx;

  var muted = false;
  var MASTER_VOLUME = 0.3; // modest overall level
  var prevVolume = MASTER_VOLUME;

  var noiseBuffer = null;  // shared short white-noise buffer

  // Ambient bed handles (so we can stop cleanly and avoid double-starts).
  var ambient = null;      // { nodes..., chirpTimer }

  // A near-zero floor used for exponential ramps (they can't target 0).
  var EPS = 0.0001;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Current context time, guarded.
  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  // Create (once) a 1-second mono white-noise buffer we can reuse everywhere.
  function getNoiseBuffer() {
    if (noiseBuffer || !ctx) return noiseBuffer;
    var len = Math.floor(ctx.sampleRate * 1.0);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseBuffer = buf;
    return noiseBuffer;
  }

  // Make a noise source node (loops the shared buffer).
  function makeNoise() {
    var src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    src.loop = true;
    return src;
  }

  // Create a simple oscillator->gain voice and return both nodes.
  // Caller wires gain to destination and schedules the envelope.
  function makeOsc(type, freq, dest) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now());
    g.gain.setValueAtTime(EPS, now());
    osc.connect(g);
    g.connect(dest || master);
    return { osc: osc, gain: g };
  }

  // Apply a click-free percussive envelope to a gain param.
  //   t0     : start time
  //   peak   : peak gain
  //   attack : seconds to ramp up (linear)
  //   decay  : seconds to ramp down (exponential to EPS)
  function envelope(param, t0, peak, attack, decay) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(EPS, t0);
    param.linearRampToValueAtTime(peak, t0 + attack);
    param.exponentialRampToValueAtTime(EPS, t0 + attack + decay);
  }

  // Per-sound output gain that also applies an optional caller volume.
  function outGain(opts) {
    var g = ctx.createGain();
    var v = (opts && typeof opts.volume === 'number') ? opts.volume : 1;
    g.gain.value = v;
    g.connect(master);
    return g;
  }

  // ---------------------------------------------------------------------------
  // Individual sound effects. Each receives a destination gain (`out`) already
  // wired to master, and the start time `t`.
  // ---------------------------------------------------------------------------

  // Soft UI tap/pop.
  function sfxClick(out, t) {
    var v = makeOsc('sine', 420, out);
    v.osc.frequency.setValueAtTime(620, t);
    v.osc.frequency.exponentialRampToValueAtTime(280, t + 0.06);
    envelope(v.gain.gain, t, 0.5, 0.004, 0.07);
    v.osc.start(t);
    v.osc.stop(t + 0.12);
  }

  // Soft earthy dig/plant thud with a tiny sparkle on top.
  function sfxPlant(out, t) {
    // Low thud body.
    var body = makeOsc('sine', 150, out);
    body.osc.frequency.setValueAtTime(180, t);
    body.osc.frequency.exponentialRampToValueAtTime(70, t + 0.15);
    envelope(body.gain.gain, t, 0.7, 0.006, 0.18);
    body.osc.start(t);
    body.osc.stop(t + 0.3);

    // Earthy filtered-noise dirt.
    var noise = makeNoise();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    var ng = ctx.createGain();
    noise.connect(lp);
    lp.connect(ng);
    ng.connect(out);
    envelope(ng.gain, t, 0.35, 0.005, 0.12);
    noise.start(t);
    noise.stop(t + 0.2);

    // Tiny sparkle.
    var spark = makeOsc('triangle', 1600, out);
    spark.osc.frequency.setValueAtTime(1500, t + 0.04);
    spark.osc.frequency.linearRampToValueAtTime(2200, t + 0.12);
    envelope(spark.gain.gain, t + 0.04, 0.12, 0.005, 0.1);
    spark.osc.start(t + 0.04);
    spark.osc.stop(t + 0.2);
  }

  // Satisfying woody axe chop: sharp noise transient + low thunk.
  function sfxChop(out, t) {
    // Noise "whack".
    var noise = makeNoise();
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    var ng = ctx.createGain();
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(out);
    envelope(ng.gain, t, 0.55, 0.002, 0.07);
    noise.start(t);
    noise.stop(t + 0.15);

    // Low woody thunk.
    var thunk = makeOsc('triangle', 180, out);
    thunk.osc.frequency.setValueAtTime(220, t);
    thunk.osc.frequency.exponentialRampToValueAtTime(90, t + 0.14);
    envelope(thunk.gain.gain, t, 0.6, 0.004, 0.16);
    thunk.osc.start(t);
    thunk.osc.stop(t + 0.3);
  }

  // Lighter snip/cut (thinning).
  function sfxThin(out, t) {
    var noise = makeNoise();
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    var ng = ctx.createGain();
    noise.connect(hp);
    hp.connect(ng);
    ng.connect(out);
    envelope(ng.gain, t, 0.3, 0.002, 0.05);
    noise.start(t);
    noise.stop(t + 0.1);

    var blip = makeOsc('triangle', 900, out);
    blip.osc.frequency.setValueAtTime(1100, t);
    blip.osc.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    envelope(blip.gain.gain, t, 0.2, 0.003, 0.06);
    blip.osc.start(t);
    blip.osc.stop(t + 0.12);
  }

  // Bright cash/coin ka-ching: two quick ascending blips.
  function sfxCoin(out, t) {
    var notes = [880, 1320]; // A5, ~E6
    for (var i = 0; i < notes.length; i++) {
      var st = t + i * 0.07;
      var v = makeOsc('square', notes[i], out);
      // Slight detuned shimmer via a second triangle.
      var v2 = makeOsc('triangle', notes[i] * 2, out);
      envelope(v.gain.gain, st, 0.22, 0.004, 0.13);
      envelope(v2.gain.gain, st, 0.1, 0.004, 0.1);
      v.osc.start(st);
      v.osc.stop(st + 0.25);
      v2.osc.start(st);
      v2.osc.stop(st + 0.2);
    }
  }

  // Truck/whoosh departure: filtered noise sweep + low engine fade.
  function sfxShip(out, t) {
    var noise = makeNoise();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(1800, t + 0.18);
    lp.frequency.linearRampToValueAtTime(300, t + 0.4);
    var ng = ctx.createGain();
    noise.connect(lp);
    lp.connect(ng);
    ng.connect(out);
    ng.gain.setValueAtTime(EPS, t);
    ng.gain.linearRampToValueAtTime(0.3, t + 0.12);
    ng.gain.exponentialRampToValueAtTime(EPS, t + 0.4);
    noise.start(t);
    noise.stop(t + 0.45);

    // Low engine rumble that drives away (pitch drops).
    var eng = makeOsc('sawtooth', 110, out);
    eng.osc.frequency.setValueAtTime(120, t);
    eng.osc.frequency.exponentialRampToValueAtTime(70, t + 0.4);
    var elp = ctx.createBiquadFilter();
    elp.type = 'lowpass';
    elp.frequency.value = 500;
    eng.osc.disconnect();
    eng.osc.connect(elp);
    elp.connect(eng.gain);
    envelope(eng.gain.gain, t, 0.22, 0.02, 0.4);
    eng.osc.start(t);
    eng.osc.stop(t + 0.45);
  }

  // Constructive "set down" + rising confirm chime.
  function sfxBuild(out, t) {
    // Soft "set down" thud.
    var thud = makeOsc('sine', 160, out);
    thud.osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    envelope(thud.gain.gain, t, 0.5, 0.005, 0.14);
    thud.osc.start(t);
    thud.osc.stop(t + 0.25);

    // Rising confirm chime (two notes).
    var chord = [523.25, 783.99]; // C5, G5
    for (var i = 0; i < chord.length; i++) {
      var st = t + 0.08 + i * 0.06;
      var v = makeOsc('triangle', chord[i], out);
      envelope(v.gain.gain, st, 0.22, 0.006, 0.22);
      v.osc.start(st);
      v.osc.stop(st + 0.35);
    }
  }

  // Happy ascending major arpeggio (level up).
  function sfxLevelUp(out, t) {
    var notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    for (var i = 0; i < notes.length; i++) {
      var st = t + i * 0.09;
      var v = makeOsc('triangle', notes[i], out);
      var v2 = makeOsc('sine', notes[i], out);
      envelope(v.gain.gain, st, 0.22, 0.006, 0.26);
      envelope(v2.gain.gain, st, 0.12, 0.006, 0.3);
      v.osc.start(st);
      v.osc.stop(st + 0.4);
      v2.osc.start(st);
      v2.osc.stop(st + 0.45);
    }
  }

  // Gentle low "nope" buzz (two soft descending notes, not harsh).
  function sfxError(out, t) {
    var notes = [220, 185];
    for (var i = 0; i < notes.length; i++) {
      var st = t + i * 0.12;
      var v = makeOsc('sine', notes[i], out);
      // Mild wobble for a "buzzy" feel without being harsh.
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      v.osc.disconnect();
      v.osc.connect(lp);
      lp.connect(v.gain);
      envelope(v.gain.gain, st, 0.28, 0.01, 0.14);
      v.osc.start(st);
      v.osc.stop(st + 0.3);
    }
  }

  // Short airy swipe for UI transitions.
  function sfxWhoosh(out, t) {
    var noise = makeNoise();
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + 0.18);
    var ng = ctx.createGain();
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(out);
    ng.gain.setValueAtTime(EPS, t);
    ng.gain.linearRampToValueAtTime(0.3, t + 0.08);
    ng.gain.exponentialRampToValueAtTime(EPS, t + 0.22);
    noise.start(t);
    noise.stop(t + 0.25);
  }

  // Lookup table mapping sound names to their generators.
  var SOUNDS = {
    click: sfxClick,
    plant: sfxPlant,
    chop: sfxChop,
    thin: sfxThin,
    coin: sfxCoin,
    ship: sfxShip,
    build: sfxBuild,
    levelup: sfxLevelUp,
    error: sfxError,
    whoosh: sfxWhoosh
  };

  // ---------------------------------------------------------------------------
  // Ambient forest bed
  // ---------------------------------------------------------------------------

  function startAmbientInternal() {
    if (ambient || !ctx) return;

    // Bed master so we can fade the whole thing in/out independently.
    var bed = ctx.createGain();
    bed.gain.setValueAtTime(EPS, now());
    bed.connect(master);

    // --- Soft wind: looping noise through a gentle lowpass, amplitude LFO. ---
    var wind = makeNoise();
    var windLP = ctx.createBiquadFilter();
    windLP.type = 'lowpass';
    windLP.frequency.value = 600;
    var windGain = ctx.createGain();
    windGain.gain.value = 0.08;
    wind.connect(windLP);
    windLP.connect(windGain);
    windGain.connect(bed);

    // Slow LFO modulating the wind amplitude for a breathing feel.
    var lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(windGain.gain);

    wind.start();
    lfo.start();

    // Fade the bed in gently.
    bed.gain.linearRampToValueAtTime(0.5, now() + 2.0);

    ambient = {
      bed: bed,
      wind: wind,
      lfo: lfo,
      chirpTimer: null,
      stopped: false
    };

    // --- Occasional soft bird-like chirps on a randomized timer. ---
    function scheduleChirp() {
      if (!ambient || ambient.stopped) return;
      var delay = 3000 + Math.random() * 7000; // 3–10s between chirps
      ambient.chirpTimer = setTimeout(function () {
        if (!ambient || ambient.stopped) return;
        chirp(bed);
        scheduleChirp();
      }, delay);
    }
    scheduleChirp();
  }

  // A short, sweet sine-blip chirp (sometimes a quick two-note tweet).
  function chirp(dest) {
    if (!ctx) return;
    var t = now();
    var base = 1800 + Math.random() * 1400; // 1.8–3.2 kHz
    var twoNote = Math.random() < 0.5;

    var v = makeOsc('sine', base, dest);
    v.osc.frequency.setValueAtTime(base, t);
    v.osc.frequency.linearRampToValueAtTime(base * 1.15, t + 0.06);
    envelope(v.gain.gain, t, 0.06, 0.01, 0.1);
    v.osc.start(t);
    v.osc.stop(t + 0.2);

    if (twoNote) {
      var st = t + 0.12;
      var v2 = makeOsc('sine', base * 1.1, dest);
      v2.osc.frequency.setValueAtTime(base * 1.2, st);
      v2.osc.frequency.linearRampToValueAtTime(base * 0.95, st + 0.05);
      envelope(v2.gain.gain, st, 0.05, 0.01, 0.09);
      v2.osc.start(st);
      v2.osc.stop(st + 0.18);
    }
  }

  function stopAmbientInternal() {
    if (!ambient || !ctx) return;
    var a = ambient;
    a.stopped = true;
    if (a.chirpTimer) {
      clearTimeout(a.chirpTimer);
      a.chirpTimer = null;
    }
    var t = now();
    // Fade the bed out, then tear down the nodes.
    try {
      a.bed.gain.cancelScheduledValues(t);
      a.bed.gain.setValueAtTime(Math.max(a.bed.gain.value, EPS), t);
      a.bed.gain.exponentialRampToValueAtTime(EPS, t + 1.0);
    } catch (e) { /* ignore */ }

    setTimeout(function () {
      try { a.wind.stop(); } catch (e) {}
      try { a.lfo.stop(); } catch (e) {}
      try { a.bed.disconnect(); } catch (e) {}
    }, 1100);

    ambient = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  var GameAudio = {
    // Lazily create/resume the AudioContext. Safe to call repeatedly.
    init: function () {
      if (!supported) return;
      try {
        if (!ctx) {
          ctx = new AudioCtx();
          master = ctx.createGain();
          master.gain.value = muted ? EPS : MASTER_VOLUME;
          master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended' && ctx.resume) {
          ctx.resume();
        }
      } catch (e) {
        // If anything fails, mark unsupported so all methods no-op.
        supported = false;
        ctx = null;
        master = null;
      }
    },

    // Play a one-shot procedural sound effect by name.
    play: function (name, opts) {
      if (!supported) return;
      if (!ctx) this.init();
      if (!ctx || !master) return;
      var gen = SOUNDS[name];
      if (!gen) return;
      try {
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        var out = outGain(opts);
        gen(out, now());
      } catch (e) { /* never throw from audio */ }
    },

    // Start the looping ambient forest bed (no double-start).
    startAmbient: function () {
      if (!supported) return;
      if (!ctx) this.init();
      if (!ctx) return;
      try {
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        startAmbientInternal();
      } catch (e) {}
    },

    // Stop the ambient bed with a clean fade-out.
    stopAmbient: function () {
      if (!supported) return;
      try { stopAmbientInternal(); } catch (e) {}
    },

    // Mute/unmute everything via the master gain (remembers prior volume).
    setMuted: function (flag) {
      muted = !!flag;
      if (!supported || !master) return;
      try {
        var t = now();
        master.gain.cancelScheduledValues(t);
        if (muted) {
          prevVolume = master.gain.value > EPS ? master.gain.value : MASTER_VOLUME;
          master.gain.setValueAtTime(Math.max(master.gain.value, EPS), t);
          master.gain.exponentialRampToValueAtTime(EPS, t + 0.08);
        } else {
          master.gain.setValueAtTime(Math.max(master.gain.value, EPS), t);
          master.gain.exponentialRampToValueAtTime(prevVolume || MASTER_VOLUME, t + 0.08);
        }
      } catch (e) {}
    },

    // Return current mute state.
    isMuted: function () {
      return muted;
    }
  };

  // Expose globally.
  if (typeof window !== 'undefined') {
    window.GameAudio = GameAudio;
  }
})();
