export type ConferenceRecordingSession = {
  conferenceId: string;
  stop: (endedAt?: string) => Promise<CompletedConferenceRecording | null>;
  cancel: () => void;
};

type StartConferenceRecordingOptions = {
  conferenceId: string;
  scheduledAt: string;
  title: string;
};

type PreferredDisplayCaptureOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "exclude" | "include";
  surfaceSwitching?: "exclude" | "include";
  systemAudio?: "exclude" | "include";
};

export type CompletedConferenceRecording = {
  blob: Blob;
  conferenceId: string;
  endedAt: string;
  mimeType: string;
  scheduledAt: string;
  sizeBytes: number;
  title: string;
};

export async function startConferenceRecordingSession(
  options: StartConferenceRecordingOptions
): Promise<ConferenceRecordingSession | null> {
  if (
    typeof window === "undefined" ||
    typeof MediaRecorder === "undefined" ||
    !navigator.mediaDevices?.getDisplayMedia
  ) {
    return null;
  }

  const captureOptions: PreferredDisplayCaptureOptions = {
    audio: true,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "include",
    systemAudio: "include",
    video: {
      frameRate: 30,
    },
  };
  const stream = await navigator.mediaDevices.getDisplayMedia(
    captureOptions as DisplayMediaStreamOptions
  );
  const mimeType = pickRecordingMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  let shouldPersist = true;
  let stopPromise: Promise<CompletedConferenceRecording | null> | null = null;

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  const stopTracks = () => {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  };

  const stop = (endedAt = new Date().toISOString()) => {
    if (stopPromise) {
      return stopPromise;
    }

    stopPromise = new Promise<CompletedConferenceRecording | null>((resolve) => {
      const finalize = () => {
        stopTracks();
        if (!shouldPersist) {
          resolve(null);
          return;
        }

        const blob = new Blob(chunks, {
          type: recorder.mimeType || mimeType || "video/webm",
        });
        if (blob.size === 0) {
          resolve(null);
          return;
        }

        resolve({
          blob,
          conferenceId: options.conferenceId,
          endedAt,
          mimeType: blob.type || recorder.mimeType || mimeType || "video/webm",
          scheduledAt: options.scheduledAt,
          sizeBytes: blob.size,
          title: options.title,
        });
      };

      if (recorder.state === "inactive") {
        void finalize();
        return;
      }

      recorder.addEventListener(
        "stop",
        () => {
          void finalize();
        },
        { once: true }
      );
      recorder.stop();
    });

    return stopPromise;
  };

  stream.getVideoTracks().forEach((track) => {
    track.addEventListener("ended", () => {
      void stop();
    });
  });

  recorder.start(1_000);

  return {
    conferenceId: options.conferenceId,
    cancel: () => {
      shouldPersist = false;
      if (recorder.state !== "inactive") {
        recorder.stop();
        return;
      }
      stopTracks();
    },
    stop,
  };
}

function pickRecordingMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}
