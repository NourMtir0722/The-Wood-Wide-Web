/* The Wood Wide Web — procedural soundscape & enchanted forest RPG foley (Web Audio API)
 *
 * Synthesizes every sound effect and ambient layer in real time with zero external audio assets:
 *   • Carved mossy stone clicks, wooden marimba ticks, parchment rustles and crystal rune chimes
 *   • Shared stereo forest-glade convolution reverb + pink-noise foley buffer
 *   • Reactive 3-layer forest ambience (canopy breeze, subterranean mycelium drone, day birds /
 *     night crickets & spore twinkles) driven continuously by the 3D engine's camera & sky clock
 *   • Stereo-panned caterpillar crunch & travelling underground distress pulse → birch shield bloom
 *
 * Exposes window.createForestSfx() → controller API. Respects browser autoplay policies by lazily
 * creating/resuming the AudioContext on the first user gesture.
 */
(() => {
  'use strict';

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const STORAGE_KEY = 'www-sfx-muted';

  // D Lydian / D Major Pentatonic palette (Hz) — warm, sunlit & bioluminescent
  const NOTE = {
    D2: 73.42, A2: 110.0, Bb2: 116.54,
    D3: 146.83, E3: 164.81, Fs3: 185.0, A3: 220.0, B3: 246.94,
    D4: 293.66, E4: 329.63, Fs4: 369.99, G4: 392.0, Gs4: 415.3, A4: 440.0, B4: 493.88,
    Cs5: 554.37, D5: 587.33, E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99, Gs5: 830.61, A5: 880.0, B5: 987.77,
    Cs6: 1108.73, D6: 1174.66, E6: 1318.51, Fs6: 1479.98
  };

  const SUN_KALIMBA = [
    NOTE.D4, NOTE.E4, NOTE.Fs4, NOTE.A4, NOTE.B4,
    NOTE.D5, NOTE.E5, NOTE.Fs5, NOTE.A5, NOTE.B5, NOTE.D6
  ];

  const CHAPTER_NOTES = [NOTE.D4, NOTE.E4, NOTE.Fs4, NOTE.A4, NOTE.B4];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const jitter = (amt = 0.03) => 1 + (Math.random() * 2 - 1) * amt;

  window.createForestSfx = function createForestSfx() {
    let muted = false;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) { /* storage unavailable */ }

    let ctx = null;
    let masterGain = null;
    let dryBus = null;
    let reverbSend = null;
    let ambienceBus = null;
    let noiseBuffer = null;

    // Reactive ambience nodes
    let ambStarted = false;
    let windGain = null;
    let windFilter = null;
    let humGain = null;
    let humFilter = null;
    let creatureTimer = null;

    // Tracked world state from app.js + engine.js
    const world = {
      screen: 'title',
      nightMix: 1,
      sunlight: 0.85,
      underground: 0,
      xray: true,
      paused: false,
      inView: true,
      docHidden: document.hidden,
      attackActive: false,
      attackProgress: 0
    };

    let lastHoverAt = 0;
    let lastSunStep = -1;
    let lastSunAt = 0;
    let lastPulseAt = 0;

    // -------------------------------------------------------------------------
    // 1. Lazy AudioContext, shared impulse reverb & noise source
    // -------------------------------------------------------------------------
    function buildNoiseBuffer(context) {
      const len = Math.floor(context.sampleRate * 3);
      const buf = context.createBuffer(2, len, context.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const out = buf.getChannelData(ch);
        // Paul Kellet's pink noise filter for warm organic wind/stone/parchment texture
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520;
          b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.0168980;
          out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.045;
          b6 = w * 0.115926;
        }
        // Crossfade loop seam (last 1024 samples) so ambient wind never clicks
        const fade = 1024;
        for (let i = 0; i < fade; i++) {
          const u = i / fade;
          out[len - fade + i] = out[len - fade + i] * (1 - u) + out[i] * u;
        }
      }
      return buf;
    }

    function buildForestImpulse(context) {
      const dur = 1.55;
      const len = Math.floor(context.sampleRate * dur);
      const ir = context.createBuffer(2, len, context.sampleRate);
      const taps = [
        [0.017, 0.34], [0.031, -0.24], [0.053, 0.19], [0.081, -0.14]
      ];
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / context.sampleRate;
          const env = Math.pow(1 - t / dur, 2.8) * Math.exp(-t * 2.4);
          const raw = (Math.random() * 2 - 1) * env;
          // Damped high frequencies like mossy timber & damp earth
          lp += (raw - lp) * (0.28 - 0.16 * (t / dur));
          d[i] = lp * 0.85;
        }
        for (const [sec, amp] of taps) {
          const idx = Math.floor((sec + ch * 0.004) * context.sampleRate);
          if (idx < len) d[idx] += amp;
        }
      }
      return ir;
    }

    function ensureContext() {
      if (!AudioCtx || muted) return null;
      if (!ctx) {
        // A context made before the first click or key press starts suspended, and every
        // hover tick queued on it would then play at once on that first click.
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
        try {
          ctx = new AudioCtx();
        } catch (_) {
          return null;
        }

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 18;
        comp.ratio.value = 4;
        comp.attack.value = 0.005;
        comp.release.value = 0.18;

        masterGain = ctx.createGain();
        masterGain.gain.value = muted ? 0 : 0.9;

        dryBus = ctx.createGain();
        dryBus.gain.value = 0.88;

        reverbSend = ctx.createGain();
        reverbSend.gain.value = 1.0;

        const convolver = ctx.createConvolver();
        convolver.buffer = buildForestImpulse(ctx);
        const reverbReturn = ctx.createGain();
        reverbReturn.gain.value = 0.42;

        ambienceBus = ctx.createGain();
        ambienceBus.gain.value = 0.0001;

        dryBus.connect(comp);
        reverbSend.connect(convolver);
        convolver.connect(reverbReturn);
        reverbReturn.connect(comp);
        ambienceBus.connect(comp);
        comp.connect(masterGain);
        masterGain.connect(ctx.destination);

        noiseBuffer = buildNoiseBuffer(ctx);
      }

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (!ambStarted && ctx.state !== 'closed') {
        startAmbience();
      }
      return ctx;
    }

    // -------------------------------------------------------------------------
    // 2. Low-level synthesis building blocks
    // -------------------------------------------------------------------------
    function routeOut(node, { wet = 0.25, pan = 0 } = {}) {
      let tail = node;
      if (pan !== 0 && ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = clamp(pan, -1, 1);
        node.connect(panner);
        tail = panner;
      }
      tail.connect(dryBus);
      if (wet > 0.005) {
        const send = ctx.createGain();
        send.gain.value = wet;
        tail.connect(send);
        send.connect(reverbSend);
      }
    }

    function playTone({
      freq,
      endFreq = null,
      type = 'sine',
      gain = 0.1,
      attack = 0.006,
      decay = 0.28,
      delay = 0,
      wet = 0.28,
      pan = 0,
      filterFreq = 0,
      detune = 0
    }) {
      const c = ensureContext();
      if (!c) return;
      const t0 = c.currentTime + 0.004 + delay;
      const tPeak = t0 + attack;
      const tEnd = tPeak + decay;

      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (detune) osc.detune.setValueAtTime(detune, t0);
      if (endFreq && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), tEnd);
      }

      const env = c.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), tPeak);
      env.gain.exponentialRampToValueAtTime(0.0001, tEnd);

      if (filterFreq > 0) {
        const flt = c.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(filterFreq, t0);
        flt.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.35), tEnd);
        osc.connect(flt);
        flt.connect(env);
      } else {
        osc.connect(env);
      }

      routeOut(env, { wet, pan });
      osc.start(t0);
      osc.stop(tEnd + 0.03);
    }

    function playNoise({
      dur = 0.12,
      gain = 0.08,
      attack = 0.008,
      filterType = 'bandpass',
      freq = 900,
      endFreq = null,
      q = 1.6,
      delay = 0,
      wet = 0.18,
      pan = 0
    }) {
      const c = ensureContext();
      if (!c || !noiseBuffer) return;
      const t0 = c.currentTime + 0.004 + delay;
      const tPeak = t0 + attack;
      const tEnd = t0 + Math.max(attack + 0.01, dur);

      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      const maxOffset = Math.max(0, noiseBuffer.duration - dur - 0.05);
      const offset = Math.random() * maxOffset;

      const flt = c.createBiquadFilter();
      flt.type = filterType;
      flt.Q.value = q;
      flt.frequency.setValueAtTime(freq, t0);
      if (endFreq && endFreq !== freq) {
        flt.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), tEnd);
      }

      const env = c.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), tPeak);
      env.gain.exponentialRampToValueAtTime(0.0001, tEnd);

      src.connect(flt);
      flt.connect(env);
      routeOut(env, { wet, pan });

      src.start(t0, offset, dur + 0.04);
      src.stop(tEnd + 0.03);
    }

    // Crystal / rune bell: fundamental + warm fifth/octave/crystal partial
    function playRuneBell(freq, { delay = 0, gain = 0.085, decay = 0.85, wet = 0.55, pan = 0, crystal = true } = {}) {
      playTone({ freq, type: 'sine', gain, attack: 0.005, decay, delay, wet, pan });
      playTone({ freq: freq * 2, type: 'sine', gain: gain * 0.28, attack: 0.004, decay: decay * 0.62, delay, wet, pan });
      if (crystal) {
        playTone({ freq: freq * 2.756, type: 'sine', gain: gain * 0.11, attack: 0.003, decay: decay * 0.36, delay, wet, pan });
      }
    }

    // Hollow wooden marimba / kalimba pluck
    function playWoodPluck(freq, { delay = 0, gain = 0.09, decay = 0.26, wet = 0.34, pan = 0 } = {}) {
      playTone({
        freq: freq * 1.008,
        endFreq: freq,
        type: 'triangle',
        gain,
        attack: 0.003,
        decay,
        delay,
        wet,
        pan,
        filterFreq: freq * 3.8
      });
      playTone({
        freq: freq * 3.98,
        type: 'sine',
        gain: gain * 0.16,
        attack: 0.002,
        decay: 0.035,
        delay,
        wet: wet * 0.5,
        pan
      });
    }

    // Carved mossy stone thud + grit
    function playStoneBody({ pitch = 1, gain = 0.11, delay = 0, pan = 0 } = {}) {
      const p = pitch * jitter(0.04);
      playTone({
        freq: 132 * p,
        endFreq: 52 * p,
        type: 'sine',
        gain,
        attack: 0.003,
        decay: 0.085,
        delay,
        wet: 0.14,
        pan
      });
      playNoise({
        dur: 0.036,
        gain: gain * 0.52,
        attack: 0.002,
        filterType: 'bandpass',
        freq: 920 * p,
        endFreq: 420 * p,
        q: 2.1,
        delay,
        wet: 0.12,
        pan
      });
    }

    // -------------------------------------------------------------------------
    // 3. Reactive 3-layer forest ambience (wind, mycelium hum, day/night life)
    // -------------------------------------------------------------------------
    function startAmbience() {
      if (ambStarted || !ctx || !noiseBuffer) return;
      ambStarted = true;
      const now = ctx.currentTime;

      // Layer A: Canopy breeze (looped pink noise + slow organic filter sway)
      const windSrc = ctx.createBufferSource();
      windSrc.buffer = noiseBuffer;
      windSrc.loop = true;

      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(440, now);
      windFilter.Q.value = 1.35;

      const windLfo = ctx.createOscillator();
      windLfo.type = 'sine';
      windLfo.frequency.value = 0.11;
      const windLfoGain = ctx.createGain();
      windLfoGain.gain.value = 135;
      windLfo.connect(windLfoGain);
      windLfoGain.connect(windFilter.frequency);

      windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0.018, now);

      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ambienceBus);
      windSrc.start(now);
      windLfo.start(now);

      // Layer B: Subterranean mycelium resonance (warm D2 + A2 + filtered D3 harmonic)
      humFilter = ctx.createBiquadFilter();
      humFilter.type = 'lowpass';
      humFilter.frequency.setValueAtTime(190, now);
      humFilter.Q.value = 0.9;

      humGain = ctx.createGain();
      humGain.gain.setValueAtTime(0.018, now);

      const d2 = ctx.createOscillator();
      d2.type = 'sine';
      d2.frequency.value = NOTE.D2;
      const d2g = ctx.createGain();
      d2g.gain.value = 0.55;

      const a2 = ctx.createOscillator();
      a2.type = 'sine';
      a2.frequency.value = NOTE.A2;
      const a2g = ctx.createGain();
      a2g.gain.value = 0.32;

      const d3 = ctx.createOscillator();
      d3.type = 'triangle';
      d3.frequency.value = NOTE.D3;
      const d3g = ctx.createGain();
      d3g.gain.value = 0.18;

      const humLfo = ctx.createOscillator();
      humLfo.type = 'sine';
      humLfo.frequency.value = 0.085;
      const humLfoGain = ctx.createGain();
      humLfoGain.gain.value = 55;
      humLfo.connect(humLfoGain);
      humLfoGain.connect(humFilter.frequency);

      d2.connect(d2g); d2g.connect(humFilter);
      a2.connect(a2g); a2g.connect(humFilter);
      d3.connect(d3g); d3g.connect(humFilter);
      humFilter.connect(humGain);
      humGain.connect(ambienceBus);

      d2.start(now);
      a2.start(now);
      d3.start(now);
      humLfo.start(now);

      syncAmbienceLevels();
      scheduleNextCreature();
    }

    function syncAmbienceLevels() {
      if (!ctx || !ambStarted) return;
      const now = ctx.currentTime;
      const active = !muted && !world.docHidden;
      const scrollDuck = world.inView ? 1 : 0.22;
      const pauseDuck = world.paused && world.screen === 'play' ? 0.35 : 1;
      const busTarget = active ? 0.85 * scrollDuck * pauseDuck : 0.0001;
      ambienceBus.gain.setTargetAtTime(busTarget, now, 0.25);

      if (!active) return;

      // Canopy wind: airier by day & above ground; hushed underground & at night
      const sunFactor = 0.45 + world.sunlight * 0.55;
      const skyFactor = 1 - world.nightMix * 0.48;
      const canopyFactor = 1 - world.underground * 0.55;
      const wGain = clamp(0.046 * sunFactor * skyFactor * canopyFactor, 0.008, 0.055);
      const wFreq = 340 + (1 - world.nightMix) * 180 + (1 - world.underground) * 90;
      windGain.gain.setTargetAtTime(wGain, now, 0.35);
      windFilter.frequency.setTargetAtTime(wFreq, now, 0.45);

      // Subterranean hum: deeper & warmer underground, with X-Ray on, or under night bioluminescence
      const subBoost = 0.42 + world.underground * 0.78 + world.nightMix * 0.32 + (world.xray ? 0.16 : 0);
      const hGain = clamp(0.024 * subBoost, 0.01, 0.044);
      const hFreq = 165 + world.underground * 95 + world.nightMix * 45;
      humGain.gain.setTargetAtTime(hGain, now, 0.35);
      humFilter.frequency.setTargetAtTime(hFreq, now, 0.45);
    }

    function playSongbird() {
      if (!ctx || muted || world.docHidden || !world.inView) return;
      const pan = (Math.random() * 1.3 - 0.65);
      const base = 1850 + Math.random() * 650;
      const notes = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < notes; i++) {
        const f1 = base * (i % 2 === 0 ? 1 : 1.18) * jitter(0.04);
        const f2 = f1 * (i === notes - 1 ? 1.24 : 0.88);
        playTone({
          freq: f1,
          endFreq: f2,
          type: 'sine',
          gain: 0.016,
          attack: 0.012,
          decay: 0.085,
          delay: i * 0.11,
          wet: 0.65,
          pan
        });
      }
    }

    function playNightCreature() {
      if (!ctx || muted || world.docHidden || !world.inView) return;
      const pan = (Math.random() * 1.4 - 0.7);
      if (Math.random() < 0.55) {
        // Gentle distant cricket stridulation
        const chirps = 3 + Math.floor(Math.random() * 2);
        const carrier = 4080 * jitter(0.03);
        for (let i = 0; i < chirps; i++) {
          playTone({
            freq: carrier,
            endFreq: carrier * 0.97,
            type: 'sine',
            gain: 0.0085,
            attack: 0.004,
            decay: 0.026,
            delay: i * 0.046,
            wet: 0.45,
            pan
          });
        }
      } else {
        // Bioluminescent spore / firefly harmonic shimmer
        const pool = [NOTE.A5, NOTE.B5, NOTE.D6, NOTE.Fs6];
        const f = pool[Math.floor(Math.random() * pool.length)];
        playTone({
          freq: f,
          type: 'sine',
          gain: 0.014,
          attack: 0.035,
          decay: 0.95,
          wet: 0.75,
          pan
        });
      }
    }

    function scheduleNextCreature() {
      clearTimeout(creatureTimer);
      if (muted || world.docHidden) return;
      const waitMs = 4200 + Math.random() * 4800;
      creatureTimer = setTimeout(() => {
        if (!muted && !world.docHidden && !world.paused && world.inView && ctx?.state === 'running') {
          if (world.nightMix < 0.46) playSongbird();
          else if (world.nightMix > 0.54) playNightCreature();
        }
        scheduleNextCreature();
      }, waitMs);
    }

    document.addEventListener('visibilitychange', () => {
      world.docHidden = document.hidden;
      syncAmbienceLevels();
      if (!document.hidden && !muted && ctx) scheduleNextCreature();
    });

    // Unlock AudioContext on first organic user interaction if not muted
    const unlockOnce = (e) => {
      if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey)) return;
      if (e.target?.closest?.('#sfx-toggle, #title-sfx-toggle')) return;
      if (!muted) {
        const c = ensureContext();
        if (c?.state === 'running') {
          window.removeEventListener('pointerdown', unlockOnce);
          window.removeEventListener('keydown', unlockOnce);
        }
      }
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('keydown', unlockOnce, { passive: true });

    // -------------------------------------------------------------------------
    // 4. Bespoke Enchanted Forest RPG SFX
    // -------------------------------------------------------------------------
    return {
      isMuted: () => muted,

      setMuted(nextMuted) {
        muted = !!nextMuted;
        try {
          localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
        } catch (_) { /* ignore */ }

        if (muted) {
          clearTimeout(creatureTimer);
          if (ctx && masterGain) {
            masterGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.025);
          }
        } else {
          const c = ensureContext();
          if (c && masterGain) {
            masterGain.gain.setTargetAtTime(0.9, c.currentTime, 0.03);
            syncAmbienceLevels();
            scheduleNextCreature();
            // Gentle confirmation chime when turning forest sound back on
            playWoodPluck(NOTE.A4, { gain: 0.055, decay: 0.22, wet: 0.4 });
            playRuneBell(NOTE.D5, { delay: 0.065, gain: 0.045, decay: 0.45, wet: 0.5 });
          }
        }
        return muted;
      },

      toggleMuted() {
        return this.setMuted(!muted);
      },

      // Fed every rendered frame / state change so ambience & travelling pulses track the 3D scene
      updateWorld(patch) {
        Object.assign(world, patch);
        syncAmbienceLevels();

        // Travelling subterranean heartbeat while the caterpillar distress signal crosses the web
        if (world.attackActive && !world.paused && !muted && ctx?.state === 'running') {
          const now = performance.now();
          if (now - lastPulseAt > 310) {
            lastPulseAt = now;
            const p = clamp(world.attackProgress, 0, 1);
            const pan = -0.48 + p * 0.96; // Elder Fir (left) → Paper Birch (right)
            const freq = (165 + p * 175) * jitter(0.02);
            playTone({ freq, endFreq: freq * 0.78, type: 'triangle', gain: 0.042, attack: 0.008, decay: 0.16, wet: 0.32, pan, filterFreq: 680 });
            playTone({ freq: freq * 2, type: 'sine', gain: 0.018, attack: 0.005, decay: 0.11, wet: 0.4, pan });
          }
        }
      },

      // Subtle dry-leaf & hollow-wood tick for menu items and 3D codex pins
      hover() {
        const now = performance.now();
        if (now - lastHoverAt < 50) return;
        lastHoverAt = now;
        const p = jitter(0.05);
        playTone({ freq: 510 * p, endFreq: 320 * p, type: 'sine', gain: 0.022, attack: 0.002, decay: 0.024, wet: 0.12 });
        playNoise({ dur: 0.024, gain: 0.014, attack: 0.003, freq: 1850 * p, q: 2.2, wet: 0.1 });
      },

      // Generic carved stone UI button click
      stoneClick(pitch = 1) {
        playStoneBody({ pitch, gain: 0.08 });
        playWoodPluck(NOTE.D4 * pitch * jitter(0.02), { gain: 0.032, decay: 0.11, wet: 0.2 });
      },

      // Title menu navigation
      menuSelect() {
        playStoneBody({ pitch: 0.95, gain: 0.095 });
        playWoodPluck(NOTE.D4, { gain: 0.065, decay: 0.22, wet: 0.35 });
        playWoodPluck(NOTE.A4, { delay: 0.055, gain: 0.055, decay: 0.28, wet: 0.42 });
      },

      menuBack() {
        playStoneBody({ pitch: 0.85, gain: 0.075 });
        playWoodPluck(NOTE.E4, { gain: 0.05, decay: 0.16, wet: 0.28 });
        playWoodPluck(NOTE.A3, { delay: 0.055, gain: 0.048, decay: 0.22, wet: 0.3 });
      },

      // Dawn breaks & the quest begins
      questBegin() {
        playStoneBody({ pitch: 0.82, gain: 0.11 });
        playNoise({ dur: 0.75, gain: 0.038, attack: 0.18, freq: 380, endFreq: 880, q: 1.1, wet: 0.55 });
        playTone({ freq: NOTE.D3, type: 'sine', gain: 0.075, attack: 0.12, decay: 1.35, wet: 0.6 });
        const arp = [NOTE.D4, NOTE.A4, NOTE.E5, NOTE.Fs5, NOTE.A5];
        arp.forEach((f, i) => {
          playWoodPluck(f, {
            delay: 0.06 + i * 0.082,
            gain: 0.068 - i * 0.006,
            decay: 0.5 + i * 0.08,
            wet: 0.55,
            pan: -0.24 + i * 0.12
          });
        });
      },

      // Chapter stone selection (I–V)
      chapterSelect(stepIndex = 0) {
        const idx = clamp(stepIndex, 0, 4);
        playStoneBody({ pitch: 0.9 + idx * 0.05, gain: 0.1 });
        playNoise({ dur: 0.09, gain: 0.026, attack: 0.01, freq: 1350, endFreq: 720, q: 1.5, wet: 0.2 });

        if (idx === 4) {
          // Chapter V (The Ghost Bandit): eerie pale glass interval
          playRuneBell(NOTE.B4, { delay: 0.03, gain: 0.06, decay: 0.75, wet: 0.62, pan: 0.12 });
          playTone({ freq: NOTE.F5, endFreq: NOTE.E5, type: 'sine', gain: 0.042, attack: 0.04, decay: 0.7, delay: 0.1, wet: 0.68, pan: 0.22 });
        } else {
          const root = CHAPTER_NOTES[idx];
          playWoodPluck(root, { delay: 0.02, gain: 0.07, decay: 0.34, wet: 0.42 });
          playRuneBell(root * 1.5, { delay: 0.075, gain: 0.042, decay: 0.52, wet: 0.5, crystal: false });
        }
      },

      // Quest journal tablet slide open / collapse
      journalToggle(isOpen) {
        playStoneBody({ pitch: isOpen ? 1.05 : 0.84, gain: 0.075 });
        playNoise({
          dur: 0.16,
          gain: 0.035,
          attack: 0.018,
          freq: isOpen ? 420 : 820,
          endFreq: isOpen ? 860 : 380,
          q: 1.7,
          wet: 0.22,
          pan: -0.25
        });
      },

      // Silky camera flight swoosh + destination signature
      cameraFly(mode = 'step') {
        playNoise({
          dur: 0.56,
          gain: 0.034,
          attack: 0.14,
          freq: mode === 'underground' ? 480 : 340,
          endFreq: mode === 'underground' ? 150 : 640,
          q: 1.25,
          wet: 0.42
        });

        if (mode === 'underground') {
          // Subterranean dive + cyan mineral glints
          playTone({ freq: 128, endFreq: 54, type: 'sine', gain: 0.075, attack: 0.03, decay: 0.48, wet: 0.4 });
          playRuneBell(NOTE.B5, { delay: 0.18, gain: 0.032, decay: 0.5, wet: 0.65, pan: -0.2 });
          playRuneBell(NOTE.Fs6, { delay: 0.29, gain: 0.026, decay: 0.55, wet: 0.68, pan: 0.22 });
        } else if (mode === 'top') {
          // Airy canopy rustle
          playNoise({ dur: 0.34, gain: 0.026, attack: 0.06, freq: 1600, endFreq: 2400, q: 1.8, delay: 0.08, wet: 0.45 });
          playWoodPluck(NOTE.E5, { delay: 0.12, gain: 0.042, decay: 0.35, wet: 0.5 });
        } else if (mode === 'ghost') {
          // Mysterious Ghost Pipe harmonic glide
          playTone({ freq: NOTE.G5, endFreq: NOTE.Fs5, type: 'sine', gain: 0.04, attack: 0.08, decay: 0.72, delay: 0.12, wet: 0.7, pan: 0.3 });
          playTone({ freq: NOTE.Cs5, type: 'sine', gain: 0.028, attack: 0.1, decay: 0.65, delay: 0.16, wet: 0.65, pan: 0.25 });
        }
      },

      // Subtle tactile touch when grabbing the 3D forest to orbit
      orbitGrab() {
        playTone({ freq: 175 * jitter(0.05), endFreq: 92, type: 'sine', gain: 0.028, attack: 0.002, decay: 0.032, wet: 0.08 });
      },

      // Soil X-Ray peel / restore
      xrayToggle(isOn) {
        playStoneBody({ pitch: isOn ? 1.12 : 0.86, gain: 0.07 });
        if (isOn) {
          playNoise({ dur: 0.28, gain: 0.032, attack: 0.03, freq: 320, endFreq: 1450, q: 2.2, wet: 0.4 });
          playRuneBell(NOTE.Fs5, { delay: 0.05, gain: 0.045, decay: 0.48, wet: 0.55 });
          playRuneBell(NOTE.Cs6, { delay: 0.12, gain: 0.034, decay: 0.52, wet: 0.6 });
        } else {
          playNoise({ dur: 0.24, gain: 0.036, attack: 0.02, freq: 760, endFreq: 190, q: 1.6, wet: 0.25 });
          playTone({ freq: NOTE.A3, endFreq: NOTE.D3, type: 'sine', gain: 0.055, attack: 0.01, decay: 0.28, wet: 0.3 });
        }
      },

      // Day ↔ Night celestial astrolabe dial
      celestialToggle(isNight) {
        // Double mechanical stone-dial click
        playStoneBody({ pitch: 1.18, gain: 0.065 });
        playStoneBody({ pitch: 1.32, gain: 0.048, delay: 0.042 });

        if (isNight) {
          const notes = [NOTE.A5, NOTE.Fs5, NOTE.D5, NOTE.A4];
          notes.forEach((f, i) => {
            playRuneBell(f, { delay: 0.05 + i * 0.085, gain: 0.046 - i * 0.005, decay: 0.7, wet: 0.65, pan: 0.15 - i * 0.1, crystal: i === 0 });
          });
        } else {
          const notes = [NOTE.D4, NOTE.A4, NOTE.E5, NOTE.Fs5];
          notes.forEach((f, i) => {
            playWoodPluck(f, { delay: 0.05 + i * 0.08, gain: 0.06 - i * 0.005, decay: 0.46, wet: 0.5, pan: -0.15 + i * 0.1 });
          });
        }
      },

      // 3D Codex marker opened / closed
      codexOpen(key = 'fir') {
        // Parchment unfurl brush
        playNoise({ dur: 0.11, gain: 0.036, attack: 0.012, freq: 1150, endFreq: 2300, q: 1.5, wet: 0.2 });

        if (key === 'fir') {
          playTone({ freq: NOTE.D3, type: 'triangle', gain: 0.065, attack: 0.015, decay: 0.55, wet: 0.45, filterFreq: 520, pan: -0.25 });
          playWoodPluck(NOTE.A4, { delay: 0.04, gain: 0.06, decay: 0.38, wet: 0.45, pan: -0.2 });
        } else if (key === 'sapling') {
          playWoodPluck(NOTE.A4, { delay: 0.02, gain: 0.055, decay: 0.26, wet: 0.42 });
          playWoodPluck(NOTE.D5, { delay: 0.085, gain: 0.058, decay: 0.32, wet: 0.48 });
        } else if (key === 'birch') {
          playWoodPluck(NOTE.E5, { delay: 0.02, gain: 0.052, decay: 0.3, wet: 0.48, pan: 0.2 });
          playRuneBell(NOTE.B5, { delay: 0.08, gain: 0.038, decay: 0.48, wet: 0.58, pan: 0.25 });
        } else if (key === 'mycelium') {
          [NOTE.Fs4, NOTE.A4, NOTE.Cs5, NOTE.E5].forEach((f, i) => {
            playRuneBell(f, { delay: 0.02 + i * 0.052, gain: 0.038, decay: 0.44, wet: 0.6, pan: -0.2 + i * 0.14, crystal: false });
          });
        } else if (key === 'ghost') {
          playTone({ freq: NOTE.Gs4, endFreq: NOTE.G4, type: 'sine', gain: 0.052, attack: 0.025, decay: 0.62, delay: 0.02, wet: 0.68, pan: 0.3 });
          playRuneBell(NOTE.D5, { delay: 0.09, gain: 0.034, decay: 0.55, wet: 0.68, pan: 0.32 });
        }
      },

      codexClose() {
        playNoise({ dur: 0.065, gain: 0.026, attack: 0.006, freq: 1900, endFreq: 850, q: 1.8, wet: 0.12 });
        playTone({ freq: 240, endFreq: 130, type: 'sine', gain: 0.032, attack: 0.002, decay: 0.04, wet: 0.1 });
      },

      // Glowing rune socket lit in the top HUD
      loreUnlock(isCodex = false, { delay = 0 } = {}) {
        const a = isCodex ? NOTE.Fs5 : NOTE.A5;
        const b = isCodex ? NOTE.B5 : NOTE.D6;
        playRuneBell(a, { delay, gain: 0.058, decay: 0.65, wet: 0.6, pan: -0.08 });
        playRuneBell(b, { delay: delay + 0.095, gain: 0.068, decay: 0.88, wet: 0.68, pan: 0.1 });
      },

      // Sanctuary rank-up fanfare (extra radiant when all 10 runes awaken)
      rankUp(isMax = false) {
        const notes = isMax
          ? [NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.Cs5, NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6]
          : [NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5, NOTE.Fs5];
        playTone({ freq: NOTE.D3, type: 'sine', gain: 0.085, attack: 0.08, decay: isMax ? 2.1 : 1.3, wet: 0.65 });
        notes.forEach((f, i) => {
          const stepDelay = i * (isMax ? 0.075 : 0.085);
          playWoodPluck(f, { delay: stepDelay, gain: 0.065, decay: 0.55, wet: 0.55, pan: -0.3 + (i / notes.length) * 0.6 });
          if (i >= notes.length - 2) {
            playRuneBell(f, { delay: stepDelay + 0.02, gain: 0.058, decay: isMax ? 1.45 : 0.95, wet: 0.72 });
          }
        });
      },

      // Spirit Lens macro modal
      lensOpen() {
        playStoneBody({ pitch: 1.0, gain: 0.08 });
        playRuneBell(NOTE.B4, { delay: 0.03, gain: 0.052, decay: 0.78, wet: 0.62, crystal: true });
        playRuneBell(NOTE.Fs5, { delay: 0.09, gain: 0.045, decay: 0.85, wet: 0.66, crystal: true });
      },

      lensLightToggle(isNight) {
        playStoneBody({ pitch: 1.25, gain: 0.055 });
        playRuneBell(isNight ? NOTE.B5 : NOTE.Fs5, { delay: 0.03, gain: 0.042, decay: 0.5, wet: 0.58 });
      },

      lensClose() {
        playStoneBody({ pitch: 0.82, gain: 0.068 });
      },

      // Chapter III sunlight slider: plays a gentle sunlit kalimba scale across 10%..100%
      sunlightSlide(pct01) {
        const idx = clamp(Math.round(pct01 * (SUN_KALIMBA.length - 1)), 0, SUN_KALIMBA.length - 1);
        const now = performance.now();
        if (idx === lastSunStep || now - lastSunAt < 52) return;
        lastSunStep = idx;
        lastSunAt = now;
        playWoodPluck(SUN_KALIMBA[idx], {
          gain: 0.042 + pct01 * 0.024,
          decay: 0.22,
          wet: 0.38,
          pan: -0.25 + pct01 * 0.5
        });
      },

      // Chapter IV caterpillar attack launched at the Elder Fir (left)
      caterpillarAttack() {
        lastPulseAt = performance.now() + 180;
        // Three crisp leaf-chewing crunches on the left
        [0, 0.105, 0.22].forEach((d, i) => {
          playNoise({
            dur: 0.058,
            gain: 0.072 - i * 0.008,
            attack: 0.003,
            filterType: 'bandpass',
            freq: 2100 + i * 320,
            endFreq: 950,
            q: 2.4,
            delay: d,
            wet: 0.16,
            pan: -0.45
          });
        });
        // Urgent amber chemical-alarm horn swell
        playTone({
          freq: NOTE.E3,
          endFreq: NOTE.Bb2,
          type: 'triangle',
          gain: 0.085,
          attack: 0.03,
          decay: 0.52,
          delay: 0.14,
          wet: 0.45,
          pan: -0.35,
          filterFreq: 720
        });
        playTone({
          freq: NOTE.Bb2 * 2,
          type: 'sine',
          gain: 0.048,
          attack: 0.04,
          decay: 0.45,
          delay: 0.22,
          wet: 0.5,
          pan: -0.25
        });
      },

      // Chapter IV alarm arrives at the Paper Birch (right) → emerald tannin shield blooms
      attackArrived() {
        playNoise({ dur: 0.36, gain: 0.034, attack: 0.04, freq: 1500, endFreq: 2800, q: 1.7, wet: 0.48, pan: 0.42 });
        [NOTE.Fs4, NOTE.A4, NOTE.Cs5, NOTE.E5, NOTE.A5].forEach((f, i) => {
          playRuneBell(f, {
            delay: i * 0.055,
            gain: 0.048,
            decay: 0.65,
            wet: 0.62,
            pan: 0.25 + i * 0.05
          });
        });
      },

      // Campfire line copied
      copyPitch() {
        playNoise({ dur: 0.05, gain: 0.024, attack: 0.004, freq: 2200, q: 2.0, wet: 0.12 });
        playWoodPluck(NOTE.A4, { gain: 0.052, decay: 0.18, wet: 0.32 });
        playRuneBell(NOTE.E5, { delay: 0.065, gain: 0.046, decay: 0.38, wet: 0.45 });
      },

      // Campfire riddle <details> scroll opened / folded
      riddleToggle(isOpen) {
        playNoise({
          dur: 0.13,
          gain: 0.034,
          attack: 0.014,
          freq: isOpen ? 980 : 1850,
          endFreq: isOpen ? 2100 : 880,
          q: 1.5,
          wet: 0.22
        });
        if (isOpen) {
          playWoodPluck(NOTE.D5, { delay: 0.04, gain: 0.048, decay: 0.28, wet: 0.42 });
        } else {
          playTone({ freq: 220, endFreq: 140, type: 'sine', gain: 0.03, attack: 0.003, decay: 0.05, wet: 0.12 });
        }
      }
    };
  };
})();
