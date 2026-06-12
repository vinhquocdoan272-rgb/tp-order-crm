import { Card } from "@/components/ui/card";

export default function OrdersLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-36 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
      <Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded bg-muted" />)}
        </div>
      </Card>
      <Card>
        <div className="mb-4 h-10 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-8 animate-pulse rounded bg-muted" />)}
        </div>
      </Card>
    </div>
  );
}
