import { FEATURE_IDS } from "@homesplit/contracts";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 p-6">
      <h1 className="font-semibold text-2xl">HomeSplit</h1>
      <p className="text-muted-foreground capitalize">
        {FEATURE_IDS.join(" · ")}
      </p>
    </main>
  );
}
