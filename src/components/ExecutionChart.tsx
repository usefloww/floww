import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { SummaryResponse } from "@/types/api";

interface ExecutionChartProps {
  data: SummaryResponse | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function ExecutionChart({ data, isLoading, error }: ExecutionChartProps) {
  const chartData = useMemo(() => {
    if (!data || !data.executionsByDay) return [];

    // Format data for the chart - show last 7 days
    const daysToShow = Math.min(7, data.executionsByDay.length);
    const recentData = data.executionsByDay.slice(-daysToShow);

    return recentData.map((day: { date: string; completed: number; total: number }) => ({
      date: new Date(day.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      fullDate: day.date,
      completed: day.completed,
      failed: day.total - day.completed, // Difference between total and completed
    }));
  }, [data]);

  const chartConfig = {
    completed: {
      label: "Completed",
      color: "hsl(142, 76%, 36%)", // Green color
    },
    failed: {
      label: "Non-Completed",
      color: "hsl(0, 84%, 60%)", // Red color
    },
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground text-sm">Loading execution data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="text-center text-muted-foreground">
          <p>Failed to load execution data</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!data || !data.executionsByDay || data.totalExecutions === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="text-center text-muted-foreground">
          <p>No execution data available</p>
          <p className="text-sm mt-1">
            Workflow executions will appear here once they start running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Execution Overview
        </h2>
        <p className="text-sm text-muted-foreground">
          Showing executions for the last 7 days
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Total Executions</p>
          <p className="text-3xl font-bold text-foreground">
            {data.totalExecutions.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">Success Rate</p>
          <p className="text-3xl font-bold text-foreground">
            {data.totalExecutions > 0
              ? Math.round(
                  (data.totalCompleted / data.totalExecutions) * 100
                )
              : 0}
            %
          </p>
        </div>
      </div>

      <ChartContainer config={chartConfig} className="h-[300px] w-full">
        <BarChart data={chartData}>
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => value}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => value.toLocaleString()}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-[12rem] [&>div]:gap-2"
                labelFormatter={(value, payload) => {
                  if (payload && payload[0]) {
                    const data = payload[0].payload;
                    return new Date(data.fullDate).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    });
                  }
                  return value;
                }}
                formatter={(value, name, item) => {
                  const itemConfig = chartConfig[name as keyof typeof chartConfig];
                  return (
                    <div className="flex items-center justify-between w-full gap-8">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                          style={{
                            backgroundColor: itemConfig?.color || item.color || "hsl(var(--chart-1))",
                          }}
                        />
                        <span className="text-muted-foreground text-xs whitespace-nowrap">
                          {itemConfig?.label || name}
                        </span>
                      </div>
                      <span className="font-mono font-medium tabular-nums text-foreground text-xs whitespace-nowrap text-right">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          <Bar
            dataKey="completed"
            fill="var(--color-completed)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="failed"
            fill="var(--color-failed)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

