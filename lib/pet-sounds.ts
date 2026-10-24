// Short local clips: no speech queue or network service during play.
export class PetSounds {
  muted = false;
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private active: AudioBufferSourceNode | null = null;
  unlock() {
    try {
      const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      this.context ??= new Audio();
      const context = this.context;
      void context.resume().catch(() => {});
      for (const name of ["dog", "cat", "wrong"]) {
        if (!this.buffers.has(name)) void fetch(`/audio/pets/${name}.wav`)
          .then(r => { if (!r.ok) throw new Error("audio"); return r.arrayBuffer(); })
          .then(bytes => context.decodeAudioData(bytes))
          .then(buffer => { if (this.context === context) this.buffers.set(name, buffer); })
          .catch(() => {});
      }
    } catch { /* Audio is optional; gameplay always remains available. */ }
  }
  play(name: "dog" | "cat" | "wrong") {
    const context = this.context, buffer = this.buffers.get(name);
    if (this.muted || !context || !buffer || context.state !== "running") return;
    try {
      this.active?.stop();
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = 0.55;
      source.connect(gain); gain.connect(context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); if (this.active === source) this.active = null; };
      this.active = source;
      source.start();
    } catch { /* Do not interrupt a round if audio becomes unavailable. */ }
  }
  dispose() {
    if (this.context) void this.context.close().catch(() => {});
    this.context = null; this.active = null; this.buffers.clear();
  }
}
