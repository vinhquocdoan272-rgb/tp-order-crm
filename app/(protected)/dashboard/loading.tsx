import { Card } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index}>
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-8 w-32 animate-pulse rounded bg-muted" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <div className="mb-4 h-5 w-44 animate-pulse rounded bg-muted" />
            <div className="h-72 animate-pulse rounded bg-muted" />
          </Card>
        ))}
      </div>
    </div>
  );
}
