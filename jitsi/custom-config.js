(function applyMessengerJitsiOverrides() {
  var isHttps = window.location.protocol === "https:";
  var httpBaseUrl = (isHttps ? "https://" : "http://") + window.location.host;
  var websocketBaseUrl = (isHttps ? "wss://" : "ws://") + window.location.host;
  var minimalToolbarButtons = [
    "microphone",
    "camera",
    "desktop",
    "tileview",
    "fullscreen",
    "localrecording",
    "settings",
    "hangup"
  ];

  config.prejoinPageEnabled = false;
  config.prejoinConfig = Object.assign({}, config.prejoinConfig, {
    enabled: false,
    hideDisplayName: true
  });
  config.requireDisplayName = false;
  config.disableDeepLinking = true;
  config.disableInviteFunctions = true;
  config.disablePolls = true;
  config.disableReactions = true;
  config.enableClosePage = false;
  config.hiddenDomain = "recorder.meet.jitsi";
  config.fileRecordingsEnabled = false;
  config.fileRecordingsServiceEnabled = false;
  config.localRecording = Object.assign({}, config.localRecording, {
    disable: false,
    notifyAllParticipants: true
  });
  config.recordingService = Object.assign({}, config.recordingService, {
    enabled: false,
    sharingEnabled: false
  });
  config.recordings = Object.assign({}, config.recordings, {
    suggestRecording: false
  });
  config.welcomePage = Object.assign({}, config.welcomePage, {
    disabled: true
  });
  config.whiteboard = Object.assign({}, config.whiteboard, {
    enabled: false
  });
  config.toolbarButtons = minimalToolbarButtons;
  config.bosh = httpBaseUrl + "/http-bind";
  config.websocket = websocketBaseUrl + "/xmpp-websocket";
})();
