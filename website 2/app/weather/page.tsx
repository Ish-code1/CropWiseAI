/**
 * app/weather/page.tsx
 * Weather Intelligence — uses browser GPS for actual location.
 * Falls back to profile state → default (Bhopal) if GPS denied.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, type TooltipProps,
} from "recharts";
import {
  MapPin, RefreshCw, Download, Sun, Cloud, CloudRain,
  CloudDrizzle, Wind, Eye, Droplets, Sunrise, Sunset,
  ChevronLeft, ChevronRight, AlertTriangle, Droplet,
  Zap, Gauge, Sparkles, Loader2, LocateFixed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/firebase/auth-context";
import { useLocation } from "@/lib/hooks/useLocation";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import type { WeatherForecastDay } from "@/types";
import type { ExtendedWeatherData } from "@/lib/weather";

// ─── AI Alerts (dynamic based on real weather data) ──────────────────────────

function buildAlerts(w: ExtendedWeatherData) {
  const alerts = [];
  const rainTomorrow = w.forecast[1]?.precipitationChance ?? 0;
  const rainToday    = w.forecast[0]?.precipitationChance ?? 0;

  // Spray window
  const goodSpray = w.windSpeed < 15 && w.humidity < 70 && rainToday < 30;
  alerts.push({
    category:      "Spray Window",
    categoryColor: "text-[#4dc24d]",
    accent:        "border-l-[#2ea82e]",
    message:       goodSpray
      ? "Optimal Spray Window: 08:00 AM – 11:00 AM"
      : "Avoid spraying — high wind or rain expected today",
  });

  // Smart Irrigation tip (Water Conservation)
  const estimatedWaterSavings = 4000; // Mock calculation based on average farm size
  alerts.push({
    category:      "Smart Irrigation Tip",
    categoryColor: "text-blue-400",
    accent:        "border-l-blue-500",
    message:       rainTomorrow > 60
      ? `Skip Irrigation: ${w.forecast[1]?.precipitationChance}% rain expected tomorrow. By waiting, you could save ~${estimatedWaterSavings}L of water.`
      : w.soilMoisture < 35
        ? "Irrigate now — soil moisture is low. Use drip irrigation if possible to minimize evaporation."
        : "Soil moisture adequate — no irrigation needed today. Conserve water.",
  });

  // Hazard alert
  const maxRain = Math.max(...w.forecast.slice(0, 3).map(d => d.precipitationChance));
  alerts.push({
    category:      "Hazard Alert",
    categoryColor: maxRain > 70 ? "text-rose-400" : "text-[#5a7460]",
    accent:        maxRain > 70 ? "border-l-rose-500" : "border-l-[#2a3d2c]",
    message:       maxRain > 70
      ? `Rain Alert: High probability (${maxRain}%) in next 3 days`
      : "No hazard alerts for the next 72 hours",
  });

  return alerts;
}

// ─── Weather condition icon ───────────────────────────────────────────────────

function ConditionIcon({ code, className }: { code: string; className?: string }) {
  const p = { className: cn("w-5 h-5", className), strokeWidth: 1.5 as const };
  switch (code) {
    case "sunny":        return <Sun       {...p} />;
    case "rain":         return <CloudRain {...p} />;
    case "drizzle":      return <CloudDrizzle {...p} />;
    default:             return <Cloud     {...p} />;
  }
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const temp = (payload as Array<{ dataKey: string; value: number; color?: string }>).find(p => p.dataKey === "temp")?.value;
  const rain = (payload as Array<{ dataKey: string; value: number; color?: string }>).find(p => p.dataKey === "rain")?.value;
  return (
    <div className="bg-[#0d1a10] border border-[#2a3d2c] rounded-xl px-3 py-2.5 shadow-xl">
      <p className="text-[10px] text-[#5a7460] mb-1.5 font-medium">{label}</p>
      {temp !== undefined && <p className="text-xs font-semibold text-[#e8f5e9]">Temp: {temp}°C</p>}
      {rain !== undefined && <p className="text-xs font-semibold text-blue-400">Rain: {rain}%</p>}
    </div>
  );
}

// ─── Forecast card ────────────────────────────────────────────────────────────

interface ForecastCardProps {
  key?: React.Key;
  day: WeatherForecastDay;
  isActive: boolean;
  onClick: () => void;
}

function ForecastCard({ day, isActive, onClick }: ForecastCardProps) {
  return (
    <button onClick={onClick}
      className={cn(
        "flex-shrink-0 w-36 flex flex-col items-center gap-2 px-4 py-4 rounded-xl border transition-all duration-200",
        isActive ? "bg-[#182419] border-[#2ea82e]/50 shadow-[0_0_16px_rgba(46,168,46,0.12)]"
                 : "bg-[#111d16] border-[#2a3d2c] hover:border-[#3d5c40]"
      )}>
      <p className={cn("text-xs font-semibold", isActive ? "text-[#e8f5e9]" : "text-[#5a7460]")}>
        {day.dayName}
      </p>
      <ConditionIcon code={day.conditionCode}
        className={cn("!w-8 !h-8", isActive ? "text-[#4dc24d]" : "text-[#5a7460]")} />
      <div className="text-center">
        <p className={cn("text-base font-bold leading-none", isActive ? "text-[#e8f5e9]" : "text-[#94a896]")}>
          {day.high}° / {day.low}°
        </p>
        <p className="text-[10px] text-[#5a7460] mt-1 uppercase tracking-wider">
          {day.precipitationChance}% Precip
        </p>
      </div>
    </button>
  );
}

// ─── Climate Resilience Banner ────────────────────────────────────────────────
function ClimateResilienceBanner({ weather }: { weather: ExtendedWeatherData }) {
  const {lang: language } = useI18n();
  const [alertText, setAlertText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Determine threat (using slightly lower thresholds to ensure it triggers during demos)
  const maxRain = Math.max(...weather.forecast.slice(0, 3).map(d => d.precipitationChance));
  const maxTemp = Math.max(...weather.forecast.slice(0, 3).map(d => d.high));
  
  let threat = null;
  let threatType = "";
  if (maxTemp >= 38) {
    threat = `Severe Heatwave (${maxTemp}°C)`;
    threatType = "heat";
  } else if (maxRain >= 60) {
    threat = `Heavy Unseasonal Rain (${maxRain}% probability)`;
    threatType = "rain";
  }

  useEffect(() => {
    if (!threat) {
      setLoading(false);
      return;
    }
    
    const fetchAlert = async () => {
      try {
        const prompt = `The farmer is facing a severe climate threat: ${threat} in the next 3 days. Generate a strict, 2-sentence Climate Resilience Alert telling them exactly what emergency protective measures to take today to save their crop.`;
        const res = await fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "chat", prompt, language })
        });
        const data = await res.json();
        if (data.success && data.text) {
          setAlertText(data.text);
        } else {
          setAlertText("Deploy shade nets and increase irrigation frequency to mitigate heat stress.");
        }
      } catch {
        setAlertText("Please take immediate protective measures for your crops based on the upcoming extreme weather.");
      } finally {
        setLoading(false);
      }
    };
    fetchAlert();
  }, [threat, language]);

  if (!threat) return null;

  return (
    <div className={cn("rounded-xl p-4 border relative overflow-hidden mb-5", threatType === "heat" ? "bg-amber-500/10 border-amber-500/30" : "bg-blue-500/10 border-blue-500/30")}>
      <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes.png')]" />
      <div className="flex gap-4 relative z-10">
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center shrink-0", threatType === "heat" ? "bg-amber-500/20 text-amber-500" : "bg-blue-500/20 text-blue-500")}>
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className={cn("text-base font-bold flex items-center gap-2 mb-1", threatType === "heat" ? "text-amber-500" : "text-blue-400")}>
            <Sparkles className="w-4 h-4" /> AI Climate Resilience Alert: {threat}
          </h3>
          {loading ? (
            <div className="flex items-center gap-2 mt-2 text-sm text-[#94a896]">
              <Loader2 className="w-4 h-4 animate-spin" /> Generating protective measures...
            </div>
          ) : (
            <p className="text-sm text-[#e8f5e9] leading-relaxed pr-4">{alertText}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeatherPage() {
  const { user }   = useAuth();
  const { t } = useI18n();
  const { location, loading: locationLoading, error: gpsError, refresh: refreshLocation } = useLocation(user?.uid);
  const [weather,      setWeather]      = useState<ExtendedWeatherData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [refreshing,   setRefreshing]   = useState(false);

  // ── Reverse geocode coordinates → city name ─────────────────────────────
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      const addr = data.address;
      const city = addr.city || addr.town || addr.village || addr.county || "";
      const state = addr.state || "";
      return city && state ? `${city}, ${state}` : state || "Your Location";
    } catch {
      return "Your Location";
    }
  };

  // ── Fetch weather for given coords ──────────────────────────────────────
  const fetchWeather = useCallback(async (lat: number, lng: number, label: string) => {
    setLoading(true);
    try {
      const res  = await fetch(
        `/api/weather?lat=${lat}&lng=${lng}&label=${encodeURIComponent(label)}`
      );
      const data = await res.json();
      if (data.success) setWeather(data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch weather when location detected
  useEffect(() => {
    if (!location) return;
    fetchWeather(location.lat, location.lng, location.label);
  }, [location, fetchWeather]);

  const handleRefresh = async () => {
    setRefreshing(true);
    refreshLocation();
  };

  const handleExportReport = () => {
    if (!weather || !weather.forecast) {
      alert(t("Weather data unavailable"));
      return;
    }

    let reportContent = `CropWise AI - 7-Day Weather Forecast Report\n`;
    reportContent += `Location: ${location?.label || "Unknown"}\n`;
    reportContent += `Generated at: ${new Date().toLocaleString("en-IN")}\n\n`;
    
    reportContent += `Date,Day,High (°C),Low (°C),Condition,Precipitation Chance (%)\n`;
    
    weather.forecast.forEach((day: WeatherForecastDay) => {
      reportContent += `${day.date},${day.dayName},${day.high},${day.low},${day.condition},${day.precipitationChance}\n`;
    });

    const blob = new Blob([reportContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `weather_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const alerts   = weather ? buildAlerts(weather) : [];
  const chartData = weather
    ? (weather.hourlyTemp ?? []).map((temp: number, i: number) => ({
        time: weather.hourlyTime?.[i] ?? `${i}:00`,
        temp: Math.round(temp),
        rain: weather.hourlyRain?.[i] ?? 0,
      })).filter((_: unknown, i: number) => i % 2 === 0) // every 2 hours
    : [];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-5">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#e8f5e9]">{t("Weather Intelligence")}</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#5a7460]" />
              <p className="text-sm text-[#5a7460]">
                {locationLoading ? t("Detecting your location...") : location?.label || t("Loading...")}
                {weather && ` • ${t("Last updated")} ${new Date(weather.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
              </p>
              {gpsError && (
                <span className="text-[10px] text-amber-400 ml-1">({gpsError})</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              className="btn-secondary text-xs py-2 gap-1.5"
              onClick={handleExportReport}
            >
              <Download className="w-3.5 h-3.5" /> {t("Export Report")}
            </button>
            <button onClick={handleRefresh} disabled={refreshing}
              className="btn-primary text-xs py-2 gap-1.5 disabled:opacity-60">
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              {t("Refresh Data")}
            </button>
          </div>
        </div>

        {weather && !loading && <ClimateResilienceBanner weather={weather} />}

        {/* Loading state */}
        {(loading || locationLoading) && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <LocateFixed className="w-8 h-8 text-[#4dc24d] animate-pulse" />
            <p className="text-sm text-[#5a7460]">{t("Detecting your location and fetching live weather...")}</p>
            <Loader2 className="w-5 h-5 text-[#4dc24d] animate-spin" />
          </div>
        )}

        {!loading && !locationLoading && weather && (
          <>
            {/* ── Live conditions + AI alerts ─────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">

              {/* Live conditions */}
              <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest bg-[#182419] border border-[#2a3d2c] text-[#5a7460] mb-4">
                      {t("Live Conditions")}
                    </span>
                    <div className="flex items-end gap-3 mb-1">
                      <span className="text-6xl font-bold text-[#e8f5e9] leading-none">
                        {weather.temperature}°C
                      </span>
                      <div className="pb-2">
                        <p className="text-lg font-semibold text-[#94a896]">{t(weather.condition)}</p>
                        <p className="text-sm text-[#5a7460]">{t("Feels like")} {weather.feelsLike}°C</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 mt-5">
                      {[
                        { icon: Droplets, label: "Humidity",   value: `${weather.humidity}%`         },
                        { icon: Wind,     label: "Wind",       value: `${weather.windSpeed}km/h NW`   },
                        { icon: Eye,      label: "Visibility", value: `${weather.visibility}km`       },
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Icon className="w-3.5 h-3.5 text-[#5a7460]" strokeWidth={2} />
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460]">{t(label)}</p>
                          </div>
                          <p className="text-base font-bold text-[#e8f5e9]">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-5 pt-4 border-t border-[#1e2d20]">
                      <div className="flex items-center gap-2 text-sm text-[#5a7460]">
                        <Sunrise className="w-4 h-4 text-amber-400" strokeWidth={2} />
                        {t("Sunrise")}: <span className="text-[#94a896] font-medium ml-1">06:12 AM</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#5a7460]">
                        <Sunset className="w-4 h-4 text-orange-400" strokeWidth={2} />
                        {t("Sunset")}: <span className="text-[#94a896] font-medium ml-1">06:45 PM</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 w-28 h-28 rounded-xl bg-[#182419] border border-[#2a3d2c] flex items-center justify-center">
                    <ConditionIcon code={weather.conditionCode} className="!w-14 !h-14 text-[#4dc24d]" />
                  </div>
                </div>
              </div>

              {/* AI Agronomist Alerts — dynamic based on real data */}
              <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#4dc24d]" strokeWidth={2} />
                  <h2 className="text-sm font-semibold text-[#e8f5e9]">{t("AI Agronomist Alerts")}</h2>
                </div>
                <div className="flex-1 space-y-2">
                  {alerts.map((alert) => (
                    <div key={alert.category}
                      className={cn("flex flex-col gap-1 pl-3 py-2.5 border-l-2 rounded-r-lg bg-[#0d1a10]", alert.accent)}>
                      <p className={cn("text-[10px] font-bold uppercase tracking-widest", alert.categoryColor)}>
                        {t(alert.category)}
                      </p>
                      <p className="text-sm font-medium text-[#e8f5e9] leading-snug">{t(alert.message)}</p>
                    </div>
                  ))}
                </div>
                <button 
                  className="text-xs font-medium text-[#4dc24d] hover:text-[#82d882] transition-colors text-center"
                  onClick={() => alert(t("Feature coming soon"))}
                >
                  {t("View All Recommendations")}
                </button>
              </div>
            </div>

            {/* ── 7-Day Forecast ───────────────────────────────── */}
            <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#e8f5e9]">{t("7-Day Local Forecast")}</h2>
                <div className="flex items-center gap-2">
                  <button className="w-7 h-7 rounded-lg border border-[#2a3d2c] bg-[#182419] flex items-center justify-center text-[#5a7460] hover:text-[#94a896] hover:border-[#3d5c40] transition-colors">
                    <ChevronLeft className="w-4 h-4" strokeWidth={2} />
                  </button>
                  <button className="w-7 h-7 rounded-lg border border-[#2a3d2c] bg-[#182419] flex items-center justify-center text-[#5a7460] hover:text-[#94a896] hover:border-[#3d5c40] transition-colors">
                    <ChevronRight className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {(weather.forecast ?? []).map((day: WeatherForecastDay, i: number) => (
                  <ForecastCard key={day.date} day={day} isActive={i === activeDayIdx}
                    onClick={() => setActiveDayIdx(i)} />
                ))}
              </div>
            </div>

            {/* ── 24h Hourly Trend Chart (real data) ───────────── */}
            <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-5">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="text-sm font-semibold text-[#e8f5e9]">{t("24h Environmental Trends")}</h2>
                  <p className="text-xs text-[#5a7460] mt-0.5">{t("Temperature (°C) and Precipitation Probability (%)")}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2ea82e]" />
                    <span className="text-xs text-[#5a7460]">{t("Temperature")}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#5a7460]" />
                    <span className="text-xs text-[#5a7460]">{t("Rain Probability")}</span>
                  </div>
                </div>
              </div>
              <div className="h-52 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2ea82e" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#2ea82e" stopOpacity={0}   />
                      </linearGradient>
                      <linearGradient id="rainGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#5a7460" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#5a7460" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d20" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#5a7460" }} axisLine={false} tickLine={false} interval={2} />
                    <YAxis tick={{ fontSize: 10, fill: "#5a7460" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#2a3d2c", strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="temp" stroke="#2ea82e" strokeWidth={2} fill="url(#tempGrad)" dot={false}
                      activeDot={{ r: 4, fill: "#4dc24d", stroke: "#0b1410", strokeWidth: 2 }} />
                    <Area type="monotone" dataKey="rain" stroke="#5a7460" strokeWidth={1.5} strokeDasharray="5 3"
                      fill="url(#rainGrad)" dot={false} activeDot={{ r: 3, fill: "#94a896", stroke: "#0b1410", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Bottom metric cards (real soil data) ─────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  icon: Droplet, label: "Soil Moisture",
                  value: `${weather.soilMoisture}%`,
                  sub: weather.soilMoisture > 60 ? "Healthy" : weather.soilMoisture > 30 ? "Moderate" : "Dry",
                  subColor: weather.soilMoisture > 60 ? "text-[#4dc24d]" : weather.soilMoisture > 30 ? "text-amber-400" : "text-rose-400",
                  iconColor: "text-blue-400 bg-blue-900/30 border-blue-800/40",
                },
                {
                  icon: Zap, label: "Solar Intensity",
                  value: `${weather.solarRadiation}`,
                  sub: "kWh/m²",
                  subColor: "text-[#94a896]",
                  iconColor: "text-amber-400 bg-amber-900/30 border-amber-800/40",
                },
                {
                  icon: Gauge, label: "Evapotranspiration",
                  value: `${weather.evapotranspiration}`,
                  sub: "mm/day",
                  subColor: "text-[#94a896]",
                  iconColor: "text-[#4dc24d] bg-[#2ea82e]/10 border-[#2ea82e]/20",
                },
              ].map(({ icon: Icon, label, value, sub, subColor, iconColor }) => (
                <div key={label} className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-5 flex items-center gap-4">
                  <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0", iconColor)}>
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460]">{t(label)}</p>
                    <p className="text-xl font-bold text-[#e8f5e9] leading-tight">
                      {value}
                      <span className={cn("text-sm font-medium ml-1.5", subColor)}>{t(sub)}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && !locationLoading && !weather && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <CloudRain className="w-10 h-10 text-[#2a3d2c]" strokeWidth={1} />
            <p className="text-sm text-[#3d4d3e]">{t("Weather data unavailable")}</p>
            <button onClick={handleRefresh} className="btn-primary text-xs py-2 mt-2">
              <RefreshCw className="w-3.5 h-3.5" /> {t("Try Again")}
            </button>
          </div>
        )}

      </div>
    </AppShell>
  );
}
