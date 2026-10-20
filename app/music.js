// Background music, synthesized live with the Web Audio API so no audio files are needed.
// Two original tracks: "Clear Signal" for the modern look and "Classic Click" for legacy.
// Each look can instead play the player's own song: an audio file or a YouTube video.
window.UltraMusic = (() => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const masterVolume = 0.55;
  const customVolume = 0.6;
  const lookAhead = 0.25;
  let context = null;
  let master = null;
  let noise = null;
  let meter = null;
  let enabled = false;
  let trackName = 'modern';
  let playing = null;
  let schedulerId = null;
  // Custom songs per look: null, { kind: 'file', url } or { kind: 'youtube', id }.
  const customSongs = { modern: null, legacy: null };
  let customError = () => {};
  const audio = new Audio();
  audio.loop = true;
  audio.volume = customVolume;
  let youtube = null;

  const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);

  // ---- Instruments ----------------------------------------------------------
  function tone(bus, time, midi, length, { type = 'triangle', gain = 0.1, attack = 0.005, release = 0.08, cutoff = 0, detune = 0 } = {}) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency(midi);
    oscillator.detune.value = detune;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain, time + attack);
    envelope.gain.setValueAtTime(gain, time + Math.max(attack, length - release));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);
    let node = oscillator;
    if (cutoff) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      oscillator.connect(filter);
      node = filter;
    }
    node.connect(envelope);
    envelope.connect(bus);
    oscillator.start(time);
    oscillator.stop(time + length + 0.05);
  }

  function pluck(bus, time, midi, length, gain, type = 'triangle') {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency(midi);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);
    oscillator.connect(envelope);
    envelope.connect(bus);
    oscillator.start(time);
    oscillator.stop(time + length + 0.05);
  }

  function hiss(bus, time, length, gain, filterType, filterFrequency) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noise;
    filter.type = filterType;
    filter.frequency.value = filterFrequency;
    envelope.gain.setValueAtTime(gain, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus);
    source.start(time, Math.random() * 0.5);
    source.stop(time + length + 0.05);
  }

  function kick(bus, time, gain) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.frequency.setValueAtTime(130, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    envelope.gain.setValueAtTime(gain, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    oscillator.connect(envelope);
    envelope.connect(bus);
    oscillator.start(time);
    oscillator.stop(time + 0.25);
  }

  // ---- Modern: "Clear Signal" ----------------------------------------------
  // A calm, slightly tense synth loop in A minor: ticking clock, sonar pings, soft arpeggios.
  const modernChords = [
    { root: 45, arp: [64, 69, 72, 76] }, // Am
    { root: 41, arp: [65, 69, 72, 76] }, // Fmaj7
    { root: 48, arp: [64, 67, 72, 76] }, // C
    { root: 43, arp: [62, 67, 71, 74] }, // G
    { root: 45, arp: [64, 69, 72, 76] }, // Am
    { root: 41, arp: [65, 69, 72, 77] }, // F
    { root: 38, arp: [62, 65, 69, 74] }, // Dm
    { root: 40, arp: [64, 68, 71, 76] } // E
  ];
  const modernArpA = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
  const modernArpB = [3, 1, 2, 0, 1, 2, 3, 1, 0, 1, 2, 3, 1, 2, 0, 2];

  const modern = {
    stepLength: 60 / 92 / 4,
    steps: modernChords.length * 16,
    build(output) {
      const echo = context.createDelay(1);
      const feedback = context.createGain();
      const wet = context.createGain();
      echo.delayTime.value = this.stepLength * 3;
      feedback.gain.value = 0.32;
      wet.gain.value = 0.3;
      echo.connect(feedback);
      feedback.connect(echo);
      echo.connect(wet);
      wet.connect(output);
      return { echo };
    },
    play(step, time, output, extra, loop) {
      const bar = Math.floor(step / 16);
      const beat = step % 16;
      const chord = modernChords[bar];
      const pattern = loop % 2 ? modernArpB : modernArpA;

      if (beat === 0) {
        // Soft pad that swells over the whole bar.
        chord.arp.slice(0, 3).forEach(note => {
          tone(output, time, note - 12, this.stepLength * 16, { type: 'sawtooth', gain: 0.022, attack: 0.6, release: 0.7, cutoff: 900, detune: -6 });
          tone(output, time, note - 12, this.stepLength * 16, { type: 'sawtooth', gain: 0.022, attack: 0.6, release: 0.7, cutoff: 900, detune: 6 });
        });
      }
      const note = chord.arp[pattern[beat]];
      const gain = beat % 4 === 0 ? 0.075 : 0.05;
      pluck(output, time, note, 0.32, gain);
      pluck(extra.echo, time, note, 0.32, gain * 0.6);
      if (beat === 0 || beat === 6 || beat === 10) {
        tone(output, time, chord.root, this.stepLength * (beat === 0 ? 5 : 3), { type: 'sine', gain: 0.2, attack: 0.01, release: 0.12 });
      }
      // The ticking clock: a quiet click on every beat, a brighter one off the beat.
      if (beat % 4 === 0) hiss(output, time, 0.04, 0.05, 'highpass', 6000);
      if (beat % 4 === 2) hiss(output, time, 0.03, 0.025, 'highpass', 9000);
      if (beat === 4 || beat === 12) pluck(output, time, 96, 0.05, 0.035, 'sine');
      if (beat === 0 || beat === 8) kick(output, time, 0.16);
      // Sonar ping at the start of each half of the loop.
      if (beat === 8 && (bar === 1 || bar === 5)) {
        pluck(output, time, 88, 1.4, 0.05, 'sine');
        pluck(extra.echo, time, 88, 1.4, 0.06, 'sine');
      }
    }
  };

  // ---- Legacy: "Classic Click" ---------------------------------------------
  // A bouncy early-2000s game tune in C major, in the style of General MIDI music of the time.
  const legacyChords = {
    C: { root: 48, stab: [60, 64, 67] },
    Am: { root: 45, stab: [57, 60, 64] },
    F: { root: 41, stab: [57, 60, 65] },
    G: { root: 43, stab: [55, 59, 62] },
    Dm: { root: 50, stab: [57, 62, 65] },
    Em: { root: 40, stab: [55, 59, 64] }
  };
  // Each bar: chord name, then melody notes as [step, note, length in steps].
  const legacyBars = [
    ['C', [[0, 76, 2], [2, 79, 2], [4, 84, 4], [8, 83, 2], [10, 81, 2], [12, 79, 4]]],
    ['Am', [[0, 76, 2], [2, 77, 2], [4, 76, 2], [6, 72, 2], [8, 69, 6], [14, 72, 2]]],
    ['F', [[0, 77, 2], [2, 81, 2], [4, 84, 4], [8, 83, 2], [10, 81, 2], [12, 77, 4]]],
    ['G', [[0, 79, 6], [6, 77, 2], [8, 76, 2], [10, 74, 2], [12, 71, 4]]],
    ['C', [[0, 76, 2], [2, 79, 2], [4, 84, 4], [8, 83, 2], [10, 81, 2], [12, 79, 4]]],
    ['Am', [[0, 76, 2], [2, 77, 2], [4, 79, 4], [8, 81, 2], [10, 79, 2], [12, 76, 4]]],
    ['Dm', [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 74, 4]]],
    ['G', [[0, 71, 2], [2, 74, 2], [4, 79, 4], [8, 77, 2], [10, 74, 2], [12, 71, 2], [14, 74, 2]]],
    ['F', [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 76, 4], [12, 77, 4]]],
    ['G', [[0, 79, 4], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 71, 4]]],
    ['Em', [[0, 76, 2], [2, 79, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 76, 4]]],
    ['Am', [[0, 81, 6], [6, 79, 2], [8, 76, 4], [12, 72, 4]]],
    ['F', [[0, 77, 2], [2, 81, 2], [4, 84, 2], [6, 81, 2], [8, 77, 2], [10, 81, 2], [12, 84, 4]]],
    ['G', [[0, 83, 2], [2, 79, 2], [4, 74, 2], [6, 79, 2], [8, 83, 4], [12, 86, 4]]],
    ['C', [[0, 84, 8], [8, 79, 4], [12, 76, 4]]],
    ['C', [[0, 72, 4], [4, 76, 2], [6, 79, 2], [8, 84, 4], [12, 79, 4]]]
  ];

  const legacy = {
    stepLength: 60 / 124 / 4,
    steps: legacyBars.length * 16,
    build() {
      return {};
    },
    play(step, time, output) {
      const bar = Math.floor(step / 16);
      const beat = step % 16;
      const [chordName, melody] = legacyBars[bar];
      const chord = legacyChords[chordName];

      melody.forEach(([at, note, length]) => {
        if (at !== beat) return;
        tone(output, time, note, this.stepLength * length * 0.92, { type: 'square', gain: 0.045, attack: 0.01, release: 0.06, cutoff: 3200 });
        tone(output, time, note - 12, this.stepLength * length * 0.92, { type: 'triangle', gain: 0.05, attack: 0.01, release: 0.06 });
      });
      // Oom-pah bass: root on the beat, fifth in between.
      if (beat % 4 === 0) {
        const note = beat % 8 === 0 ? chord.root : chord.root + 7;
        tone(output, time, note, this.stepLength * 3, { type: 'triangle', gain: 0.2, attack: 0.005, release: 0.08 });
      }
      if (beat === 4 || beat === 12) {
        chord.stab.forEach(note => tone(output, time, note, this.stepLength * 1.6, { type: 'square', gain: 0.018, attack: 0.005, release: 0.05, cutoff: 2200 }));
      }
      if (beat === 0 || beat === 8 || (beat === 10 && bar % 2 === 1)) kick(output, time, 0.3);
      if (beat === 4 || beat === 12) hiss(output, time, 0.14, 0.12, 'bandpass', 1900);
      if (beat % 2 === 0) hiss(output, time, 0.045, beat % 4 === 2 ? 0.05 : 0.03, 'highpass', 7500);
    }
  };

  const tracks = { modern, legacy };

  // ---- Playback ----------------------------------------------------------------
  function ensureContext() {
    if (context || !AudioContextClass) return Boolean(context);
    context = new AudioContextClass();
    const compressor = context.createDynamicsCompressor();
    master = context.createGain();
    master.gain.value = 0;
    meter = context.createAnalyser();
    meter.fftSize = 2048;
    master.connect(compressor);
    compressor.connect(meter);
    meter.connect(context.destination);
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
    return true;
  }

  function startTrack() {
    const track = tracks[trackName];
    const output = context.createGain();
    output.gain.setValueAtTime(0, context.currentTime);
    output.gain.linearRampToValueAtTime(1, context.currentTime + 1.2);
    output.connect(master);
    playing = { track, output, extra: track.build(output), step: 0, loop: 0, nextTime: context.currentTime + 0.1 };
  }

  function stopTrack(fade = 0.8) {
    if (!playing) return;
    const { output } = playing;
    const now = context.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(output.gain.value, now);
    output.gain.linearRampToValueAtTime(0, now + fade);
    window.setTimeout(() => output.disconnect(), fade * 1000 + 600);
    playing = null;
  }

  function schedule() {
    if (!playing || context.state !== 'running') return;
    // After a pause, pick up from now instead of rushing through the missed notes.
    if (playing.nextTime < context.currentTime) playing.nextTime = context.currentTime + 0.05;
    while (playing.nextTime < context.currentTime + lookAhead) {
      const { track } = playing;
      track.play(playing.step, playing.nextTime, playing.output, playing.extra, playing.loop);
      playing.nextTime += track.stepLength;
      playing.step += 1;
      if (playing.step >= track.steps) {
        playing.step = 0;
        playing.loop += 1;
      }
    }
  }

  function fadeMaster(target, seconds) {
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(target, now + seconds);
  }

  function startSynth() {
    if (!ensureContext()) return;
    if (context.state !== 'running') context.resume().catch(() => {});
    if (!playing) startTrack();
    fadeMaster(masterVolume, 0.6);
    if (!schedulerId) schedulerId = window.setInterval(schedule, 60);
    schedule();
  }

  function stopSynth() {
    if (!context) return;
    fadeMaster(0, 0.4);
    window.clearInterval(schedulerId);
    schedulerId = null;
    stopTrack(0.4);
  }

  // ---- Custom songs ------------------------------------------------------------
  function playFile(url) {
    if (audio.dataset.url !== url) {
      audio.dataset.url = url;
      audio.src = url;
    }
    audio.play().catch(() => {});
  }

  function youtubeCommand(func, args = []) {
    if (youtube && youtube.frame.contentWindow) youtube.frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }

  function removeYoutube() {
    if (!youtube) return;
    window.clearTimeout(youtube.timeout);
    youtube.frame.remove();
    youtube = null;
  }

  // Fall back to the built-in tune for now; the song stays saved, so it is tried again next launch.
  function youtubeFailed(message) {
    const look = trackName;
    removeYoutube();
    customSongs[look] = null;
    refresh();
    customError(look, message);
  }

  function playYoutube(id) {
    if (youtube && youtube.id === id) {
      youtube.wanted = true;
      if (youtube.ready) youtubeCommand('playVideo');
      return;
    }
    removeYoutube();
    const frame = document.createElement('iframe');
    frame.className = 'youtube-player';
    frame.title = 'Background music';
    frame.allow = 'autoplay; encrypted-media';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&autoplay=1&loop=1&playlist=${id}&controls=0&disablekb=1&playsinline=1&rel=0`;
    youtube = { id, frame, ready: false, wanted: true };
    // Ask the player to report its events (ready, errors) back to this page.
    frame.addEventListener('load', () => {
      if (frame.contentWindow) frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
    });
    youtube.timeout = window.setTimeout(() => {
      if (youtube && youtube.frame === frame && !youtube.ready) youtubeFailed('YouTube could not be reached. Check your internet connection.');
    }, 15000);
    document.body.append(frame);
  }

  window.addEventListener('message', event => {
    if (!youtube || event.source !== youtube.frame.contentWindow) return;
    let data = null;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (!data || !data.event) return;
    if (data.event === 'onReady' || data.event === 'initialDelivery') {
      if (youtube.ready) return;
      youtube.ready = true;
      window.clearTimeout(youtube.timeout);
      youtubeCommand('setVolume', [customVolume * 100]);
      youtubeCommand(youtube.wanted ? 'playVideo' : 'pauseVideo');
    } else if (data.event === 'onError') {
      const code = Number(data.info);
      youtubeFailed(code === 101 || code === 150 || code === 153
        ? 'This video does not allow playing outside YouTube. Try another one.'
        : 'This YouTube video could not be played. Try another one.');
    }
  });

  function pauseCustom() {
    audio.pause();
    if (youtube) {
      youtube.wanted = false;
      youtubeCommand('pauseVideo');
    }
  }

  // Decide what should be playing right now and make it so.
  function refresh() {
    const song = customSongs[trackName];
    if (!enabled || document.hidden) {
      pauseCustom();
      if (context && enabled) context.suspend().catch(() => {});
      return;
    }
    if (!song) {
      pauseCustom();
      startSynth();
      return;
    }
    stopSynth();
    if (song.kind === 'file') {
      if (youtube) {
        youtube.wanted = false;
        youtubeCommand('pauseVideo');
      }
      playFile(song.url);
    } else {
      audio.pause();
      playYoutube(song.id);
    }
  }

  // Browsers and phones only allow sound after the player has touched the app.
  const unlock = () => {
    if (!enabled || document.hidden) return;
    const song = customSongs[trackName];
    if (!song) {
      if (context && context.state !== 'running') context.resume().then(schedule).catch(() => {});
      else if (!context) startSynth();
    } else if (song.kind === 'file' && audio.paused) {
      audio.play().catch(() => {});
    }
  };
  ['pointerdown', 'keydown', 'touchend'].forEach(type => window.addEventListener(type, unlock, { capture: true, passive: true }));

  // Go quiet while the app is in the background ('pause'/'resume' come from the phone apps).
  const pause = () => {
    pauseCustom();
    if (context && enabled) context.suspend().catch(() => {});
  };
  const resume = () => {
    if (!enabled || document.hidden) return;
    if (context) context.resume().then(schedule).catch(() => {});
    refresh();
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  document.addEventListener('pause', pause);
  document.addEventListener('resume', resume);

  return {
    // Current loudness (0 = silent), for checking that music is playing.
    level() {
      if (!meter) return 0;
      const samples = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    },
    get state() {
      return {
        enabled,
        track: trackName,
        context: context ? context.state : 'none',
        synth: Boolean(playing),
        file: !audio.paused,
        youtube: youtube ? { id: youtube.id, ready: youtube.ready, wanted: youtube.wanted } : null
      };
    },
    setEnabled(value) {
      enabled = value;
      if (!enabled) stopSynth();
      refresh();
    },
    setTrack(name) {
      if (!tracks[name] || name === trackName) return;
      trackName = name;
      if (!enabled) return;
      // Cross-fade between the two built-in tunes.
      if (playing && !customSongs[name]) {
        stopTrack(0.8);
        startTrack();
        schedule();
      }
      refresh();
    },
    // song: null for the built-in tune, { kind: 'file', url } or { kind: 'youtube', id }.
    setCustomSong(look, song) {
      customSongs[look] = song;
      if (look !== trackName) return;
      if (!song || song.kind !== 'youtube' || (youtube && youtube.id !== song.id)) removeYoutube();
      if (enabled) refresh();
    },
    onCustomError(callback) {
      customError = callback;
    }
  };
})();
