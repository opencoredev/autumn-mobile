import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { config } from "../config";

let configured = false;

export type GoogleResult =
  | { readonly kind: "success"; readonly idToken: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

export const googleSignInAvailable = true;

export async function signInWithGoogle(): Promise<GoogleResult> {
  if (!configured) {
    GoogleSignin.configure({
      // The ID token audience is the web client ID; the Worker accepts it.
      webClientId: config.googleWebClientId,
      ...(config.googleIosClientId ? { iosClientId: config.googleIosClientId } : {}),
      scopes: ["openid", "profile"],
    });
    configured = true;
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { kind: "cancelled" };
    const idToken = response.data.idToken;
    if (!idToken) return { kind: "error", message: "Google didn't return an ID token." };
    return { kind: "success", idToken };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return { kind: "cancelled" };
      if (error.code === statusCodes.IN_PROGRESS) return { kind: "cancelled" };
    }
    return { kind: "error", message: "Google sign-in failed. Try again." };
  }
}

export async function signOutOfGoogle(): Promise<void> {
  if (configured) await GoogleSignin.signOut().catch(() => undefined);
}
