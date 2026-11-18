import { KreoLogo } from "@/components/brand/logo";
import { OnboardingForm } from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <KreoLogo className="h-8" />
      <div className="w-full max-w-md">
        <OnboardingForm />
      </div>
    </div>
  );
}
