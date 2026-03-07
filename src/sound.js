export function createSoundSystem() {
  let ctx = null;
  let masterGain = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let tireNoiseSource = null;
  let tireGain = null;
  let started = false;
  let muted = false;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(ctx.destination);

    // 엔진음: sawtooth + square 합성
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(masterGain);

    engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 80;
    const osc1Gain = ctx.createGain();
    osc1Gain.gain.value = 0.4;
    engineOsc1.connect(osc1Gain);
    osc1Gain.connect(engineGain);
    engineOsc1.start();

    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 80;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.2;
    engineOsc2.connect(osc2Gain);
    osc2Gain.connect(engineGain);
    engineOsc2.start();

    // 드리프트 타이어 소리: white noise + bandpass
    tireGain = ctx.createGain();
    tireGain.gain.value = 0;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1000;
    bandpass.Q.value = 0.5;
    tireGain.connect(bandpass);
    bandpass.connect(masterGain);

    // white noise 버퍼
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    tireNoiseSource = ctx.createBufferSource();
    tireNoiseSource.buffer = noiseBuffer;
    tireNoiseSource.loop = true;
    tireNoiseSource.connect(tireGain);
    tireNoiseSource.start();

    started = true;
  }

  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  function update(speed, isDrifting) {
    if (!started || !ctx || ctx.state !== 'running') return;

    const t = ctx.currentTime;

    // 엔진 피치: 속도에 따라 80~300Hz
    const speedRatio = Math.min(speed / 100, 1);
    const freq = 80 + speedRatio * 220;
    engineOsc1.frequency.setTargetAtTime(freq, t, 0.1);
    engineOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.1);

    // 엔진 볼륨: 속도에 따라
    const engineVol = 0.15 + speedRatio * 0.5;
    engineGain.gain.setTargetAtTime(engineVol, t, 0.1);

    // 타이어 소리: 드리프트 시 게인 올림
    const tireVol = isDrifting ? 0.25 : 0;
    tireGain.gain.setTargetAtTime(tireVol, t, 0.15);
  }

  function setVolume(v) {
    if (masterGain) {
      masterGain.gain.value = v;
    }
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain) {
      masterGain.gain.value = muted ? 0 : 0.3;
    }
    return muted;
  }

  function cleanup() {
    if (ctx) {
      ctx.close();
      ctx = null;
      started = false;
    }
  }

  return { update, resume, setVolume, toggleMute, cleanup };
}
