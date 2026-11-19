// Story / reel video, made in the browser: one still frame (the finished design) + a piece of music →
// MP4 (H.264 video + AAC audio), the format Instagram and Facebook accept. Uses WebCodecs (Chrome, Edge,
// recent Safari) and the small mp4-muxer library (public/vendor, MIT). Nothing leaves the browser here.
import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.mjs';

export const MAX_SECONDS = 60; // Instagram stories: up to 60 s per story
export const FPS = 30;

export const videoSupported = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined'
  && typeof VideoFrame !== 'undefined' && typeof AudioData !== 'undefined';

// a music file → AudioBuffer (mp3, m4a/aac, wav, ogg: whatever the browser can decode)
export async function decodeAudio(file) {
  const buf = await file.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try { return await ctx.decodeAudioData(buf); } finally { ctx.close().catch(() => {}); }
}

// the chosen part of the song with its volume and fades, as a new stereo AudioBuffer
export async function renderClip(audio, { start = 0, dur = 15, volume = 1, fade = true, rate = 48000 } = {}) {
  const len = Math.max(1, Math.round(dur * rate));
  const off = new OfflineAudioContext(2, len, rate);
  const src = off.createBufferSource(); src.buffer = audio;
  const gain = off.createGain();
  src.connect(gain); gain.connect(off.destination);
  const v = Math.max(0, Math.min(1.5, volume));
  if (fade) {
    const fin = Math.min(0.8, dur / 6); const fout = Math.min(1.5, dur / 4);
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(v, fin);
    gain.gain.setValueAtTime(v, Math.max(fin, dur - fout));
    gain.gain.linearRampToValueAtTime(0, dur);
  } else gain.gain.setValueAtTime(v, 0);
  src.start(0, Math.max(0, start), dur);
  return off.startRendering();
}

const ease = (t) => t * t * (3 - 2 * t);

// image: anything drawImage takes (the rendered design) · clip: from renderClip() · motion: zoom-in | zoom-out | none
export async function makeVideo({ image, w, h, clip, motion = 'zoom-in', onProgress = () => {} }) {
  if (!videoSupported()) throw new Error('متصفحك ما بيقدر يعمل فيديو. استعمل Chrome أو Edge على الكمبيوتر.');
  const dur = clip.duration;
  // stay well under the 24 MB the publishing service takes; a still picture needs little bitrate anyway
  const vbr = Math.round(Math.max(1.2e6, Math.min(5e6, ((20e6 * 8) / dur) * 0.85 - 160e3)));
  let vcfg = null;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) { // High / Main / Baseline, level 4.0 (fits 1080×1920)
    const c = { codec, width: w, height: h, bitrate: vbr, framerate: FPS, avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) { vcfg = c; break; } } catch { /* try the next */ }
  }
  if (!vcfg) throw new Error('متصفحك ما بيدعم فيديو H.264. استعمل Chrome أو Edge على الكمبيوتر.');
  const acfg = { codec: 'mp4a.40.2', sampleRate: clip.sampleRate, numberOfChannels: 2, bitrate: 160000 };
  const aok = await AudioEncoder.isConfigSupported(acfg).catch(() => ({}));
  if (!aok.supported) throw new Error('متصفحك ما بيدعم صوت AAC. استعمل Chrome أو Edge على ويندوز أو ماك.');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: w, height: h, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: clip.sampleRate },
    fastStart: 'in-memory', firstTimestampBehavior: 'offset',
  });
  let failure = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { failure = e; } });
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { failure = e; } });
  venc.configure(vcfg); aenc.configure(acfg);

  try {
    // audio, in blocks (planar float: all of the left channel, then all of the right)
    const L = clip.getChannelData(0); const Rch = clip.numberOfChannels > 1 ? clip.getChannelData(1) : L;
    const B = 4096;
    for (let i = 0; i < clip.length; i += B) {
      const n = Math.min(B, clip.length - i);
      const data = new Float32Array(n * 2); data.set(L.subarray(i, i + n), 0); data.set(Rch.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: clip.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / clip.sampleRate) * 1e6), data });
      aenc.encode(ad); ad.close();
    }

    // video: the picture with a slow zoom (or still)
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const frames = Math.max(1, Math.ceil(dur * FPS));
    for (let f = 0; f < frames; f++) {
      if (failure) throw failure;
      const t = frames > 1 ? f / (frames - 1) : 0;
      const k = motion === 'zoom-in' ? 1 + 0.07 * ease(t) : motion === 'zoom-out' ? 1.07 - 0.07 * ease(t) : 1;
      const dw = w * k; const dh = h * k;
      g.fillStyle = '#0B1020'; g.fillRect(0, 0, w, h);
      g.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
      const vf = new VideoFrame(cv, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4)); // let the encoder catch up
      if (f % 15 === 0) onProgress(f / frames);
    }
    await venc.flush(); await aenc.flush();
    if (failure) throw failure;
    muxer.finalize();
  } finally {
    try { venc.close(); } catch { /* already closed */ }
    try { aenc.close(); } catch { /* already closed */ }
  }
  onProgress(1);
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
