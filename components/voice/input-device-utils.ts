export type AudioInputDeviceOption = {
  deviceId: string;
  label: string;
};

type AudioInputDeviceLike = {
  kind: string;
  deviceId: string;
  label?: string;
};

export function normalizeAudioInputDevices(
  devices: AudioInputDeviceLike[],
): AudioInputDeviceOption[] {
  let unnamedIndex = 0;

  return devices
    .filter(
      (device) =>
        device.kind === "audioinput" && device.deviceId.trim().length > 0,
    )
    .map((device) => {
      const label = device.label?.trim();
      if (label && label.length > 0) {
        return {
          deviceId: device.deviceId,
          label,
        };
      }

      unnamedIndex += 1;
      return {
        deviceId: device.deviceId,
        label: `Microphone ${unnamedIndex}`,
      };
    });
}

export function resolveSelectedInputDevice(
  currentDeviceId: string | null,
  devices: AudioInputDeviceOption[],
): string | null {
  if (devices.length === 0) {
    return null;
  }

  if (currentDeviceId) {
    const exists = devices.some(
      (device) => device.deviceId === currentDeviceId,
    );
    if (exists) {
      return currentDeviceId;
    }
  }

  return devices[0]?.deviceId ?? null;
}

export function buildAudioInputConstraints(
  selectedDeviceId: string | null,
): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  if (selectedDeviceId) {
    constraints.deviceId = { exact: selectedDeviceId };
  }

  return constraints;
}
