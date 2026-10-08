import { StyleSheet, Text, View } from "react-native";
import { createApiClient, type SubscriptionSummary } from "@autumn/shared";

const previewSubscription: SubscriptionSummary = {
  id: "preview",
  productName: "Autumn Pro",
  status: "active",
  amountCents: 2900,
  currency: "USD",
};

const apiClient = createApiClient("http://localhost:8787");
void apiClient;

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>UNOFFICIAL AUTUMN DASHBOARD</Text>
      <Text style={styles.title}>Billing at a glance</Text>
      <Text style={styles.subtitle}>
        A placeholder home screen for the upcoming mobile dashboard.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Preview subscription</Text>
        <Text style={styles.cardTitle}>{previewSubscription.productName}</Text>
        <Text style={styles.cardMeta}>{previewSubscription.status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: "#f7f7f5",
  },
  eyebrow: { color: "#6f6f69", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  title: { color: "#181816", fontSize: 32, fontWeight: "700" },
  subtitle: { color: "#60605a", fontSize: 16, lineHeight: 24 },
  card: { marginTop: 16, gap: 8, borderRadius: 20, padding: 20, backgroundColor: "#ffffff" },
  cardLabel: { color: "#77776f", fontSize: 13 },
  cardTitle: { color: "#181816", fontSize: 22, fontWeight: "600" },
  cardMeta: { color: "#2f7d4a", fontSize: 14, textTransform: "capitalize" },
});
