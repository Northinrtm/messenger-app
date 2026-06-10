// Jest mock for react-native-webrtc (a native module that cannot load under Jest).
// __esModule + default keep `import x from` and `import {x}` both working.

class RTCPeerConnection {
  constructor() {
    this._senders = [];
    this._listeners = {};
  }

  addTrack(track) {
    const sender = {track, replaceTrack() {}};
    this._senders.push(sender);
    return sender;
  }

  getSenders() {
    return this._senders;
  }

  createOffer() {
    return Promise.resolve({type: 'offer', sdp: 'mock-offer-sdp'});
  }

  createAnswer() {
    return Promise.resolve({type: 'answer', sdp: 'mock-answer-sdp'});
  }

  setLocalDescription() {
    return Promise.resolve();
  }

  setRemoteDescription() {
    return Promise.resolve();
  }

  addIceCandidate() {
    return Promise.resolve();
  }

  addEventListener(type, handler) {
    this._listeners[type] = handler;
  }

  removeEventListener(type) {
    delete this._listeners[type];
  }

  close() {}
}

class RTCSessionDescription {
  constructor(init) {
    Object.assign(this, init);
  }
}

class RTCIceCandidate {
  constructor(init) {
    Object.assign(this, init);
  }
}

function makeTrack(kind) {
  return {kind, enabled: true, stop() {}};
}

const mediaDevices = {
  getUserMedia: () =>
    Promise.resolve({
      getTracks: () => [makeTrack('audio')],
      getAudioTracks: () => [makeTrack('audio')],
      release() {},
    }),
};

module.exports = {
  __esModule: true,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  default: {RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices},
};
