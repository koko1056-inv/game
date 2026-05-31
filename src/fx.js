/**
 * fx.js — Tween engine + particle/juice system for the forestry tycoon game.
 *
 * Pure vanilla JS, no dependencies. Attached to window.FX via an IIFE.
 *
 * Public API:
 *   FX.ease.{linear,inQuad,outQuad,inOutQuad,outCubic,outBack,outElastic,outBounce,inOutSine}
 *   FX.tween(target, toProps, opts) -> handle
 *   FX.tweenValue(from, to, opts)   -> handle
 *   FX.burst(x, y, type, opts)
 *   FX.floatText(x, y, text, opts)
 *   FX.update(dt)   // dt in milliseconds
 *   FX.draw(ctx)
 *   FX.clear()
 *   FX.count()      // active particle count
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Easing functions (Robert Penner). All take t in [0,1] -> value.
  // ------------------------------------------------------------------
  var ease = {
    linear: function (t) { return t; },

    inQuad: function (t) { return t * t; },

    outQuad: function (t) { return t * (2 - t); },

    inOutQuad: function (t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },

    outCubic: function (t) {
      var u = t - 1;
      return u * u * u + 1;
    },

    // Overshoots slightly past the target then settles — great for "pop".
    outBack: function (t) {
      var c1 = 1.70158;
      var c3 = c1 + 1;
      var u = t - 1;
      return 1 + c3 * u * u * u + c1 * u * u;
    },

    // Springy overshoot oscillation.
    outElastic: function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      var c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },

    // Bouncing settle.
    outBounce: function (t) {
      var n1 = 7.5625;
      var d1 = 2.75;
      if (t < 1 / d1) {
        return n1 * t * t;
      } else if (t < 2 / d1) {
        t -= 1.5 / d1;
        return n1 * t * t + 0.75;
      } else if (t < 2.5 / d1) {
        t -= 2.25 / d1;
        return n1 * t * t + 0.9375;
      } else {
        t -= 2.625 / d1;
        return n1 * t * t + 0.984375;
      }
    },

    inOutSine: function (t) {
      return -(Math.cos(Math.PI * t) - 1) / 2;
    }
  };

  // ------------------------------------------------------------------
  // Internal state — simple arrays, reused across frames.
  // ------------------------------------------------------------------
  var tweens = [];     // active tween handles
  var particles = [];  // active particles
  var texts = [];      // active floating texts

  // ------------------------------------------------------------------
  // Small utilities.
  // ------------------------------------------------------------------
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // Resolve an easing option that may be a function or a string name.
  function resolveEasing(e) {
    if (typeof e === 'function') return e;
    if (typeof e === 'string' && ease[e]) return ease[e];
    return ease.outCubic;
  }

  // ------------------------------------------------------------------
  // Tween implementation.
  // ------------------------------------------------------------------
  function Tween(target, toProps, opts) {
    opts = opts || {};
    this.target = target;
    this.to = toProps || {};
    this.from = null;            // captured on first update after delay
    this.duration = opts.duration != null ? opts.duration : 300;
    this.easing = resolveEasing(opts.easing);
    this.delay = opts.delay || 0;
    this.onUpdate = opts.onUpdate || null;
    this.onComplete = opts.onComplete || null;
    this.loop = !!opts.loop;
    this.yoyo = !!opts.yoyo;

    this.elapsed = 0;            // time spent in the active (post-delay) phase
    this.delayLeft = this.delay;
    this.reversed = false;       // for yoyo direction
    this.finished = false;
    this._cancelled = false;
  }

  Tween.prototype._capture = function () {
    this.from = {};
    for (var k in this.to) {
      if (this.to.hasOwnProperty(k)) {
        var cur = this.target ? this.target[k] : 0;
        this.from[k] = typeof cur === 'number' ? cur : 0;
      }
    }
  };

  Tween.prototype.cancel = function () {
    this._cancelled = true;
    this.finished = true;
  };

  // Advance by dt ms. Returns true while alive.
  Tween.prototype.step = function (dt) {
    if (this._cancelled || this.finished) return false;

    if (this.delayLeft > 0) {
      this.delayLeft -= dt;
      if (this.delayLeft > 0) return true;
      // consume the remainder of dt past the delay
      dt = -this.delayLeft;
      this.delayLeft = 0;
    }

    // Capture start values lazily, at first update after delay.
    if (this.from === null) this._capture();

    this.elapsed += dt;
    var dur = this.duration <= 0 ? 0.000001 : this.duration;
    var raw = clamp01(this.elapsed / dur);
    var p = this.reversed ? 1 - raw : raw;
    var k = this.easing(p);

    // Apply to all properties.
    if (this.target) {
      for (var key in this.to) {
        if (this.to.hasOwnProperty(key)) {
          var a = this.from[key];
          var b = this.to[key];
          this.target[key] = a + (b - a) * k;
        }
      }
    }

    if (this.onUpdate) {
      try { this.onUpdate(this.target); } catch (e) {}
    }

    if (raw >= 1) {
      // One leg done. Handle yoyo / loop.
      if (this.yoyo && !this.reversed) {
        this.reversed = true;
        this.elapsed = 0;
        return true;
      }
      if (this.loop) {
        this.reversed = false;
        this.elapsed = 0;
        // re-capture so loops chain from current values cleanly
        return true;
      }
      this.finished = true;
      if (this.onComplete) {
        try { this.onComplete(this.target); } catch (e) {}
      }
      return false;
    }
    return true;
  };

  function tween(target, toProps, opts) {
    var t = new Tween(target, toProps, opts);
    tweens.push(t);
    return t;
  }

  // Scalar tween: animates a single value, reporting via onUpdate(value).
  function tweenValue(from, to, opts) {
    opts = opts || {};
    // Use a private holder object as the tween target.
    var holder = { v: from };
    var userUpdate = opts.onUpdate || null;
    var userComplete = opts.onComplete || null;

    var inner = {
      duration: opts.duration,
      easing: opts.easing,
      delay: opts.delay,
      loop: opts.loop,
      yoyo: opts.yoyo,
      onUpdate: function () {
        if (userUpdate) {
          try { userUpdate(holder.v); } catch (e) {}
        }
      },
      onComplete: function () {
        if (userComplete) {
          try { userComplete(holder.v); } catch (e) {}
        }
      }
    };
    return tween(holder, { v: to }, inner);
  }

  // ------------------------------------------------------------------
  // Particles.
  // ------------------------------------------------------------------
  // A particle is a plain object. We push onto `particles`.
  function spawnParticle(p) {
    particles.push(p);
  }

  // Default palettes per type.
  var LEAF_COLORS = ['#5fbf3a', '#84d65a', '#3f9e2e', '#c9d94a', '#a7cf3e'];
  var COIN_COLORS = ['#ffd84d', '#ffc928', '#ffe79a'];
  var CHIP_COLORS = ['#9c6b3a', '#7d4f24', '#b9874f', '#6b441f'];
  var SPARK_COLORS = ['#fff7c2', '#ffe57a', '#aef0ff', '#ffffff'];
  var DUST_COLORS = ['#d8c7a3', '#e6dcc2', '#cdb98f'];

  /**
   * Spawn a particle burst at canvas coords (x,y).
   * type: "leaves" | "coins" | "woodchips" | "sparkle" | "dust"
   * opts: { count, color, spread, power }
   */
  function burst(x, y, type, opts) {
    opts = opts || {};
    var spread = opts.spread != null ? opts.spread : Math.PI * 2; // angular spread
    var power = opts.power != null ? opts.power : 1;
    var count, i, ang, spd, p;

    switch (type) {
      case 'leaves':
        count = opts.count != null ? opts.count : 12;
        for (i = 0; i < count; i++) {
          ang = rand(-Math.PI, 0); // mostly upward/outward
          spd = rand(0.04, 0.13) * power;
          p = baseParticle(x, y, type);
          p.vx = Math.cos(ang) * spd + rand(-0.03, 0.03);
          p.vy = Math.sin(ang) * spd - rand(0.02, 0.08) * power;
          p.gravity = 0.00018;
          p.drag = 0.992;
          p.size = rand(4, 8);
          p.rotation = rand(0, Math.PI * 2);
          p.spin = rand(-0.006, 0.006);
          p.flutter = rand(0.001, 0.003); // horizontal sway amplitude
          p.flutterPhase = rand(0, Math.PI * 2);
          p.maxLife = p.life = rand(900, 1600);
          p.color = opts.color || pick(LEAF_COLORS);
          spawnParticle(p);
        }
        break;

      case 'coins':
        count = opts.count != null ? opts.count : 10;
        for (i = 0; i < count; i++) {
          ang = rand(-Math.PI * 0.75, -Math.PI * 0.25); // pop upward
          spd = rand(0.12, 0.26) * power;
          p = baseParticle(x, y, type);
          p.vx = Math.cos(ang) * spd;
          p.vy = Math.sin(ang) * spd;
          p.gravity = 0.0009;
          p.drag = 0.999;
          p.size = rand(6, 10);
          p.rotation = rand(0, Math.PI * 2);
          p.spin = rand(-0.012, 0.012);
          p.maxLife = p.life = rand(700, 1200);
          p.color = opts.color || pick(COIN_COLORS);
          spawnParticle(p);
        }
        break;

      case 'woodchips':
        count = opts.count != null ? opts.count : 14;
        for (i = 0; i < count; i++) {
          ang = rand(0, spread) - spread / 2 - Math.PI / 2; // around, biased up
          spd = rand(0.1, 0.28) * power;
          p = baseParticle(x, y, type);
          p.vx = Math.cos(ang) * spd;
          p.vy = Math.sin(ang) * spd;
          p.gravity = 0.0011;
          p.drag = 0.99;
          p.size = rand(3, 6);
          p.w = rand(3, 7);
          p.h = rand(2, 4);
          p.rotation = rand(0, Math.PI * 2);
          p.spin = rand(-0.02, 0.02);
          p.maxLife = p.life = rand(500, 1000);
          p.color = opts.color || pick(CHIP_COLORS);
          spawnParticle(p);
        }
        break;

      case 'sparkle':
        count = opts.count != null ? opts.count : 14;
        for (i = 0; i < count; i++) {
          ang = rand(0, Math.PI * 2);
          spd = rand(0.02, 0.1) * power;
          p = baseParticle(x, y, type);
          p.vx = Math.cos(ang) * spd;
          p.vy = Math.sin(ang) * spd - rand(0.02, 0.06); // drift up
          p.gravity = -0.00005; // gentle lift
          p.drag = 0.97;
          p.size = rand(3, 7);
          p.rotation = rand(0, Math.PI * 2);
          p.spin = rand(-0.01, 0.01);
          p.twinkle = rand(0.005, 0.02);
          p.twinklePhase = rand(0, Math.PI * 2);
          p.maxLife = p.life = rand(600, 1100);
          p.color = opts.color || pick(SPARK_COLORS);
          spawnParticle(p);
        }
        break;

      case 'dust':
        count = opts.count != null ? opts.count : 10;
        for (i = 0; i < count; i++) {
          ang = rand(0, Math.PI * 2);
          spd = rand(0.01, 0.06) * power;
          p = baseParticle(x, y, type);
          p.vx = Math.cos(ang) * spd;
          p.vy = Math.sin(ang) * spd * 0.5 - rand(0, 0.02);
          p.gravity = -0.00002;
          p.drag = 0.94;
          p.size = rand(5, 11);
          p.grow = rand(0.01, 0.03); // expands over time
          p.maxLife = p.life = rand(450, 800);
          p.color = opts.color || pick(DUST_COLORS);
          spawnParticle(p);
        }
        break;

      default:
        // Unknown type: do nothing rather than throw.
        break;
    }
  }

  // Create a particle with shared default fields.
  function baseParticle(x, y, type) {
    return {
      type: type,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      gravity: 0,
      drag: 1,
      size: 4,
      w: 0,
      h: 0,
      rotation: 0,
      spin: 0,
      flutter: 0,
      flutterPhase: 0,
      twinkle: 0,
      twinklePhase: 0,
      grow: 0,
      color: '#ffffff',
      alpha: 1,
      life: 1000,
      maxLife: 1000,
      age: 0
    };
  }

  // ------------------------------------------------------------------
  // Floating text.
  // ------------------------------------------------------------------
  /**
   * Spawn a rising, fading text label.
   * opts: { color, size, duration, dy }
   */
  function floatText(x, y, text, opts) {
    opts = opts || {};
    texts.push({
      x: x,
      y: y,
      text: text == null ? '' : String(text),
      color: opts.color || '#ffffff',
      size: opts.size != null ? opts.size : 18,
      duration: opts.duration != null ? opts.duration : 1100,
      dy: opts.dy != null ? opts.dy : -40, // total vertical travel over lifetime
      life: opts.duration != null ? opts.duration : 1100,
      maxLife: opts.duration != null ? opts.duration : 1100,
      startY: y,
      alpha: 1
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle: update.
  // ------------------------------------------------------------------
  function update(dt) {
    if (!(dt > 0)) return;

    // Tweens
    var i;
    for (i = tweens.length - 1; i >= 0; i--) {
      var alive = tweens[i].step(dt);
      if (!alive) tweens.splice(i, 1);
    }

    // Particles
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      // Integrate motion.
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt / 16.6667);
      p.vy *= Math.pow(p.drag, dt / 16.6667);

      // Fluttering horizontal sway (leaves).
      if (p.flutter) {
        p.flutterPhase += dt * 0.006;
        p.x += Math.sin(p.flutterPhase) * p.flutter * dt;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;

      // Twinkle phase advance (sparkle).
      if (p.twinkle) p.twinklePhase += p.twinkle * dt;

      // Dust grows.
      if (p.grow) p.size += p.grow * dt * 0.06;

      // Fade out over the last portion of life.
      var lifeRatio = p.life / p.maxLife; // 1 -> 0
      // Fade in quickly, then fade out near the end.
      var fadeIn = clamp01(p.age / 120);
      var fadeOut = clamp01(lifeRatio / 0.4); // start fading in last 40%
      p.alpha = Math.min(fadeIn, fadeOut);
    }

    // Float texts
    for (i = texts.length - 1; i >= 0; i--) {
      var t = texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        texts.splice(i, 1);
        continue;
      }
      var prog = 1 - t.life / t.maxLife; // 0 -> 1
      // Ease the rise with outCubic for a nice pop upward.
      t.y = t.startY + t.dy * ease.outCubic(prog);
      // Fade in fast, fade out toward the end.
      var fi = clamp01(prog / 0.12);
      var fo = clamp01((1 - prog) / 0.4);
      t.alpha = Math.min(fi, fo);
    }
  }

  // ------------------------------------------------------------------
  // Lifecycle: draw.
  // ------------------------------------------------------------------
  function draw(ctx) {
    if (!ctx) return;

    var i, p;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);

      switch (p.type) {
        case 'coins':
          drawCoin(ctx, p);
          break;
        case 'leaves':
          drawLeaf(ctx, p);
          break;
        case 'woodchips':
          drawChip(ctx, p);
          break;
        case 'sparkle':
          drawSparkle(ctx, p);
          break;
        case 'dust':
          drawDust(ctx, p);
          break;
        default:
          break;
      }
      ctx.restore();
    }

    // Floating texts.
    for (i = 0; i < texts.length; i++) {
      var t = texts[i];
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.font = 'bold ' + t.size + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Soft shadow for legibility.
      ctx.lineWidth = Math.max(2, t.size * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  // --- Per-type drawing helpers ---

  function drawCoin(ctx, p) {
    var r = p.size;
    // Squash horizontally as it "spins" to fake 3D rotation.
    var sx = Math.abs(Math.cos(p.rotation)) * 0.7 + 0.3;
    ctx.scale(sx, 1);
    // Body
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    // Rim
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.strokeStyle = 'rgba(180,130,10,0.7)';
    ctx.stroke();
    // Highlight
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }

  function drawLeaf(ctx, p) {
    ctx.rotate(p.rotation);
    var w = p.size;
    var h = p.size * 0.6;
    ctx.fillStyle = p.color;
    // Rounded-leaf ellipse.
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    // Central vein.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = Math.max(0.5, p.size * 0.08);
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(w, 0);
    ctx.stroke();
  }

  function drawChip(ctx, p) {
    ctx.rotate(p.rotation);
    var w = p.w || p.size;
    var h = p.h || p.size * 0.5;
    ctx.fillStyle = p.color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // Subtle top highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-w / 2, -h / 2, w, Math.max(1, h * 0.35));
  }

  function drawSparkle(ctx, p) {
    ctx.rotate(p.rotation);
    // Twinkle scaling.
    var tw = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(p.twinklePhase));
    var r = p.size * tw;
    ctx.fillStyle = p.color;
    // 4-point star via two crossed diamonds.
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.28, -r * 0.28);
    ctx.lineTo(r, 0);
    ctx.lineTo(r * 0.28, r * 0.28);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.28, r * 0.28);
    ctx.lineTo(-r, 0);
    ctx.lineTo(-r * 0.28, -r * 0.28);
    ctx.closePath();
    ctx.fill();
    // Bright core.
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }

  function drawDust(ctx, p) {
    var r = p.size;
    // Soft radial-ish puff using layered translucent circles.
    ctx.fillStyle = p.color;
    ctx.globalAlpha = ctx.globalAlpha * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ------------------------------------------------------------------
  // Lifecycle: clear / count.
  // ------------------------------------------------------------------
  function clear() {
    tweens.length = 0;
    particles.length = 0;
    texts.length = 0;
  }

  function count() {
    return particles.length;
  }

  // ------------------------------------------------------------------
  // Export.
  // ------------------------------------------------------------------
  var FX = {
    ease: ease,
    tween: tween,
    tweenValue: tweenValue,
    burst: burst,
    floatText: floatText,
    update: update,
    draw: draw,
    clear: clear,
    count: count
  };

  if (typeof window !== 'undefined') {
    window.FX = FX;
  }
  // Also support module environments for tooling (harmless in browser).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FX;
  }
})();
