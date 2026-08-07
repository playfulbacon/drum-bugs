// Forest-floor foley, synthesised. No samples — everything here is noise,
// filters and envelopes, shaped to sound like leaves, water, wood and stone.

const NOISE_SECONDS = 2;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.pulseOn = true;
  }

  async start() {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const c = new Ctx();
    this.ctx = c;

    this.out = c.createGain();
    this.out.gain.value = 0.8;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 22;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;

    this.out.connect(comp);
    comp.connect(c.destination);

    // Small damp room. Keeps everything sounding close and earthy.
    this.verb = c.createConvolver();
    this.verb.buffer = this._impulse(1.5, 2.8);
    const verbOut = c.createGain();
    verbOut.gain.value = 0.55;
    this.verb.connect(verbOut);
    verbOut.connect(this.out);

    this.send = c.createGain();
    this.send.gain.value = 1;
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3000;
    this.send.connect(damp);
    damp.connect(this.verb);

    this.noiseBuf = this._noise(NOISE_SECONDS);
    this.ready = true;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---- infrastructure -----------------------------------------------------

  _noise(seconds) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  _src() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    return s;
  }

  _route(node, wet = 0.22) {
    node.connect(this.out);
    const s = this.ctx.createGain();
    s.gain.value = wet;
    node.connect(s);
    s.connect(this.send);
  }

  _env(t, peak, attack, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    return g;
  }

  // A low body thump under every stomp, so hits have weight.
  _thump(t, i) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    const g = this._env(t, 0.42 * i, 0.006, 0.14);
    o.connect(g);
    this._route(g, 0.12);
    o.start(t);
    o.stop(t + 0.3);
  }

  // ---- ground voices ------------------------------------------------------
  // Every voice takes (t, intensity 0..1, tone) where tone comes from the bug:
  // heavier bugs push it down and darker, lighter bugs up and brighter.

  leaf(t, i, tone = 1) {
    const c = this.ctx;
    const src = this._src();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 800;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.0;
    bp.frequency.setValueAtTime(3600 * tone, t);
    bp.frequency.exponentialRampToValueAtTime(1400 * tone, t + 0.09);
    const g = this._env(t, 0.5 * i, 0.004, 0.05 + 0.16 * i);
    src.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    this._route(g, 0.2);
    src.start(t);
    src.stop(t + 0.5);
  }

  puddle(t, i, tone = 1) {
    const c = this.ctx;
    const src = this._src();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(900 * tone, t);
    bp.frequency.exponentialRampToValueAtTime(6500 * tone, t + 0.12);
    const g = this._env(t, 0.34 * i, 0.006, 0.3 + 0.7 * i);
    src.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    this._route(g, 0.42);
    src.start(t);
    src.stop(t + 1.6);

    // the plop under the splash
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.06);
    const og = this._env(t, 0.16 * i, 0.004, 0.07);
    o.connect(og);
    this._route(og, 0.2);
    o.start(t);
    o.stop(t + 0.2);
  }

  log(t, i, tone = 1) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(105 * tone, t);
    o.frequency.exponentialRampToValueAtTime(46 * tone, t + 0.1);
    const g = this._env(t, 0.62 * i, 0.005, 0.18 + 0.34 * i);
    o.connect(g);
    this._route(g, 0.18);
    o.start(t);
    o.stop(t + 0.8);

    // knuckle on wood
    const src = this._src();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600 * tone;
    const ng = this._env(t, 0.22 * i, 0.002, 0.035);
    src.connect(lp);
    lp.connect(ng);
    this._route(ng, 0.14);
    src.start(t);
    src.stop(t + 0.15);
  }

  stone(t, i, tone = 1) {
    const c = this.ctx;
    const src = this._src();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2100 * tone;
    bp.Q.value = 2.4;
    const g = this._env(t, 0.4 * i, 0.002, 0.035 + 0.04 * i);
    src.connect(bp);
    bp.connect(g);
    this._route(g, 0.26);
    src.start(t);
    src.stop(t + 0.2);

    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(720 * tone, t);
    o.frequency.exponentialRampToValueAtTime(430 * tone, t + 0.04);
    const og = this._env(t, 0.2 * i, 0.002, 0.05);
    o.connect(og);
    this._route(og, 0.2);
    o.start(t);
    o.stop(t + 0.2);
  }

  moss(t, i, tone = 1) {
    const c = this.ctx;
    const src = this._src();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 780 * tone;
    const g = this._env(t, 0.26 * i, 0.01, 0.1 + 0.1 * i);
    src.connect(lp);
    lp.connect(g);
    this._route(g, 0.24);
    src.start(t);
    src.stop(t + 0.4);
  }

  soil(t, i, tone = 1) {
    const c = this.ctx;
    const src = this._src();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 460 * tone;
    const g = this._env(t, 0.34 * i, 0.004, 0.07 + 0.08 * i);
    src.connect(lp);
    lp.connect(g);
    this._route(g, 0.16);
    src.start(t);
    src.stop(t + 0.3);
  }

  // Bare dirt — what a stomp on nothing sounds like.
  bare(t, i) {
    this.soil(t, i * 0.55, 0.9);
  }

  // ---- flowers ------------------------------------------------------------
  // The one pitched layer. Drums are given; melody is planted.

  flower(t, freq, i, kind) {
    const c = this.ctx;
    const mk = (type, f, gain, rel, wet) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = this._env(t, gain * i, 0.012, rel);
      o.connect(g);
      this._route(g, wet);
      o.start(t);
      o.stop(t + rel + 0.2);
    };

    if (kind === 'dew') {
      mk('triangle', freq * 2, 0.2, 1.5, 0.5);
      mk('sine', freq * 3.01, 0.09, 1.1, 0.5);
      const src = this._src();
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5200;
      const g = this._env(t, 0.1 * i, 0.02, 0.7);
      src.connect(hp);
      hp.connect(g);
      this._route(g, 0.5);
      src.start(t);
      src.stop(t + 1);
    } else if (kind === 'pod') {
      mk('triangle', freq * 0.5, 0.34, 0.42, 0.24);
      mk('sine', freq, 0.12, 0.3, 0.24);
    } else if (kind === 'crystal') {
      mk('sine', freq * 3, 0.16, 0.9, 0.45);
      mk('sine', freq * 4.2, 0.07, 0.7, 0.45);
    } else {
      // bloom — warm and round
      mk('sine', freq, 0.26, 1.3, 0.35);
      mk('sine', freq * 2, 0.09, 0.8, 0.35);
      mk('triangle', freq * 0.5, 0.07, 1.0, 0.3);
    }
  }

  // ---- world --------------------------------------------------------------

  wind(t) {
    const c = this.ctx;
    const src = this._src();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(320, t);
    lp.frequency.linearRampToValueAtTime(1500, t + 1.1);
    lp.frequency.linearRampToValueAtTime(300, t + 2.6);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.9);
    g.gain.linearRampToValueAtTime(0.0001, t + 2.7);
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    this._route(g, 0.5);
    src.start(t);
    src.stop(t + 3);
  }

  pulse(t, accent) {
    if (!this.pulseOn) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = accent ? 1500 : 1100;
    const g = this._env(t, accent ? 0.05 : 0.028, 0.001, 0.022);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  }

  // Placing a bug — a small soft landing.
  drop(t) {
    this.soil(t, 0.5, 1.1);
  }
}
