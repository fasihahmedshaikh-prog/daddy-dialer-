// Generates a standard US dial-tone-style ringback (440Hz + 480Hz) via the
// Web Audio API so the rep hears something while the call is connecting,
// even before Twilio's own remote ringback audio (if any) arrives.
export class RingbackTone {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  start() {
    if (this.ctx) return; // already playing
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.ctx = ctx;

    const gain = ctx.createGain();
    gain.gain.value = 0.05; // quiet — this is a UI cue, not the call audio
    gain.connect(ctx.destination);
    this.gain = gain;

    const osc1 = ctx.createOscillator();
    osc1.frequency.value = 440;
    osc1.type = 'sine';
    osc1.connect(gain);
    osc1.start();
    this.osc1 = osc1;

    const osc2 = ctx.createOscillator();
    osc2.frequency.value = 480;
    osc2.type = 'sine';
    osc2.connect(gain);
    osc2.start();
    this.osc2 = osc2;

    // US ringback cadence: 2s on, 4s off — modulate the gain to simulate it.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / 6; // 6s cycle
    lfo.type = 'square';
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    this.lfo = lfo;
    this.lfoGain = lfoGain;
  }

  stop() {
    this.osc1?.stop();
    this.osc2?.stop();
    this.lfo?.stop();
    this.ctx?.close();
    this.ctx = null;
    this.osc1 = null;
    this.osc2 = null;
    this.gain = null;
    this.lfo = null;
    this.lfoGain = null;
  }
}
