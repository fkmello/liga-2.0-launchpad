import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Liga 2.0" },
      { name: "description", content: "Liga 2.0" },
      { property: "og:title", content: "Liga 2.0" },
      { property: "og:description", content: "Liga 2.0" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <h1 className="text-6xl font-bold text-foreground">Liga 2.0</h1>
    </div>
  );
}
