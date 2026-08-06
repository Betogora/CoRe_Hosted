import { DeckSummaryRow, type DeckSummaryRowProps } from "./DeckSummaryRow.tsx";

export type CompactDeckSummaryRowProps = Omit<DeckSummaryRowProps, "density">;

export function CompactDeckSummaryRow(props: CompactDeckSummaryRowProps) {
  return <DeckSummaryRow {...props} density="compact" />;
}
