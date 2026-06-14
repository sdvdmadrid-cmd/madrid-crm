import SubscribeErrorBoundary from "@/components/subscribe/SubscribeErrorBoundary";
import SubscribePageClient from "./SubscribePageClient";

export const metadata = {
  title: "Subscribe — FieldBase",
  robots: { index: false, follow: false },
};

export default function SubscribePage() {
  return (
    <SubscribeErrorBoundary>
      <SubscribePageClient />
    </SubscribeErrorBoundary>
  );
}
