// Sound synthesizers using the Web Audio API to prevent downloading audio assets.
class SoundEffects {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      } catch (e) {
        console.error('AudioContext not supported:', e);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleSound(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  isSoundEnabled() {
    return this.soundEnabled;
  }

  private createOscillator(type: OscillatorType, freq: number, duration: number, gainStart: number) {
    this.init();
    if (!this.ctx || !this.soundEnabled) return null;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gainNode.gain.setValueAtTime(gainStart, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    return { osc, gainNode };
  }

  playDiscSelect() {
    const sound = this.createOscillator('triangle', 330, 0.15, 0.3);
    if (sound) {
      sound.osc.frequency.setValueAtTime(330, this.ctx!.currentTime);
      sound.osc.frequency.exponentialRampToValueAtTime(440, this.ctx!.currentTime + 0.1);
      sound.osc.start();
      sound.osc.stop(this.ctx!.currentTime + 0.15);
    }
  }

  playDiscDrop() {
    const sound = this.createOscillator('triangle', 220, 0.25, 0.4);
    if (sound) {
      sound.osc.frequency.setValueAtTime(220, this.ctx!.currentTime);
      sound.osc.frequency.linearRampToValueAtTime(147, this.ctx!.currentTime + 0.15);
      sound.osc.start();
      sound.osc.stop(this.ctx!.currentTime + 0.25);
    }
  }

  playError() {
    this.init();
    if (!this.ctx || !this.soundEnabled) return;

    // Soft double block/buzz
    const t = this.ctx.currentTime;
    [0, 0.08].forEach((delay) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t + delay);
      
      // Low pass filter to make it sound full and not harsh
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, t + delay);

      gain.gain.setValueAtTime(0.2, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(t + delay);
      osc.stop(t + delay + 0.15);
    });
  }

  playSuccess() {
    this.init();
    if (!this.ctx || !this.soundEnabled) return;

    const t = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25]; // C4, E4, G4, C5, E5
    notes.forEach((freq, index) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + index * 0.1);
      
      gain.gain.setValueAtTime(0.15, t + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + index * 0.1 + 0.5);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(t + index * 0.1);
      osc.stop(t + index * 0.1 + 0.6);
    });
  }

  playLevelUp() {
    this.init();
    if (!this.ctx || !this.soundEnabled) return;

    const t = this.ctx.currentTime;
    const chords = [349.23, 440.00, 523.25, 587.33, 698.46, 880.00]; // F4, A4, C5, D5, F5, A5
    chords.forEach((freq, index) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + index * 0.08);
      
      gain.gain.setValueAtTime(0.12, t + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + index * 0.08 + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(t + index * 0.08);
      osc.stop(t + index * 0.08 + 0.7);
    });
  }

  playMacroStart() {
    this.init();
    if (!this.ctx || !this.soundEnabled) return;

    // Sci-fi power-up sound
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.6);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(1200, t + 0.6);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.75);
  }
}

export const sounds = new SoundEffects();
