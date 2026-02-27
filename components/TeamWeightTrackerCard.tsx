import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getUserColor } from '../lib/userColors';

type WeightEntry = {
  id: string;
  user_id: string;
  weigh_date: string;
  weight_kg: number;
  inserted_at: string;
  is_monday: boolean;
  is_friday: boolean;
};

type BodyFatEntry = {
  id: string;
  user_id: string;
  log_date: string;
  bf_percent: number;
  inserted_at: string;
};

type WaistEntry = {
  id: string;
  user_id: string;
  log_date: string;
  waist_cm: number;
  inserted_at: string;
};

type MemberData = {
  user_id: string;
  username: string;
  weights: WeightEntry[];
  bodyFatLogs: BodyFatEntry[];
  waistLogs: WaistEntry[];
  goal_weight: number | null;
  goal_bf: number | null;
  pb_weight_kg: number | null;
  pb_date: string | null;
};

type Props = {
  members: MemberData[];
  loading: boolean;
  error?: string | null;
  teamName?: string;
};

type ChartDataPoint = {
  date: string;
  displayDate: string;
  [key: string]: any; // Dynamic keys for weights/bf and metadata (isPb_userId, isMonday_userId, etc.)
};

type DateRange = '7' | '30' | '90' | 'all';

const DATE_RANGE_CONFIG = {
  '7': { days: 7, label: '7D' },
  '30': { days: 30, label: '30D' },
  '90': { days: 90, label: '90D' },
  'all': { days: null, label: 'All' },
};

// User colors are imported from lib/userColors.ts for consistency across components

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function getDaysAgo(days: number): Date {
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

const CustomTeamDot = (props: any) => {
  const { cx, cy, payload, dataKey } = props;
  
  // Extract user_id from the dataKey (e.g., "weight_user123" -> "user123")
  const userId = dataKey.replace(/^(weight_|bf_|waist_)/, '');
  
  // Check if this user has actual data at this point
  const actualValue = payload[dataKey];
  if (actualValue === null || actualValue === undefined) {
    return null; // Don't render dot if no data
  }
  
  // Check metadata for this specific user on this date
  const isPb = payload[`isPb_${userId}`];
  
  if (isPb) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill="#eab308" stroke="#fbbf24" strokeWidth={2} />
        <text x={cx} y={cy - 12} textAnchor="middle" fill="#eab308" fontSize="10" fontWeight="bold">
          PB
        </text>
      </g>
    );
  }
  
  // Default dot - use the stroke color from props
  return <circle cx={cx} cy={cy} r={4} fill={props.stroke} strokeWidth={0} />;
};

const CustomTeamTooltip = ({ active, payload, members, metricType }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const activeSeries = payload.filter((p: any) => p.value !== undefined && p.value !== null);

  const getPrefix = () => {
    if (metricType === 'weight') return 'weight_';
    if (metricType === 'bodyfat') return 'bf_';
    return 'waist_';
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-lg max-w-xs">
      <p className="text-xs text-slate-400 mb-2 font-semibold">
        {formatDateDDMM(data.date)}
      </p>
      <div className="space-y-1">
        {activeSeries.map((series: any, idx: number) => {
          const userId = series.dataKey.replace(getPrefix(), '');
          const member = members.find((m: MemberData) => m.user_id === userId);
          
          const isPb = data[`isPb_${userId}`];
          const isMonday = data[`isMonday_${userId}`];
          const isFriday = data[`isFriday_${userId}`];
          
          return (
            <div key={idx} className="space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: series.stroke }}
                  />
                  <span className="text-xs text-slate-300">{member?.username || 'Unknown'}</span>
                </div>
                <span className="text-xs font-semibold" style={{ color: series.stroke }}>
                  {metricType === 'weight' 
                    ? `${series.value} kg`
                    : metricType === 'bodyfat'
                    ? `${series.value.toFixed(1)}%`
                    : `${series.value.toFixed(1)} cm`
                  }
                </span>
              </div>
              {isPb && <p className="text-xs text-yellow-400 ml-4">Personal Best!</p>}
              {isMonday && <p className="text-xs text-purple-400 ml-4">Monday Weigh-in</p>}
              {isFriday && <p className="text-xs text-emerald-400 ml-4">Friday Weigh-in</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function TeamWeightTrackerCard({ members, loading, error, teamName }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [hiddenUsers, setHiddenUsers] = useState<Set<string>>(new Set());

  const toggleUser = (userId: string) => {
    setHiddenUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const showAll = () => setHiddenUsers(new Set());
  const hideAll = () => setHiddenUsers(new Set(members.map(m => m.user_id)));

  const userColors = useMemo(() => {
    const colors = new Map<string, string>();
    // Sort alphabetically by username to ensure consistent color assignment
    const alphabeticallySorted = [...members].sort((a, b) => 
      a.username.toLowerCase().localeCompare(b.username.toLowerCase())
    );
    alphabeticallySorted.forEach((member) => {
      colors.set(member.user_id, getUserColor(member.username));
    });
    return colors;
  }, [members]);

  const weightChartData = useMemo<ChartDataPoint[]>(() => {
    if (!members || members.length === 0) return [];

    const cutoffDate = dateRange === 'all' ? null : getDaysAgo(DATE_RANGE_CONFIG[dateRange].days!);
    const dataMap = new Map<string, ChartDataPoint>();

    members.forEach((member) => {
      const normalizeDate = (d?: string | null) => d?.split('T')[0] ?? null;
      const pbDateNormalized = normalizeDate(member.pb_date);
      
      member.weights.forEach((w) => {
        const weightDate = new Date(w.weigh_date);
        if (cutoffDate && weightDate < cutoffDate) return;

        const dateKey = w.weigh_date.split('T')[0];
        if (!dataMap.has(dateKey)) {
          dataMap.set(dateKey, {
            date: w.weigh_date,
            displayDate: formatDateShort(w.weigh_date),
          });
        }
        const point = dataMap.get(dateKey)!;
        point[`weight_${member.user_id}`] = w.weight_kg;
        
        // Add metadata for this specific user
        const weighDateNormalized = normalizeDate(w.weigh_date);
        point[`isPb_${member.user_id}`] = pbDateNormalized ? weighDateNormalized === pbDateNormalized : false;
        point[`isMonday_${member.user_id}`] = w.is_monday;
        point[`isFriday_${member.user_id}`] = w.is_friday;
      });
    });

    return Array.from(dataMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [members, dateRange]);

  const bodyFatChartData = useMemo<ChartDataPoint[]>(() => {
    if (!members || members.length === 0) return [];

    const cutoffDate = dateRange === 'all' ? null : getDaysAgo(DATE_RANGE_CONFIG[dateRange].days!);
    const dataMap = new Map<string, ChartDataPoint>();

    members.forEach((member) => {
      member.bodyFatLogs.forEach((bf) => {
        const bfDate = new Date(bf.log_date);
        if (cutoffDate && bfDate < cutoffDate) return;

        const dateKey = bf.log_date.split('T')[0];
        if (!dataMap.has(dateKey)) {
          dataMap.set(dateKey, {
            date: bf.log_date,
            displayDate: formatDateShort(bf.log_date),
          });
        }
        const point = dataMap.get(dateKey)!;
        point[`bf_${member.user_id}`] = bf.bf_percent;
      });
    });

    return Array.from(dataMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [members, dateRange]);

  const waistChartData = useMemo<ChartDataPoint[]>(() => {
    if (!members || members.length === 0) return [];

    const cutoffDate = dateRange === 'all' ? null : getDaysAgo(DATE_RANGE_CONFIG[dateRange].days!);
    const dataMap = new Map<string, ChartDataPoint>();

    members.forEach((member) => {
      const waistLogs = member.waistLogs ?? [];
      waistLogs.forEach((waist) => {
        const waistDate = new Date(waist.log_date);
        if (cutoffDate && waistDate < cutoffDate) return;

        const dateKey = waist.log_date.split('T')[0];
        if (!dataMap.has(dateKey)) {
          dataMap.set(dateKey, {
            date: waist.log_date,
            displayDate: formatDateShort(waist.log_date),
          });
        }
        const point = dataMap.get(dateKey)!;
        point[`waist_${member.user_id}`] = waist.waist_cm;
      });
    });

    return Array.from(dataMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [members, dateRange]);

  const hasBodyFatData = members.some(m => m.bodyFatLogs && m.bodyFatLogs.length > 0);
  const hasWaistData = members.some(m => (m.waistLogs ?? []).length > 0);

  // Calculate dynamic Y-axis domain for weight chart
  const weightYAxisConfig = useMemo(() => {
    if (weightChartData.length === 0) {
      return { domain: [50, 120], ticks: 8 };
    }

    // Extract all weight values from all members in the chart data
    const allWeights: number[] = [];
    weightChartData.forEach(point => {
      members.forEach(member => {
        const weightKey = `weight_${member.user_id}`;
        if (point[weightKey] !== undefined && point[weightKey] !== null) {
          allWeights.push(point[weightKey]);
        }
      });
    });

    if (allWeights.length === 0) {
      return { domain: [50, 120], ticks: 8 };
    }

    const min = Math.min(...allWeights);
    const max = Math.max(...allWeights);
    
    // Add ~5kg padding on each side for team charts
    const padding = 5;
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
  }, [weightChartData, members]);

  // Calculate dynamic Y-axis domain for body fat chart
  const bodyFatYAxisConfig = useMemo(() => {
    if (bodyFatChartData.length === 0) {
      return { domain: [10, 30], ticks: 8 };
    }

    // Extract all body fat values from all members in the chart data
    const allBfValues: number[] = [];
    bodyFatChartData.forEach(point => {
      members.forEach(member => {
        const bfKey = `bf_${member.user_id}`;
        if (point[bfKey] !== undefined && point[bfKey] !== null) {
          allBfValues.push(point[bfKey]);
        }
      });
    });

    if (allBfValues.length === 0) {
      return { domain: [10, 30], ticks: 8 };
    }

    const min = Math.min(...allBfValues);
    const max = Math.max(...allBfValues);
    
    // Add ~3% padding on each side for body fat
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
  }, [bodyFatChartData, members]);

  // Calculate dynamic Y-axis domain for waist chart
  const waistYAxisConfig = useMemo(() => {
    if (waistChartData.length === 0) {
      return { domain: [60, 120], ticks: 8 };
    }

    // Extract all waist values from all members in the chart data
    const allWaistValues: number[] = [];
    waistChartData.forEach(point => {
      members.forEach(member => {
        if (!member.waistLogs || member.waistLogs.length === 0) return;
        const waistKey = `waist_${member.user_id}`;
        if (point[waistKey] !== undefined && point[waistKey] !== null) {
          allWaistValues.push(point[waistKey]);
        }
      });
    });

    if (allWaistValues.length === 0) {
      return { domain: [60, 120], ticks: 8 };
    }

    const min = Math.min(...allWaistValues);
    const max = Math.max(...allWaistValues);
    
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
  }, [waistChartData, members]);

  return (
    <section className="rounded-2xl border border-sky-500/40 bg-slate-950/70 shadow-lg shadow-sky-500/10 p-4 space-y-3">
      <h2 className="text-base font-semibold text-sky-300">{teamName || 'Team'} Tracker</h2>

      {/* Interactive Legend - Team Members */}
      <div className="space-y-2">
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Team Members (click to show/hide)</p>
        <div className="flex flex-wrap gap-2">
          {members.map((member) => {
            const color = userColors.get(member.user_id) || '#64748b';
            const isHidden = hiddenUsers.has(member.user_id);
            
            return (
              <button
                key={member.user_id}
                onClick={() => toggleUser(member.user_id)}
                data-testid={`toggle-user-${member.user_id}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
                  isHidden
                    ? 'border-slate-700 bg-slate-900/50 opacity-50'
                    : 'border-slate-600 bg-slate-800/80'
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: isHidden ? '#64748b' : color,
                    border: `2px solid ${isHidden ? '#475569' : color}`,
                  }}
                />
                <span className={`text-xs font-medium ${isHidden ? 'text-slate-500' : 'text-slate-200'}`}>
                  {member.username}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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

        <TabsContent value="weight" className="mt-4">
          {/* Chart */}
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-xs text-slate-500">Loading chart data…</p>
            </div>
          ) : error ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          ) : weightChartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-xs text-slate-500">
                No weight data available for this period.
              </p>
            </div>
          ) : (
            <div className="h-80 w-full -mx-2" data-testid="chart-team-weight">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={weightChartData}
                  margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis
                    dataKey="displayDate"
                    stroke="#64748b"
                    style={{ fontSize: '10px' }}
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    style={{ fontSize: '10px' }}
                    tick={{ fill: '#94a3b8' }}
                    domain={weightYAxisConfig.domain}
                    tickCount={weightYAxisConfig.ticks}
                    label={{
                      value: 'Weight (kg)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: '#94a3b8', fontSize: '10px' },
                    }}
                  />
                  <Tooltip content={<CustomTeamTooltip members={members} metricType="weight" />} />
                  {members.map((member) => {
                    if (hiddenUsers.has(member.user_id)) return null;
                    const color = userColors.get(member.user_id) || '#64748b';
                    return (
                      <Line
                        key={member.user_id}
                        type="monotone"
                        dataKey={`weight_${member.user_id}`}
                        stroke={color}
                        strokeWidth={2}
                        dot={<CustomTeamDot stroke={color} />}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Date range toggle */}
          <div className="flex justify-center mt-4">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-700/50 bg-slate-900/50 p-1 gap-1">
              {(Object.keys(DATE_RANGE_CONFIG) as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  data-testid={`button-view-${range}days`}
                  className={`px-3 min-h-11 text-xs font-medium rounded-md transition-colors ${
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

        <TabsContent value="bodyfat" className="mt-4">
          {/* Chart */}
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-xs text-slate-500">Loading chart data…</p>
            </div>
          ) : error ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          ) : bodyFatChartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-xs text-slate-500">
                No body fat data available for this period.
              </p>
            </div>
          ) : (
            <div className="h-80 w-full -mx-2" data-testid="chart-team-bodyfat">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={bodyFatChartData}
                  margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis
                    dataKey="displayDate"
                    stroke="#64748b"
                    style={{ fontSize: '10px' }}
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis
                    stroke="#ec4899"
                    style={{ fontSize: '10px' }}
                    tick={{ fill: '#ec4899' }}
                    domain={bodyFatYAxisConfig.domain}
                    tickCount={bodyFatYAxisConfig.ticks}
                    label={{
                      value: 'Body Fat %',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: '#ec4899', fontSize: '10px' },
                    }}
                  />
                  <Tooltip content={<CustomTeamTooltip members={members} metricType="bodyfat" />} />
                  {members.map((member) => {
                    if (hiddenUsers.has(member.user_id)) return null;
                    const color = userColors.get(member.user_id) || '#64748b';
                    return (
                      <Line
                        key={member.user_id}
                        type="monotone"
                        dataKey={`bf_${member.user_id}`}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ r: 4, fill: color, strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Date range toggle */}
          <div className="flex justify-center mt-4">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-700/50 bg-slate-900/50 p-1 gap-1">
              {(Object.keys(DATE_RANGE_CONFIG) as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  data-testid={`button-view-${range}days`}
                  className={`px-3 min-h-11 text-xs font-medium rounded-md transition-colors ${
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

        <TabsContent value="waist" className="mt-4">
          {/* Chart */}
          {loading ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-xs text-slate-500">Loading chart data…</p>
            </div>
          ) : error ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          ) : waistChartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center">
              <p className="text-xs text-slate-500">
                No waist data available for this period.
              </p>
            </div>
          ) : (
            <div className="h-80 w-full -mx-2" data-testid="chart-team-waist">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={waistChartData}
                  margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis
                    dataKey="displayDate"
                    stroke="#64748b"
                    style={{ fontSize: '10px' }}
                    tick={{ fill: '#94a3b8' }}
                  />
                  <YAxis
                    stroke="#f97316"
                    style={{ fontSize: '10px' }}
                    tick={{ fill: '#f97316' }}
                    domain={waistYAxisConfig.domain}
                    tickCount={waistYAxisConfig.ticks}
                    label={{
                      value: 'Waist (cm)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fill: '#f97316', fontSize: '10px' },
                    }}
                  />
                  <Tooltip content={<CustomTeamTooltip members={members} metricType="waist" />} />
                  {members.map((member) => {
                    if (hiddenUsers.has(member.user_id)) return null;
                    const color = userColors.get(member.user_id) || '#64748b';
                    return (
                      <Line
                        key={member.user_id}
                        type="monotone"
                        dataKey={`waist_${member.user_id}`}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ r: 4, fill: color, strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Date range toggle */}
          <div className="flex justify-center mt-4">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-700/50 bg-slate-900/50 p-1 gap-1">
              {(Object.keys(DATE_RANGE_CONFIG) as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  data-testid={`button-view-waist-${range}days`}
                  className={`px-3 min-h-11 text-xs font-medium rounded-md transition-colors ${
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
