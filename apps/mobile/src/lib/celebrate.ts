import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

let player: AudioPlayer | null = null;

/** Cha-ching plus a success haptic, for sales that arrive while the app is open. */
export function celebrate(): void {
  if (Platform.OS !== "web") {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
  try {
    player ??= createAudioPlayer(require("../../assets/sounds/cha_ching.wav"));
    void player.seekTo(0).then(() => player?.play());
  } catch {
    // Sound is a flourish; a failure to play must never break the toast.
  }
}

export function selectionTick(): void {
  if (Platform.OS !== "web") void Haptics.selectionAsync();
}
