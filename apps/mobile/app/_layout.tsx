import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { Geist_700Bold } from "@expo-google-fonts/geist/700Bold";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { GeistMono_600SemiBold } from "@expo-google-fonts/geist-mono/600SemiBold";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import {
  DarkTheme,
  DefaultTheme,
  SplashScreen,
  Stack,
  ThemeProvider,
  useRouter,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PushData } from "@autumn/shared";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastHost } from "@/src/components/ToastHost";
import { AuthProvider, useAuth } from "@/src/lib/auth";
import {
  addSaleOpenedListener,
  addSaleReceivedListener,
  configureForegroundHandling,
  registerForPush,
  syncOrgChannels,
} from "@/src/lib/notifications";
import { OrgsProvider, useOrgs } from "@/src/lib/orgs";
import { CACHE_BUSTER, persister, queryClient } from "@/src/lib/query";
import { showMessageToast, showSaleToast } from "@/src/lib/toast";
import { fonts, usePalette } from "@/src/theme";

void SplashScreen.preventAutoHideAsync();
configureForegroundHandling();

/** Wires pushes into the app: toast while open, deep link on tap, channels per org. */
function NotificationBridge() {
  const router = useRouter();
  const { state } = useAuth();
  const { orgs, isLoading: orgsLoading, setActiveOrgId } = useOrgs();
  const signedIn = state.kind === "signedIn";
  const [pendingOpen, setPendingOpen] = useState<PushData | null>(null);
  const orgsRef = useRef(orgs);
  useEffect(() => {
    orgsRef.current = orgs;
  }, [orgs]);

  useEffect(() => {
    if (signedIn) void syncOrgChannels(orgs);
  }, [signedIn, orgs]);

  useEffect(() => {
    if (!signedIn) return;
    void registerForPush({ prompt: false }).catch(() => undefined);
  }, [signedIn]);

  // Subscribe once; taps are queued until auth and orgs are known.
  useEffect(() => {
    const removeReceived = addSaleReceivedListener((data) => {
      if (!orgsRef.current.some((org) => org.id === data.orgId)) return;
      showSaleToast(data);
      void queryClient.invalidateQueries({ queryKey: ["org", data.orgId] });
    });
    const removeOpened = addSaleOpenedListener(setPendingOpen);
    return () => {
      removeReceived();
      removeOpened();
    };
  }, []);

  useEffect(() => {
    if (!pendingOpen || !signedIn || orgsLoading) return;
    const org = orgs.find((candidate) => candidate.id === pendingOpen.orgId);
    setPendingOpen(null);
    if (!org) {
      showMessageToast("That organization isn't in this app anymore.");
      return;
    }
    setActiveOrgId(org.id);
    router.push(pendingOpen.path);
  }, [pendingOpen, signedIn, orgsLoading, orgs, router, setActiveOrgId]);

  return null;
}

function RootNavigator() {
  const palette = usePalette();
  const { state } = useAuth();
  const { orgs, isLoading: orgsLoading } = useOrgs();
  const signedIn = state.kind === "signedIn";
  const ready = state.kind !== "loading" && !(signedIn && orgsLoading && orgs.length === 0);
  const hasOrgs = orgs.length > 0;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  const navigationTheme = useMemo(() => {
    const base = palette.scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: palette.background,
        card: palette.background,
        border: palette.hairline,
        primary: palette.accentText,
        text: palette.text,
      },
    };
  }, [palette]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: palette.background }} />;

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerShadowVisible: false,
          headerTintColor: palette.text,
          headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false, animation: "fade" }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !hasOrgs}>
          <Stack.Screen name="welcome" options={{ headerShown: false, animation: "fade" }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && hasOrgs}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: "fade" }} />
          <Stack.Screen name="org/[orgId]/customer/[customerId]" options={{ title: "Customer" }} />
          <Stack.Screen name="org/[orgId]/order/[invoiceId]" options={{ title: "Order" }} />
          <Stack.Screen name="org/[orgId]/plan/[planId]" options={{ title: "Plan" }} />
          <Stack.Screen name="subscriptions" options={{ title: "Subscriptions" }} />
          <Stack.Screen name="orders" options={{ title: "Orders" }} />
          <Stack.Screen name="orgs/index" options={{ title: "Organizations" }} />
          <Stack.Screen name="orgs/[orgId]/index" options={{ title: "Organization" }} />
          <Stack.Screen name="orgs/[orgId]/webhook" options={{ title: "Notifications setup" }} />
          <Stack.Screen name="about" options={{ title: "About" }} />
          <Stack.Screen
            name="org-switcher"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: "fitToContents",
              sheetGrabberVisible: true,
              headerShown: false,
              contentStyle: { backgroundColor: palette.surface },
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen
            name="orgs/new"
            options={{ title: "Add organization", presentation: "modal" }}
          />
        </Stack.Protected>
      </Stack>
      <NotificationBridge />
      <ToastHost />
      <StatusBar style={palette.scheme === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: Geist_400Regular,
    [fonts.medium]: Geist_500Medium,
    [fonts.semibold]: Geist_600SemiBold,
    [fonts.bold]: Geist_700Bold,
    [fonts.mono]: GeistMono_400Regular,
    [fonts.monoMedium]: GeistMono_500Medium,
    [fonts.monoSemibold]: GeistMono_600SemiBold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, buster: CACHE_BUSTER, maxAge: 1000 * 60 * 60 * 24 }}
        >
          <AuthProvider>
            <OrgsProvider>
              <RootNavigator />
            </OrgsProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
