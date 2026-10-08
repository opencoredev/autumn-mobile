import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

export type AppleResult =
  | {
      readonly kind: "success";
      readonly identityToken: string;
      readonly displayName: string | null;
    }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

/** Sign in with Apple is offered on iOS only. Android never shows the button. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<AppleResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    });
    if (!credential.identityToken) {
      return { kind: "error", message: "Apple didn't return an identity token." };
    }
    const parts = [credential.fullName?.givenName, credential.fullName?.familyName].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    return {
      kind: "success",
      identityToken: credential.identityToken,
      displayName: parts.length > 0 ? parts.join(" ") : null,
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "ERR_REQUEST_CANCELED") return { kind: "cancelled" };
    }
    return { kind: "error", message: "Apple sign-in failed. Try again." };
  }
}
