import { useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { OrgMonogram } from "@/src/components/OrgSwitcherButton";
import { Row } from "@/src/components/Row";
import { Section } from "@/src/components/Section";
import { Text } from "@/src/components/Text";
import { useOrgs } from "@/src/lib/orgs";
import { space, usePalette } from "@/src/theme";

export default function OrgsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const { orgs } = useOrgs();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
    >
      <Section
        title={`${orgs.length} ${orgs.length === 1 ? "organization" : "organizations"}`}
        action={{ label: "Add", onPress: () => router.push("/orgs/new") }}
      >
        {orgs.map((org, index) => (
          <Row
            key={org.id}
            leading={<OrgMonogram name={org.name} size={28} />}
            title={org.name}
            subtitle={`${org.keyEnv === "live" ? "Live" : "Sandbox"} key ••${org.keySuffix}`}
            showChevron
            isLast={index === orgs.length - 1}
            onPress={() => router.push(`/orgs/${org.id}`)}
          />
        ))}
      </Section>
      <Text variant="caption" tone="faint" style={{ padding: space.lg }}>
        Each organization uses its own Autumn secret key. Keys are encrypted on the server and never
        sent back to your phone.
      </Text>
    </ScrollView>
  );
}
