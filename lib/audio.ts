/** Web Audio synth: filtered noise bursts for clicks, sines for the lock chime. Zero audio files. */
export class Sound {
  private ctx?: AudioContext;
  private noise?: AudioBuffer;
  private out?: GainNode;
  on = false;

  enable() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.45;
      this.out.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 0.25;
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
    this.on = true;
  }

  private burst(freq: number, q: number, dur: number, gain: number) {
    if (!this.on || !this.ctx || !this.noise || !this.out) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.1, dur + 0.02);
  }

  private tone(freq: number, dur: number, gain: number, delay = 0) {
    if (!this.on || !this.ctx || !this.out) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = "sine"; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  tick() { this.burst(3600 + Math.random() * 700, 5, 0.03, 0.35); }
  press() { this.burst(900, 1.5, 0.06, 0.8); this.tone(120, 0.12, 0.25); }
  lock() { this.burst(2400, 3, 0.05, 0.7); this.tone(880, 0.5, 0.18); this.tone(1320, 0.7, 0.12, 0.05); }
}
