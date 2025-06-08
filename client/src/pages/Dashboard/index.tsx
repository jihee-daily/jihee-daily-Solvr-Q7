import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CsvRelease, ProcessedCsvRelease, ChangeType, KpiData, TimeSeriesData, ChangeTypeDistribution, RepoActivityData } from '../../types/dashboard';
import KpiCard from '../../components/KpiCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import { FilterIcon, SunIcon, MoonIcon } from '../../components/Icons';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipProps, LabelList } from 'recharts';
import { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

type Theme = 'light' | 'dark';

const TYPE_COLORS: Record<ChangeType, string> = {
  [ChangeType.MAJOR]: '#EF4444',
  [ChangeType.MINOR]: '#F97316',
  [ChangeType.PATCH]: '#EAB308',
  [ChangeType.OTHER_CHANGE]: '#6366F1',
  [ChangeType.PRERELEASE]: '#A855F7',
  [ChangeType.STABLE]: '#22C55E',
  [ChangeType.GENERAL_OTHER]: '#6B7280',
};

const ITEMS_PER_PAGE = 10;
const MAX_REPOS_TO_DISPLAY = 10;
const CHART_HEIGHT = 280;

const CustomTooltip = ({ active, payload, label, theme }: TooltipProps<ValueType, NameType> & { theme: Theme }) => {
    if (active && payload && payload.length) {
      const tooltipClass = `backdrop-blur-sm p-3 rounded-md shadow-lg text-xs border ${
        theme === 'dark' 
          ? 'bg-slate-800/90 text-slate-200 border-slate-700' 
          : 'bg-white/90 text-slate-800 border-gray-300'
      }`;
      const data = payload[0].payload;
      
      return (
        <div className={tooltipClass}>
           <p className="font-semibold mb-1">{data.name || label}</p>
          {payload.map((pld: any, index: number) => (
            <p key={index} style={{ color: pld.color || '#000' }}>
              {`${pld.name}: ${pld.value?.toLocaleString()}${pld.unit || ''}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
};

const DashboardPage: React.FC = () => {
  const [releases, setReleases] = useState<ProcessedCsvRelease[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedRepoNames, setSelectedRepoNames] = useState<Set<string>>(new Set());
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [selectedAuthors, setSelectedAuthors] = useState<Set<string>>(new Set());
  const [selectedChangeTypes, setSelectedChangeTypes] = useState<Set<ChangeType>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  
  const [currentPage, setCurrentPage] = useState<number>(1);
  const recentReleasesSectionRef = useRef<HTMLDivElement>(null);
  const [tableDataTimestamp, setTableDataTimestamp] = useState<number>(Date.now());

  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const parseStringArray = (str: string): string[] => {
    if (!str || typeof str !== 'string' || str.trim() === "[]" || str.trim() === "") return [];
    let content = str.trim();
    if (content.startsWith("[") && content.endsWith("]")) {
      content = content.substring(1, content.length - 1).trim();
    }
    if (content === "") return [];
    return content.split(/',\s*'/).map(item => item.trim().replace(/^'|'$/g, '')).filter(s => s.length > 0);
  };
  
  const parseCsvData = (csvText: string): CsvRelease[] => {
    const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    const headerLine = lines[0].startsWith('\uFEFF') ? lines[0].substring(1) : lines[0];
    const headers = headerLine.split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const entry: any = {};
      headers.forEach((header, index) => {
        const value = values[index] ? values[index].trim() : '';
        if (['major_changes', 'minor_changes', 'patch_changes', 'other_changes'].includes(header)) {
          entry[header] = parseStringArray(value);
        } else {
          entry[header] = value;
        }
      });
      return entry as CsvRelease;
    });
  };

  const processReleases = useCallback((csvData: CsvRelease[]): ProcessedCsvRelease[] => {
    return csvData
      .filter(r => r.published_at_kst)
      .map(r => {
        const derivedChangeTypes: ChangeType[] = r.is_prerelease ? [ChangeType.PRERELEASE] : [ChangeType.STABLE];
        if (r.major_changes.length > 0) derivedChangeTypes.push(ChangeType.MAJOR);
        if (r.minor_changes.length > 0) derivedChangeTypes.push(ChangeType.MINOR);
        if (r.patch_changes.length > 0) derivedChangeTypes.push(ChangeType.PATCH);
        if (r.other_changes.length > 0) derivedChangeTypes.push(ChangeType.OTHER_CHANGE);
        if (![ChangeType.MAJOR, ChangeType.MINOR, ChangeType.PATCH, ChangeType.OTHER_CHANGE].some(ct => derivedChangeTypes.includes(ct))) {
            derivedChangeTypes.push(ChangeType.GENERAL_OTHER);
        }
        return {
          ...r,
          id: parseInt(r.id as any, 10) || 0,
          working_days: parseInt(r.working_days as any, 10) || 0,
          publishedDate: r.published_at_kst ? new Date(r.published_at_kst) : null,
          derivedChangeTypes,
          numMajorChanges: r.major_changes.length,
          numMinorChanges: r.minor_changes.length,
          numPatchChanges: r.patch_changes.length,
          numOtherChanges: r.other_changes.length,
        };
      })
      .sort((a, b) => (b.publishedDate?.getTime() || 0) - (a.publishedDate?.getTime() || 0));
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/github_releases_data.csv');
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        const csvText = await response.text();
        const parsed = parseCsvData(csvText);
        const processed = processReleases(parsed);
        setReleases(processed);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [processReleases]);

  const filteredReleases = useMemo(() => {
    return releases.filter(r => {
      if (selectedRepoNames.size > 0 && !selectedRepoNames.has(r.repo_name)) return false;
      if (selectedPackages.size > 0 && !selectedPackages.has(r.package)) return false;
      if (selectedAuthors.size > 0 && !selectedAuthors.has(r.author)) return false;
      if (selectedChangeTypes.size > 0 && !r.derivedChangeTypes.some(cat => selectedChangeTypes.has(cat))) return false;
      if (selectedMonths.size > 0) {
        if (!r.publishedDate) return false;
        const yearMonth = `${r.publishedDate.getFullYear()}-${String(r.publishedDate.getMonth() + 1).padStart(2, '0')}`;
        return selectedMonths.has(yearMonth);
      }
      return true;
    });
  }, [releases, selectedRepoNames, selectedPackages, selectedAuthors, selectedChangeTypes, selectedMonths]);

  const kpiValues: KpiData[] = useMemo(() => {
    const uniqueRepos = new Set(filteredReleases.map(r => r.repo_name)).size;
    const uniqueAuthors = new Set(filteredReleases.map(r => r.author)).size;
    const totalWorkingDays = filteredReleases.reduce((sum, r) => sum + (r.working_days || 0), 0);
    const releasesWithWorkingDays = filteredReleases.filter(r => r.working_days > 0);
    const avgWorkingDays = releasesWithWorkingDays.length > 0 ? (totalWorkingDays / releasesWithWorkingDays.length).toFixed(1) + '일' : 'N/A';
    return [
      { title: '총 릴리즈 수', value: filteredReleases.length },
      { title: '분석된 저장소 수', value: uniqueRepos },
      { title: '활동적인 작성자 수', value: uniqueAuthors },
      { title: '평균 작업일', value: avgWorkingDays },
    ];
  }, [filteredReleases]);

  const stabilityData = useMemo((): ChangeTypeDistribution[] => {
    const counts = filteredReleases.reduce((acc, r) => {
        acc[r.is_prerelease ? ChangeType.PRERELEASE : ChangeType.STABLE] = (acc[r.is_prerelease ? ChangeType.PRERELEASE : ChangeType.STABLE] || 0) + 1;
        return acc;
    }, {} as Record<ChangeType, number>);
    return Object.entries(counts).map(([name, value]) => ({ name: name as ChangeType, value }));
  }, [filteredReleases]);

  const releaseFrequencyData = useMemo((): TimeSeriesData[] => {
    const counts = filteredReleases.reduce((acc, r) => {
        if(r.publishedDate) {
            const yearMonth = `${r.publishedDate.getFullYear()}-${String(r.publishedDate.getMonth() + 1).padStart(2, '0')}`;
            acc[yearMonth] = (acc[yearMonth] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([date, count]) => ({ date, count })).sort((a,b) => a.date.localeCompare(b.date));
  }, [filteredReleases]);
  
  const changeTypeCountsData = useMemo(() => {
    const counts: Record<string, number> = {
        [ChangeType.MAJOR]: 0,
        [ChangeType.MINOR]: 0,
        [ChangeType.PATCH]: 0,
        [ChangeType.OTHER_CHANGE]: 0,
    };
    filteredReleases.forEach(r => {
      counts[ChangeType.MAJOR] += r.numMajorChanges;
      counts[ChangeType.MINOR] += r.numMinorChanges;
      counts[ChangeType.PATCH] += r.numPatchChanges;
      counts[ChangeType.OTHER_CHANGE] += r.numOtherChanges;
    });
    return [ChangeType.MAJOR, ChangeType.MINOR, ChangeType.PATCH, ChangeType.OTHER_CHANGE]
      .map(name => ({ name: name as ChangeType, value: counts[name] }))
      .filter(item => item.value > 0);
  }, [filteredReleases]);
  
  const repoWorkingDaysData = useMemo((): RepoActivityData[] => {
      const repoMap: Map<string, { totalDays: number, count: number }> = new Map();
      filteredReleases.forEach(r => {
        if (r.working_days > 0) {
          if (!repoMap.has(r.repo_name)) {
            repoMap.set(r.repo_name, { totalDays: 0, count: 0 });
          }
          const data = repoMap.get(r.repo_name)!;
          data.totalDays += r.working_days;
          data.count++;
        }
      });
      return Array.from(repoMap.entries())
        .map(([name, data]) => ({ name, releases: data.count, avgWorkingDays: parseFloat((data.totalDays / data.count).toFixed(1))}))
        .sort((a, b) => b.avgWorkingDays - a.avgWorkingDays)
        .slice(0, MAX_REPOS_TO_DISPLAY);
  }, [filteredReleases]);

  const handleClearAllFilters = () => {
    setSelectedRepoNames(new Set());
    setSelectedPackages(new Set());
    setSelectedAuthors(new Set());
    setSelectedChangeTypes(new Set());
    setSelectedMonths(new Set());
  };

  const toggleStringFilter = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  const toggleChangeTypeFilter = (value: ChangeType) => {
    setSelectedChangeTypes(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  useEffect(() => { 
    setCurrentPage(1);
    setTableDataTimestamp(Date.now());
  }, [selectedRepoNames, selectedPackages, selectedAuthors, selectedChangeTypes, selectedMonths]);

  const totalPages = Math.ceil(filteredReleases.length / ITEMS_PER_PAGE);
  const currentTableItems = filteredReleases.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const anyFilterActive = selectedRepoNames.size > 0 || selectedPackages.size > 0 || selectedAuthors.size > 0 || selectedChangeTypes.size > 0 || selectedMonths.size > 0;

  const tickFillColor = theme === 'dark' ? '#94a3b8' : '#475569';
  const gridStrokeColor = theme === 'dark' ? '#334155' : '#e2e8f0';

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>;
  if (error) return <div className="text-red-500 p-8">Error: {error}</div>;

  return (
    <div className={`min-h-screen p-4 md:p-8 selection:text-white ${theme === 'dark' ? 'bg-slate-900 text-slate-100 selection:bg-sky-400' : 'bg-gray-100 text-slate-900 selection:bg-sky-500'}`}>
      <header className="mb-8 flex flex-col md:flex-row justify-between md:items-center">
        <div>
          <h1 className={`text-4xl font-bold ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`}>Release Insights Dashboard</h1>
          <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'} mt-1`}>GitHub 릴리즈 데이터 분석 및 시각화</p>
        </div>
        <div className={`flex items-center rounded-full p-0.5 space-x-0.5 mt-4 md:mt-0 ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-200'}`}>
            <button onClick={() => setTheme('light')} className={`p-1.5 rounded-full ${theme === 'light' ? 'bg-yellow-400 text-slate-800' : 'text-slate-500 hover:bg-gray-300'}`} aria-label="라이트 모드"><SunIcon className="w-5 h-5" /></button>
            <button onClick={() => setTheme('dark')} className={`p-1.5 rounded-full ${theme === 'dark' ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-gray-300'}`} aria-label="다크 모드"><MoonIcon className="w-5 h-5" /></button>
        </div>
      </header>

      <section className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {kpiValues.map(kpi => <KpiCard key={kpi.title} {...kpi} theme={theme} />)}
      </section>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <section className={`p-4 md:p-6 rounded-xl shadow-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'}`}>
            <h2 className={`text-xl font-semibold mb-4 ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`}>릴리즈 안정성</h2>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <PieChart><Tooltip content={<CustomTooltip theme={theme} />} /><Pie data={stabilityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false}>{stabilityData.map(e => <Cell key={e.name} fill={TYPE_COLORS[e.name]} className="cursor-pointer" onClick={() => toggleChangeTypeFilter(e.name)} />)}</Pie><Legend /></PieChart>
            </ResponsiveContainer>
        </section>
        <section className={`p-4 md:p-6 rounded-xl shadow-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'}`}>
            <h2 className={`text-xl font-semibold mb-4 ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`}>월별 릴리즈 빈도</h2>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={releaseFrequencyData} margin={{ top: 5, right: 0, left: -25, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} /><XAxis dataKey="date" tick={{ fill: tickFillColor, fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fill: tickFillColor, fontSize: 12 }} /><Tooltip content={<CustomTooltip theme={theme} />} /><Bar dataKey="count" name="릴리즈 수" fill={TYPE_COLORS.stable} radius={[4, 4, 0, 0]} onClick={(d:any) => toggleStringFilter(setSelectedMonths, d.date)} className="cursor-pointer" /></BarChart>
            </ResponsiveContainer>
        </section>
        <section className={`p-4 md:p-6 rounded-xl shadow-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'}`}>
            <h2 className={`text-xl font-semibold mb-4 ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`}>변경사항 유형별 분석</h2>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={changeTypeCountsData} margin={{ top: 5, right: 0, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} />
                    <XAxis dataKey="name" tick={{ fill: tickFillColor, fontSize: 12, style: { textTransform: 'capitalize' } }} />
                    <YAxis allowDecimals={false} tick={{ fill: tickFillColor, fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip theme={theme} />} />
                    <Bar dataKey="value" name="변경 수" radius={[4, 4, 0, 0]}>
                        {changeTypeCountsData.map((entry) => (
                            <Cell key={entry.name} fill={TYPE_COLORS[entry.name]} className="cursor-pointer" onClick={() => toggleChangeTypeFilter(entry.name)} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </section>
        <section className={`p-4 md:p-6 rounded-xl shadow-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'}`}>
            <h2 className={`text-xl font-semibold mb-4 ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`}>저장소별 평균 작업 소요 시간</h2>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={repoWorkingDaysData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} />
                    <XAxis type="number" tick={{ fill: tickFillColor, fontSize: 12 }} unit="일" />
                    <YAxis dataKey="name" type="category" tick={{ fill: tickFillColor, fontSize: 12, width: 120, textAnchor:'end' }} width={120} interval={0} />
                    <Tooltip content={<CustomTooltip theme={theme} />} />
                    <Bar dataKey="avgWorkingDays" name="평균 소요" unit="일" fill={TYPE_COLORS.minor} onClick={(d:any) => toggleStringFilter(setSelectedRepoNames, d.name)} className="cursor-pointer">
                        <LabelList dataKey="releases" position="right" style={{ fill: tickFillColor, fontSize: 12 }} formatter={(value: number) => `(${value}개)`} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </section>
      </main>

      <div ref={recentReleasesSectionRef} className="mt-8">
        {anyFilterActive && (
            <div className={`mb-6 p-4 rounded-lg border shadow-md ${theme === 'dark' ? 'bg-slate-800/70 border-slate-700' : 'bg-gray-50 border-gray-300/70'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-md font-semibold flex items-center ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`}><FilterIcon className="w-5 h-5 mr-2"/>활성 필터</h3>
                <button onClick={handleClearAllFilters} className={`text-xs font-semibold py-1 px-3 rounded-md border ${theme === 'dark' ? 'bg-red-700/50 text-red-300' : 'bg-red-200 text-red-700'}`}>모든 필터 초기화</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {[...selectedRepoNames].map(v => <span key={v} className="text-xs px-2.5 py-1 rounded-full border bg-cyan-100 text-cyan-800 border-cyan-300">저장소: {v}</span>)}
                {[...selectedPackages].map(v => <span key={v} className="text-xs px-2.5 py-1 rounded-full border bg-lime-100 text-lime-800 border-lime-300">패키지: {v}</span>)}
                {[...selectedAuthors].map(v => <span key={v} className="text-xs px-2.5 py-1 rounded-full border bg-sky-100 text-sky-800 border-sky-300">작성자: {v}</span>)}
                {[...selectedChangeTypes].map(v => <span key={v} className="text-xs px-2.5 py-1 rounded-full border bg-indigo-100 text-indigo-800 border-indigo-300">유형: {v}</span>)}
                {[...selectedMonths].map(v => <span key={v} className="text-xs px-2.5 py-1 rounded-full border bg-teal-100 text-teal-800 border-teal-300">게시월: {v}</span>)}
              </div>
            </div>
          )}

        <h2 className={`text-2xl font-semibold mb-4 ${theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}`}>릴리즈 상세 정보</h2>
        <div className={`overflow-x-auto rounded-xl shadow-lg border ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <table className={`min-w-full divide-y ${theme === 'dark' ? 'divide-slate-700' : 'divide-gray-300'}`}>
            <thead className={`${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-100'}`}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">저장소</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">패키지</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">버전</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">게시일</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">근속일수</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">작성자</th>
              </tr>
            </thead>
            <tbody key={tableDataTimestamp} className={`divide-y ${theme === 'dark' ? 'divide-slate-700' : 'divide-gray-300'}`}>
              {currentTableItems.map(r => (
                <tr key={r.id} className={`${theme === 'dark' ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}>
                  <td className="px-6 py-4"><button onClick={() => toggleStringFilter(setSelectedRepoNames, r.repo_name)}>{r.repo_name}</button></td>
                  <td className="px-6 py-4">{r.package}</td>
                  <td className="px-6 py-4">{r.version}</td>
                  <td className="px-6 py-4">{r.publishedDate?.toLocaleDateString()}</td>
                  <td className="px-6 py-4">{r.working_days}</td>
                  <td className="px-6 py-4"><button onClick={() => toggleStringFilter(setSelectedAuthors, r.author)}>{r.author}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage; 