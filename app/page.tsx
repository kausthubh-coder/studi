import { LandingPage } from "@/components/landing/LandingPage";
import PublicConvexClientProvider from "@/components/PublicConvexClientProvider";
import { homeMetadata } from "@/lib/site-metadata";

export const metadata = homeMetadata;

export default function HomePage() {
  return (
    <PublicConvexClientProvider>
      <LandingPage />
    </PublicConvexClientProvider>
  );
}
