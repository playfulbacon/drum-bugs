// Synthesised garden foley. No samples — noise, oscillators, filters, envelopes.
// Each bug type has its own footfall timbre; that footfall IS its instrument.

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

    this.verb = c.createConvolver();
    this.verb.buffer = this._impulse(1.4, 2.8);
    const verbOut = c.createGain();
    verbOut.gain.value = 0.5;
    this.verb.connect(verbOut);
    verbOut.connect(this.out);

    this.send = c.createGain();
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3200;
    this.send.connect(damp);
    damp.connect(this.verb);

    this.noiseBuf = this._noise(2);
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

  _route(node, wet = 0.2) {
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

  _noiseHit(t, { peak, f0, f1, q, dur, type = 'bandpass', wet = 0.2 }) {
    const c = this.ctx;
    const src = this._src();
    const f = c.createBiquadFilter();
    f.type = type;
    if (q != null) f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 != null && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const g = this._env(t, peak, 0.003, dur);
    src.connect(f);
    f.connect(g);
    this._route(g, wet);
    src.start(t);
    src.stop(t + dur + 0.2);
  }

  _tone(t, { type = 'sine', f0, f1, peak, dur, wet = 0.2 }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 != null && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    const g = this._env(t, peak, 0.005, dur);
    o.connect(g);
    this._route(g, wet);
    o.start(t);
    o.stop(t + dur + 0.2);
  }

  // ---- footfalls: one per bug type ---------------------------------------
  // i is intensity — accents come through as a louder, brighter version.

  footCricket(t, i = 1) {
    this._noiseHit(t, { peak: 0.3 * i, f0: 4200, f1: 2600, q: 3.2, dur: 0.035, wet: 0.24 });
    this._tone(t, { type: 'triangle', f0: 1900, f1: 1300, peak: 0.1 * i, dur: 0.03, wet: 0.2 });
  }

  footAnt(t, i = 1) {
    this._tone(t, { type: 'triangle', f0: 330, f1: 190, peak: 0.34 * i, dur: 0.1, wet: 0.18 });
    this._noiseHit(t, { peak: 0.16 * i, f0: 1800, f1: 900, q: 1.4, dur: 0.03, wet: 0.16 });
  }

  footBeetle(t, i = 1) {
    this._tone(t, { f0: 110, f1: 48, peak: 0.5 * i, dur: 0.22, wet: 0.14 });
    this._noiseHit(t, { peak: 0.2 * i, f0: 900, f1: 320, q: 1, dur: 0.05, type: 'lowpass', wet: 0.14 });
  }

  // Once a bar, so it wants weight and a long tail — the deepest layer.
  footTermite(t, i = 1) {
    this._tone(t, { f0: 70, f1: 33, peak: 0.62 * i, dur: 0.5, wet: 0.3 });
    this._tone(t, { type: 'triangle', f0: 148, f1: 96, peak: 0.2 * i, dur: 0.3, wet: 0.3 });
    this._noiseHit(t, { peak: 0.24 * i, f0: 640, f1: 180, q: 0.9, dur: 0.09, type: 'lowpass', wet: 0.24 });
  }

  foot(type, t, i = 1) {
    if (type === 'cricket') this.footCricket(t, i);
    else if (type === 'beetle') this.footBeetle(t, i);
    else if (type === 'termite') this.footTermite(t, i);
    else this.footAnt(t, i);
  }

  // ---- action voices ------------------------------------------------------

  scrape(t, i = 1) {
    this._noiseHit(t, { peak: 0.12 * i, f0: 1500, f1: 3400, q: 1.6, dur: 0.09, wet: 0.24 });
  }

  pluck(t, i = 1) {
    this._tone(t, { f0: 660, peak: 0.24 * i, dur: 0.4, wet: 0.4 });
    this._tone(t, { type: 'triangle', f0: 990, peak: 0.09 * i, dur: 0.22, wet: 0.4 });
  }

  crack(t, i = 1) {
    this._noiseHit(t, { peak: 0.5 * i, f0: 2600, f1: 700, q: 0.8, dur: 0.16, wet: 0.34 });
    this._tone(t, { f0: 160, f1: 52, peak: 0.5 * i, dur: 0.24, wet: 0.16 });
  }

  whoosh(t, i = 1) {
    this._noiseHit(t, { peak: 0.2 * i, f0: 700, f1: 4200, q: 0.9, dur: 0.22, wet: 0.4 });
  }

  pop(t, i = 1) {
    this._tone(t, { f0: 900, f1: 340, peak: 0.3 * i, dur: 0.07, wet: 0.3 });
    this._noiseHit(t, { peak: 0.14 * i, f0: 3000, f1: 1400, q: 2.4, dur: 0.03, wet: 0.3 });
  }

  // Deliveries to the nest are the bass drum — tight logistics land on the one.
  boom(t, i = 1) {
    this._tone(t, { f0: 150, f1: 40, peak: 0.85 * i, dur: 0.34, wet: 0.12 });
    this._noiseHit(t, { peak: 0.2 * i, f0: 400, f1: 120, dur: 0.05, type: 'lowpass', wet: 0.12 });
  }

  whiff(t) {
    this._noiseHit(t, { peak: 0.05, f0: 2200, f1: 1600, q: 4, dur: 0.02, wet: 0.1 });
  }

  bump(t) {
    this._tone(t, { f0: 190, f1: 120, peak: 0.16, dur: 0.06, wet: 0.14 });
  }

  place(t) {
    this._noiseHit(t, { peak: 0.22, f0: 520, f1: 220, dur: 0.09, type: 'lowpass', wet: 0.2 });
  }

  chime(t) {
    [0, 4, 7, 12].forEach((semi, k) => {
      this._tone(t + k * 0.09, {
        f0: 523.25 * Math.pow(2, semi / 12), peak: 0.2, dur: 0.9, wet: 0.5,
      });
    });
  }

  // a new nest rising
  raise(t) {
    this._tone(t, { f0: 55, f1: 110, peak: 0.7, dur: 1.1, wet: 0.35 });
    this._noiseHit(t, { peak: 0.34, f0: 300, f1: 1400, q: 0.7, dur: 0.9, wet: 0.5 });
    [0, 7, 12, 19].forEach((semi, k) => {
      this._tone(t + 0.16 + k * 0.11, {
        f0: 261.63 * Math.pow(2, semi / 12), peak: 0.24, dur: 1.2, wet: 0.55,
      });
    });
  }

  // a bush coming back into fruit — barely there
  sprout(t) {
    this._tone(t, { type: 'sine', f0: 1180, f1: 1560, peak: 0.055, dur: 0.3, wet: 0.5 });
  }

  pulse(t, accent) {
    if (!this.pulseOn) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = accent ? 1600 : 1150;
    const g = this._env(t, accent ? 0.05 : 0.024, 0.001, 0.02);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  }

}
