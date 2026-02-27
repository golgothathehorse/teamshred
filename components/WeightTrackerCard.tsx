import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type WeightRow = {
  id: string;
  user_id: string;
  weigh_date: string;
  weight_kg: number;
  inserted_at: string;
  is_monday: boolean;
  is_friday: boolean;
};

type BodyFatRow = {
  id: string;
  user_id: string;
  log_date: string;
  bf_percent: number;
  inserted_at: string;
};

type WaistRow = {
  id: string;
  user_id: string;
  log_date: string;
  waist_cm: number;
  inserted_at: string;
};

type ProfileData = {
  pb_weight_kg: number | null;
  pb_date: string | null;
};

type Props = {
  weights: WeightRow[];
  bodyFatLogs?: BodyFatRow[];
  waistLogs?: WaistRow[];
  profile?: ProfileData;
  loading: boolean;
};

type WeightDataPoint = {
  date: string;
  value: number;
  displayDate: string;
  isPb: boolean;
  isMonday: boolean;
  isFriday: boolean;
};

type BodyFatDataPoint = {
  date: string;
  value: number;
  displayDate: string;
};

type WaistDataPoint = {
  date: string;
  value: number;
  displayDate: string;
};

type DateRange = '7' | '30' | '90' | 'all';

const DATE_RANGE_CONFIG = {
  '7': { days: 7, label: '7D' },
  '30': { days: 30, label: '30D' },
  '90': { days: 90, label: '90D' },
  'all': { days: null, label: 'All' },
};

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function getDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function formatDateDDMM(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

const CustomWeightDot = (props: any) => {
  const { cx, cy, payload } = props;
  
  if (payload.isPb) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill="#eab308" stroke="#fbbf24" strokeWidth={2} />
        <text x={cx} y={cy - 12} textAnchor="middle" fill="#eab308" fontSize="10" fontWeight="bold">
          PB
        </text>
      </g>
    );
  }
  
  // All other dots are simple circles (no M/F icons)
  return <circle cx={cx} cy={cy} r={4} fill="#0ea5e9" stroke="#38bdf8" strokeWidth={2} />;
};

const CustomWeightTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0].payload;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 shadow-lg">
      <p className="text-xs text-slate-400 mb-1">{formatDateDDMM(data.date)}</p>
      <p className="text-sm font-semibold text-sky-200">
        {data.value} kg
      </p>
      {data.isPb && <p className="text-xs text-yellow-400 mt-1">Personal Best!</p>}
    </div>
  );
};

const CustomBodyFatTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0].payload;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 shadow-lg">
      <p className="text-xs text-slate-400 mb-1">{formatDateDDMM(data.date)}</p>
      <p className="text-sm font-semibold text-pink-200">
        {data.value.toFixed(1)}%
      </p>
    </div>
  );
};

const CustomWaistTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0].payload;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 shadow-lg">
      <p className="text-xs text-slate-400 mb-1">{formatDateDDMM(data.date)}</p>
      <p className="text-sm font-semibold text-orange-200">
        {data.value.toFixed(1)} cm
      </p>
    </div>
  );
};

export default function WeightTrackerCard({ weights, bodyFatLogs, waistLogs, profile, loading }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>('30');

  const weightData = useMemo<WeightDataPoint[]>(() => {
    if (!weights || weights.length === 0) return [];

    const normalizeDate = (d?: string | null) => d?.split('T')[0] ?? null;
    const pbDateNormalized = normalizeDate(profile?.pb_date);

    const data = weights.map((w) => {
      const weighDateNormalized = normalizeDate(w.weigh_date);
      return {
        date: w.weigh_date,
        value: w.weight_kg,
        displayDate: formatDateShort(w.weigh_date),
        isPb: pbDateNormalized ? weighDateNormalized === pbDateNormalized : false,
        isMonday: w.is_monday,
        isFriday: w.is_friday,
      };
    });

    const sorted = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (dateRange === 'all') return sorted;

    const days = DATE_RANGE_CONFIG[dateRange].days;
    if (!days) return sorted;

    const cutoffDate = getDaysAgo(days);
    return sorted.filter((d) => new Date(d.date) >= cutoffDate);
  }, [weights, profile, dateRange]);

  const bodyFatData = useMemo<BodyFatDataPoint[]>(() => {
    if (!bodyFatLogs || bodyFatLogs.length === 0) return [];

    const data = bodyFatLogs.map((bf) => ({
      date: bf.log_date,
      value: bf.bf_percent,
      displayDate: formatDateShort(bf.log_date),
    }));

    const sorted = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (dateRange === 'all') return sorted;

    const days = DATE_RANGE_CONFIG[dateRange].days;
    if (!days) return sorted;

    const cutoffDate = getDaysAgo(days);
    return sorted.filter((d) => new Date(d.date) >= cutoffDate);
  }, [bodyFatLogs, dateRange]);

  const waistData = useMemo<WaistDataPoint[]>(() => {
    if (!waistLogs || waistLogs.length === 0) return [];

    const data = waistLogs.map((w) => ({
      date: w.log_date,
      value: w.waist_cm,
      displayDate: formatDateShort(w.log_date),
    }));

    const sorted = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (dateRange === 'all') return sorted;

    const days = DATE_RANGE_CONFIG[dateRange].days;
    if (!days) return sorted;

    const cutoffDate = getDaysAgo(days);
    return sorted.filter((d) => new Date(d.date) >= cutoffDate);
  }, [waistLogs, dateRange]);

  const hasBodyFatData = bodyFatLogs && bodyFatLogs.length > 0;
  const hasWaistData = waistLogs && waistLogs.length > 0;

  // Calculate dynamic Y-axis domain for weight chart
  const weightYAxisConfig = useMemo(() => {
    if (weightData.length === 0) {
      return { domain: [50, 120], ticks: 8 };
    }

    const weights = weightData.map(d => d.value);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    
    // Add ~7-8kg padding on each side
    const padding = 8;
    const domainMin = Math.floor(min - padding);
    const domainMax = Math.ceil(max + padding);
    
    // Ensure minimum range of ~15kg for better visibility
    const range = domainMax - domainMin;
    let finalMin = domainMin;
    let finalMax = domainMax;
    
    if (range < 15) {
      const midPoint = (domainMin + domainMax) / 2;
      finalMin = Math.floor(midPoint - 7.5);
      finalMax = Math.ceil(midPoint + 7.5);
    }
    
    return { domain: [finalMin, finalMax], ticks: 10 };
  }, [weightData]);

  // Calculate dynamic Y-axis domain for body fat chart
  const bodyFatYAxisConfig = useMemo(() => {
    if (bodyFatData.length === 0) {
      return { domain: [10, 30], ticks: 8 };
    }

    const bfValues = bodyFatData.map(d => d.value);
    const min = Math.min(...bfValues);
    const max = Math.max(...bfValues);
    
    // Add ~3-4% padding on each side for body fat
    const padding = 3;
    const domainMin = Math.floor(min - padding);
    const domainMax = Math.ceil(max + padding);
    
    // Ensure minimum range of ~10% for better visibility
    const range = domainMax - domainMin;
    let finalMin = domainMin;
    let finalMax = domainMax;
    
    if (range < 10) {
      const midPoint = (domainMin + domainMax) / 2;
      finalMin = Math.floor(midPoint - 5);
      finalMax = Math.ceil(midPoint + 5);
    }
    
    return { domain: [finalMin, finalMax], ticks: 10 };
  }, [bodyFatData]);

  // Calculate dynamic Y-axis domain for waist chart
  const waistYAxisConfig = useMemo(() => {
    if (waistData.length === 0) {
      return { domain: [60, 120], ticks: 8 };
    }

    const waistValues = waistData.map(d => d.value);
    const min = Math.min(...waistValues);
    const max = Math.max(...waistValues);
    
    // Add ~5cm padding on each side for waist
    const padding = 5;
    const domainMin = Math.floor(min - padding);
    const domainMax = Math.ceil(max + padding);
    
    // Ensure minimum range of ~15cm for better visibility
    const range = domainMax - domainMin;
    let finalMin = domainMin;
    let finalMax = domainMax;
    
    if (range < 15) {
      const midPoint = (domainMin + domainMax) / 2;
      finalMin = Math.floor(midPoint - 7.5);
      finalMax = Math.ceil(midPoint + 7.5);
    }
    
    return { domain: [finalMin, finalMax], ticks: 10 };
  }, [waistData]);

  return (
    <section className="rounded-2xl border border-sky-500/40 bg-slate-950/70 shadow-lg shadow-sky-500/10 p-5 space-y-4">
      <h2 className="text-lg font-semibold text-sky-300">Shred Tracker</h2>

      <Tabs defaultValue="weight" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-slate-900/50 border border-slate-700/50">
          <TabsTrigger value="weight" data-testid="tab-weight">Weight</TabsTrigger>
          <TabsTrigger value="bodyfat" data-testid="tab-bodyfat" disabled={!hasBodyFatData}>
            Body Fat %
          </TabsTrigger>
          <TabsTrigger value="waist" data-testid="tab-waist" disabled={!hasWaistData}>
            Waist
          </TabsTrigger>
        </TabsList>

        <TabsContent value="weight" className="space-y-4 mt-4">
          {/* Chart */}
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-xs text-slate-500">Loading chart data…</p>
            </div>
          ) : weightData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-xs text-slate-500">
                No weight data available for this period.
              </p>
            </div>
          ) : (
            <div className="h-64 w-full" data-testid="chart-weight">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={weightData}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis
                    dataKey="displayDate"
                    stroke="#64748b"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: '#94a3b8' }}
                    domain={weightYAxisConfig.domain}
                    tickCount={weightYAxisConfig.ticks}
                    label={{
                      value: 'Weight (kg)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: '#94a3b8', fontSize: '11px' },
                    }}
                  />
                  <Tooltip content={<CustomWeightTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={<CustomWeightDot />}
                    activeDot={{ r: 6, fill: '#38bdf8' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Date range toggle */}
          <div className="flex justify-center">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-700/50 bg-slate-900/50 p-1 gap-1">
              {(Object.keys(DATE_RANGE_CONFIG) as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  data-testid={`button-view-${range}`}
                  className={`px-4 min-h-11 text-sm font-medium rounded-md transition-colors ${
                    dateRange === range
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {DATE_RANGE_CONFIG[range].label}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bodyfat" className="space-y-4 mt-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-sm text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ec4899] border-2 border-[#f472b6]"></div>
              <span>Body Fat %</span>
            </div>
          </div>

          {/* Chart */}
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-xs text-slate-500">Loading chart data…</p>
            </div>
          ) : bodyFatData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-xs text-slate-500">
                No body fat data available for this period.
              </p>
            </div>
          ) : (
            <div className="h-64 w-full" data-testid="chart-bodyfat">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={bodyFatData}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis
                    dataKey="displayDate"
                    stroke="#64748b"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis
                    stroke="#ec4899"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: '#ec4899' }}
                    domain={bodyFatYAxisConfig.domain}
                    tickCount={bodyFatYAxisConfig.ticks}
                    label={{
                      value: 'Body Fat %',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: '#ec4899', fontSize: '11px' },
                    }}
                  />
                  <Tooltip content={<CustomBodyFatTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#ec4899"
                    strokeWidth={2}
                    dot={(props: any) => {
                      const { cx, cy } = props;
                      if (cx === undefined || cy === undefined) return null;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5}
                          fill="#ec4899"
                          stroke="#f472b6"
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 6, fill: '#f472b6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Date range toggle */}
          <div className="flex justify-center">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-700/50 bg-slate-900/50 p-1 gap-1">
              {(Object.keys(DATE_RANGE_CONFIG) as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  data-testid={`button-view-${range}`}
                  className={`px-4 min-h-11 text-sm font-medium rounded-md transition-colors ${
                    dateRange === range
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {DATE_RANGE_CONFIG[range].label}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="waist" className="space-y-4 mt-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-sm text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#f97316] border-2 border-[#fb923c]"></div>
              <span>Waist (cm)</span>
            </div>
          </div>

          {/* Chart */}
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-xs text-slate-500">Loading chart data…</p>
            </div>
          ) : waistData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-xs text-slate-500">
                No waist data available for this period.
              </p>
            </div>
          ) : (
            <div className="h-64 w-full" data-testid="chart-waist">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={waistData}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis
                    dataKey="displayDate"
                    stroke="#64748b"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis
                    stroke="#f97316"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: '#f97316' }}
                    domain={waistYAxisConfig.domain}
                    tickCount={waistYAxisConfig.ticks}
                    label={{
                      value: 'Waist (cm)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: '#f97316', fontSize: '11px' },
                    }}
                  />
                  <Tooltip content={<CustomWaistTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={(props: any) => {
                      const { cx, cy } = props;
                      if (cx === undefined || cy === undefined) return null;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5}
                          fill="#f97316"
                          stroke="#fb923c"
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 6, fill: '#fb923c' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Date range toggle */}
          <div className="flex justify-center">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-700/50 bg-slate-900/50 p-1 gap-1">
              {(Object.keys(DATE_RANGE_CONFIG) as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  data-testid={`button-view-waist-${range}`}
                  className={`px-4 min-h-11 text-sm font-medium rounded-md transition-colors ${
                    dateRange === range
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {DATE_RANGE_CONFIG[range].label}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
