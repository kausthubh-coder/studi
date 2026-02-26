import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAudioInputConstraints,
  normalizeAudioInputDevices,
  resolveSelectedInputDevice,
} from "@/components/voice/input-device-utils";

describe("normalizeAudioInputDevices", () => {
  test("keeps only audioinput devices and fills fallback labels", () => {
    const devices = normalizeAudioInputDevices([
      { kind: "videoinput", deviceId: "camera-1", label: "Front camera" },
      { kind: "audioinput", deviceId: "mic-1", label: "USB Mic" },
      { kind: "audioinput", deviceId: "mic-2", label: "" },
      { kind: "audioinput", deviceId: "mic-3" },
      { kind: "audioinput", deviceId: "   ", label: "Invalid" },
    ]);

    assert.deepEqual(devices, [
      { deviceId: "mic-1", label: "USB Mic" },
      { deviceId: "mic-2", label: "Microphone 1" },
      { deviceId: "mic-3", label: "Microphone 2" },
    ]);
  });
});

describe("resolveSelectedInputDevice", () => {
  const devices = [
    { deviceId: "mic-1", label: "USB Mic" },
    { deviceId: "mic-2", label: "Laptop Mic" },
  ];

  test("returns selected device when it still exists", () => {
    assert.equal(resolveSelectedInputDevice("mic-2", devices), "mic-2");
  });

  test("falls back to first device when selected device is missing", () => {
    assert.equal(resolveSelectedInputDevice("missing", devices), "mic-1");
  });

  test("returns null when no devices exist", () => {
    assert.equal(resolveSelectedInputDevice("mic-1", []), null);
  });
});

describe("buildAudioInputConstraints", () => {
  test("includes standard constraints", () => {
    assert.deepEqual(buildAudioInputConstraints(null), {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  test("adds exact device constraint when selected", () => {
    assert.deepEqual(buildAudioInputConstraints("mic-2"), {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      deviceId: { exact: "mic-2" },
    });
  });
});
