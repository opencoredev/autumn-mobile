import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Values that differ per developer or per build come from env vars so nothing
 * account-specific is committed. See README "Mobile configuration".
 */
const bundleId = process.env.APP_BUNDLE_ID ?? "com.leo.autumndashboard";
// Reversed iOS client ID from Google Cloud, e.g. com.googleusercontent.apps.123-abc
const googleIosUrlScheme =
  process.env.GOOGLE_IOS_URL_SCHEME ?? "com.googleusercontent.apps.replace-me";
const easProjectId = process.env.EAS_PROJECT_ID ?? "";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Autumn Dashboard",
  slug: "autumn-dashboard",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "autumn-dashboard",
  userInterfaceStyle: "automatic",
  icon: "./assets/images/icon.png",
  backgroundColor: "#000000",
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: true,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-foreground.png",
      monochromeImage: "./assets/images/adaptive-monochrome.png",
      backgroundColor: "#000000",
    },
  },
  web: { favicon: "./assets/images/favicon.png", bundler: "metro", output: "single" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-apple-authentication",
    ["@react-native-google-signin/google-signin", { iosUrlScheme: googleIosUrlScheme }],
    "expo-font",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-mark.png",
        imageWidth: 112,
        resizeMode: "contain",
        backgroundColor: "#000000",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/notification-icon.png",
        color: "#8F3CF8",
        sounds: ["./assets/sounds/cha_ching.wav"],
      },
    ],
    "expo-web-browser",
    "expo-audio",
    "expo-status-bar",
  ],
  experiments: { typedRoutes: false },
  extra: { eas: { projectId: easProjectId } },
});
