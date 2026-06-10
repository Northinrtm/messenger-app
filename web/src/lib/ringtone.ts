// Best-effort incoming-call ringtone built with the Web Audio API (no asset to
// ship). Browser autoplay policy may keep the AudioContext suspended until the
// page has had a user gesture; in that case the ring is silently skipped, which
// matches how the message notification sound behaves.

type AudioContextCtor = typeof AudioContext;

function resolveAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  );
}

function playRingBurst(context: AudioContext) {
  const start = context.currentTime;
  const tone = (frequency: number, offset: number, duration: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const at = start + offset;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.16, at + 0.02);
    gain.gain.setValueAtTime(0.16, at + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    oscillator.start(at);
    oscillator.stop(at + duration);
  };
  // Classic two-pulse phone ring.
  tone(480, 0, 0.4);
  tone(620, 0.45, 0.4);
}

/**
 * Starts a looping ringtone. Returns a stop function that silences it and
 * releases the audio context.
 */
export function startRingtone(): () => void {
  const Ctor = resolveAudioContextCtor();
  if (!Ctor) {
    return () => undefined;
  }

  let context: AudioContext;
  try {
    context = new Ctor();
  } catch {
    return () => undefined;
  }

  playRingBurst(context);
  const intervalId = window.setInterval(() => playRingBurst(context), 3_000);

  return () => {
    window.clearInterval(intervalId);
    context.close().catch(() => undefined);
  };
}
