import { useId, type ReactNode } from "react";
import { View } from "react-native";
import Svg, { Defs, Mask, Path, Rect } from "react-native-svg";
import type { Invoice, InvoiceStatus, Subscription, SubscriptionStatus } from "@autumn/shared";
import { radius, usePalette, type Palette } from "../theme";
import { Text } from "./Text";

/**
 * Port of Autumn's dashboard StatusChip (packages/ui/src/components/general/
 * status-chip.tsx): a neutral chip where only the small rounded square carries
 * colour, with a stroked glyph knocked into it.
 */

type Tone = "green" | "blue" | "red" | "orange" | "amber" | "purple" | "neutral";

/** 16×16 stroke paths, verbatim from the dashboard. */
const GLYPHS = {
  check: "M4.8 8.2l2.1 2.1 4.3-4.4",
  clock: "M8 4.8V8l2.1 1.4",
  alert: "M8 4.6v4.2M8 11.2v.1",
  minus: "M5.2 8h5.6",
  x: "M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6",
  pencil: "M5 11l.5-2 4-4 1.5 1.5-4 4z",
  refresh: "M5 8a3 3 0 1 0 1-2.2M5 4.6v1.8h1.8",
} as const;

/** Filled Phosphor icons (256×256) knocked out of a solid tile, verbatim. */
const ICON_GLYPHS = {
  calendar:
    "M48 72h160v40H48zM48 112h24v96H48zM184 112h24v96h-24zM48 184h160v24H48zM72 32h24v48H72zM160 32h24v48h-24z",
} as const;
const ICON_GLYPH_SCALE = 11 / 256;

type Glyph = keyof typeof GLYPHS | keyof typeof ICON_GLYPHS;

function isIconGlyph(glyph: Glyph): glyph is keyof typeof ICON_GLYPHS {
  return glyph in ICON_GLYPHS;
}

/** Glyph ink per tone, from the dashboard's STATUS_TONES (--glyph). */
function glyphInk(palette: Palette, tone: Tone): string {
  if (tone === "amber") return "#2A1C05";
  if (palette.scheme === "light") return "#FFFFFF";
  switch (tone) {
    case "green":
      return "#0E1C15";
    case "blue":
      return "#0C1726";
    case "red":
      return "#2A0C0D";
    case "orange":
      return "#2A1405";
    case "purple":
      return "#1A0F33";
    case "neutral":
      return "#161616";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

function toneColor(palette: Palette, tone: Tone): string {
  switch (tone) {
    case "green":
      return palette.positive;
    case "blue":
      return palette.trial;
    case "red":
      return palette.danger;
    case "orange":
      return palette.warning;
    case "amber":
      return palette.amber;
    case "purple":
      return palette.scheduled;
    case "neutral":
      return palette.neutral;
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export function StatusGlyph({ tone, glyph }: { readonly tone: Tone; readonly glyph: Glyph }) {
  const palette = usePalette();
  const maskId = `glyph${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const fill = toneColor(palette, tone);
  if (isIconGlyph(glyph)) {
    return (
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Defs>
          <Mask id={maskId}>
            <Rect width={16} height={16} fill="white" />
            <Path
              d={ICON_GLYPHS[glyph]}
              fill="black"
              transform={`translate(2.5 2.5) scale(${ICON_GLYPH_SCALE})`}
            />
          </Mask>
        </Defs>
        <Rect width={16} height={16} rx={4.5} fill={fill} mask={`url(#${maskId})`} />
      </Svg>
    );
  }
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16">
      <Rect x={1} y={1} width={14} height={14} rx={radius.glyph} fill={fill} />
      <Path
        d={GLYPHS[glyph]}
        fill="none"
        stroke={glyphInk(palette, tone)}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function StatusChip({
  tone,
  glyph,
  children,
  detail,
  struck = false,
}: {
  readonly tone: Tone;
  readonly glyph: Glyph;
  readonly children: ReactNode;
  /** Quieter trailing text, e.g. "3d left". */
  readonly detail?: string | null;
  readonly struck?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
        height: 22,
        maxWidth: "100%",
        paddingLeft: 4,
        paddingRight: 7,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: palette.chipBorder,
        backgroundColor: struck ? "transparent" : palette.chip,
      }}
    >
      <StatusGlyph tone={tone} glyph={glyph} />
      <Text
        variant="caption"
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: 12,
          lineHeight: 16,
          color: struck ? palette.textFaint : palette.text,
          textDecorationLine: struck ? "line-through" : "none",
        }}
      >
        {children}
        {detail ? (
          <Text
            variant="caption"
            style={{ fontSize: 12, lineHeight: 16, color: palette.textMuted }}
          >
            {` · ${detail}`}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

/** Dashboard PLAN_STATUS_CONFIG, with our derived statuses. */
export const PLAN_STATUS: Record<SubscriptionStatus, { label: string; tone: Tone; glyph: Glyph }> =
  {
    active: { label: "Active", tone: "green", glyph: "check" },
    trialing: { label: "Trial", tone: "blue", glyph: "clock" },
    canceling: { label: "Cancelling", tone: "orange", glyph: "minus" },
    past_due: { label: "Past due", tone: "red", glyph: "alert" },
    scheduled: { label: "Scheduled", tone: "purple", glyph: "calendar" },
    expired: { label: "Expired", tone: "neutral", glyph: "x" },
  };

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** date-fns "d MMM", as the dashboard formats chip dates: "13 Sep". */
const shortDate = {
  format: (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""}`;
  },
};

/** The dashboard's short chip text: "3d left", "Ends 14 Aug", "Past due". */
export function planStatusDetail(
  subscription: Subscription,
  now: number = Date.now(),
): string | null {
  switch (subscription.status) {
    case "trialing": {
      if (subscription.trialEndsAt === null) return "Trial";
      const days = Math.ceil((subscription.trialEndsAt - now) / DAY_MS);
      return days > 0 ? `${days}d left` : "Ends today";
    }
    case "canceling":
      return subscription.currentPeriodEnd
        ? `Ends ${shortDate.format(subscription.currentPeriodEnd)}`
        : "Cancelling";
    case "scheduled":
      return shortDate.format(subscription.startedAt);
    case "past_due":
      return "Past due";
    case "active":
    case "expired":
      return null;
    default: {
      const _exhaustive: never = subscription.status;
      return _exhaustive;
    }
  }
}

/** Plan name chip with status glyph and detail, as in the dashboard's plan column. */
export function PlanStatusChip({
  subscription,
  showPlanName = true,
}: {
  readonly subscription: Subscription;
  readonly showPlanName?: boolean;
}) {
  const config = PLAN_STATUS[subscription.status];
  const detail = planStatusDetail(subscription);
  const quantity = subscription.quantity > 1 ? ` ×${subscription.quantity}` : "";
  return (
    <StatusChip
      tone={config.tone}
      glyph={config.glyph}
      detail={showPlanName ? detail : detail === config.label ? null : detail}
      struck={subscription.status === "expired"}
    >
      {showPlanName ? `${subscription.planName}${quantity}` : config.label}
    </StatusChip>
  );
}

/** Dashboard CustomerInvoiceStatus: refunds override "Paid". */
export function InvoiceStatusChip({ invoice }: { readonly invoice: Invoice }) {
  const { status, refunded } = invoice;
  if (status === "paid" && refunded > 0) {
    // Same comparison as the dashboard: refunds against what was actually paid.
    const paid = invoice.netPaid ? invoice.netPaid.amount + refunded : invoice.total.amount;
    return (
      <StatusChip tone="amber" glyph="refresh">
        {refunded >= Math.abs(paid) ? "Fully Refunded" : "Partially Refunded"}
      </StatusChip>
    );
  }
  const config = INVOICE_STATUS[status];
  return (
    <StatusChip tone={config.tone} glyph={config.glyph}>
      {config.label}
    </StatusChip>
  );
}

const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone; glyph: Glyph }> = {
  draft: { label: "Draft", tone: "neutral", glyph: "pencil" },
  open: { label: "Open", tone: "orange", glyph: "clock" },
  void: { label: "Voided", tone: "red", glyph: "x" },
  paid: { label: "Paid", tone: "green", glyph: "check" },
  uncollectible: { label: "Uncollectible", tone: "neutral", glyph: "minus" },
};
