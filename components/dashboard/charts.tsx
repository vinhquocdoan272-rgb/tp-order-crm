"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils/format";

const PIE_COLORS = ["#0f766e", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#4b5563", "#16a34a"];

function EmptyChart() {
  return <div className="grid h-72 place-items-center rounded-md border border-dashed text-sm text-muted-foreground">Chưa có dữ liệu biểu đồ</div>;
}

export function DashboardCharts({
  branchRevenue,
  statusCounts,
  sevenDays,
}: {
  branchRevenue: { name: string; value: number }[];
  statusCounts: { name: string; value: number }[];
  sevenDays: { name: string; value: number }[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <h2 className="mb-4 font-semibold">Doanh thu theo chi nhánh</h2>
        {branchRevenue.length === 0 ? (
          <EmptyChart />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${Number(value) / 1000000}tr`} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Bar dataKey="value" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="mb-4 font-semibold">Đơn hàng theo trạng thái</h2>
        {statusCounts.length === 0 ? (
          <EmptyChart />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Pie data={statusCounts} dataKey="value" nameKey="name" outerRadius={95} label>
                  {statusCounts.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="mb-4 font-semibold">Doanh thu 7 ngày gần nhất</h2>
        {sevenDays.every((item) => item.value === 0) ? (
          <EmptyChart />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sevenDays}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${Number(value) / 1000000}tr`} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
