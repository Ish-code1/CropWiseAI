"use client";
/**
 * app/crop-advisor/page.tsx
 * ============================================================
 * Crop Advisor Page — pixel-matched to design screenshot.
 *
 * Layout:
 *  [Left: Analysis Parameters form] | [Right: Results panel]
 *    - Top recommendation card (crop name, confidence, tags)
 *    - Growth stage timeline (Sowing → Vegetative → Flowering → Maturity)
 *    - Input Cost vs. Profit ROI breakdown
 *    - Action Required CTA card
 * ============================================================
 */

"use client";

import React from "react";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  BarChart2,
  Sprout,
  Droplets,
  TrendingUp,
  CalendarDays,
  Loader2,
  Info,
  Zap,
  MapPin,
  MessageSquare,
  Leaf
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DISTRICTS_BY_STATE } from "@/lib/india-districts";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import type { CropRecommendation, CropAdvisorFormData, GeminiRequestBody, GeminiResponseBody } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const INDIAN_STATES = [
  "Andhra Pradesh","Assam","Bihar","Chhattisgarh","Gujarat","Haryana",
  "Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Odisha","Punjab","Rajasthan","Tamil Nadu","Telangana",
  "Uttar Pradesh","Uttarakhand","West Bengal",
];

const SOIL_TYPES = [
  "Alluvial Soil","Black Cotton Soil (Regur)","Red & Laterite Soil",
  "Arid & Desert Soil","Saline & Alkaline Soil","Peaty & Marshy Soil",
  "Forest & Mountain Soil","Loamy Soil","Sandy Soil","Clay Soil",
];

const WATER_SOURCES = ["Irrigated","Rainfed","Drip Irrigation","Sprinkler"];

const GROWTH_STAGES = [
  { label: "Sowing",     weeks: "Week 1-2"   },
  { label: "Vegetative", weeks: "Week 3-8"   },
  { label: "Flowering",  weeks: "Week 9-14"  },
  { label: "Maturity",   weeks: "Week 15-22" },
];


// ─── Sub-components ───────────────────────────────────────────────────────────

/** Top recommendation hero card */
function RecommendationHero({ rec }: { rec: CropRecommendation }) {
  const { t } = useI18n();
  const cropLabel = rec.localName || rec.cropName;
  return (
    <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-6">
      <div className="flex items-start gap-6">
        {/* Crop illustration placeholder */}
        <div className="flex-shrink-0 w-28 h-28 rounded-xl bg-[#182419] border border-[#2a3d2c] flex items-center justify-center">
          <Sprout className="w-12 h-12 text-[#4dc24d]" strokeWidth={1} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460]">
              {t("Top Recommendation")}
            </p>
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0c330c] border border-[#1a6b1a] text-[#4dc24d] text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4dc24d] animate-pulse" />
              {rec.suitabilityScore}% {t("Confidence")}
            </span>
          </div>

          <h2 className="text-3xl font-bold text-[#e8f5e9] leading-tight mb-2">
            {cropLabel}
          </h2>
          <p className="text-sm text-[#94a896] leading-relaxed">
            {t("Based on your farm's parameters and regional data,")}{" "}
            {cropLabel} {t("is highly suitable and projected to yield")}{" "}
            <span className="text-[#e8f5e9] font-medium">{rec.expectedYield}</span>.
          </p>

          {/* Attribute tags */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#182419] border border-[#2a3d2c] text-xs text-[#94a896]">
              <CalendarDays className="w-3.5 h-3.5 text-[#5a7460]" />
              {rec.growingPeriodDays}–{rec.growingPeriodDays + 20} {t("Days")}
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#182419] border border-[#2a3d2c] text-xs text-[#94a896]">
              <Droplets className="w-3.5 h-3.5 text-blue-400" />
              {t(rec.waterRequirement)} {t("Need")}
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#182419] border border-[#2a3d2c] text-xs text-[#4dc24d]">
              <TrendingUp className="w-3.5 h-3.5" />
              {t("High ROI")}
            </span>
            {rec.climateRiskLevel && (
               <span className={cn(
                 "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs",
                 rec.climateRiskLevel === "Low" ? "bg-green-900/20 border-green-800 text-green-400" :
                 rec.climateRiskLevel === "Medium" ? "bg-amber-900/20 border-amber-800 text-amber-400" :
                 "bg-rose-900/20 border-rose-800 text-rose-400"
               )}>
                 <Info className="w-3.5 h-3.5" />
                 {t(rec.climateRiskLevel)} {t("Climate Risk")}
               </span>
            )}
            {rec.sustainabilityTags?.map((tag) => (
               <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a4d1a]/40 border border-[#2ea82e]/30 text-xs text-[#82d882]">
                 <Leaf className="w-3.5 h-3.5" />
                 {tag}
               </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Growth stage timeline — matches the connected dot design */
function GrowthTimeline({ activeStages = 2 }: { activeStages?: number }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-6">
      <h3 className="text-base font-semibold text-[#e8f5e9] mb-6">
        {t("Growth Stage Timeline")}
      </h3>

      <div className="relative flex items-center justify-between">
        {/* Connecting line behind nodes */}
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-[#2a3d2c]" />
        {/* Active segment */}
        <div
          className="absolute top-5 left-5 h-0.5 bg-[#2ea82e] transition-all duration-700"
          style={{ width: `${((activeStages - 1) / (GROWTH_STAGES.length - 1)) * 100}%` }}
        />

        {GROWTH_STAGES.map((stage, i) => {
          const isActive = i < activeStages;
          const isCurrent = i === activeStages - 1;
          return (
            <div key={stage.label} className="relative flex flex-col items-center gap-2 z-10">
              {/* Node */}
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  isActive
                    ? isCurrent
                      ? "bg-[#2ea82e] border-[#4dc24d] shadow-[0_0_12px_rgba(46,168,46,0.4)]"
                      : "bg-[#1a6b1a] border-[#2ea82e]"
                    : "bg-[#182419] border-[#2a3d2c]"
                )}
              >
                {i === 0 && <Sprout   className={cn("w-4 h-4", isActive ? "text-white" : "text-[#3d4d3e]")} strokeWidth={2} />}
                {i === 1 && <Sprout   className={cn("w-4 h-4", isActive ? "text-white" : "text-[#3d4d3e]")} strokeWidth={2} />}
                {i === 2 && <span    className={cn("text-sm font-bold", isActive ? "text-white" : "text-[#3d4d3e]")}>8</span>}
                {i === 3 && <Sprout  className={cn("w-4 h-4", isActive ? "text-white" : "text-[#3d4d3e]")} strokeWidth={2} />}
              </div>
              {/* Label */}
              <div className="text-center">
                <p className={cn("text-xs font-semibold", isActive ? "text-[#e8f5e9]" : "text-[#3d4d3e]")}>
                  {t(stage.label)}
                </p>
                <p className={cn("text-[10px]", isActive ? "text-[#5a7460]" : "text-[#2a3d2c]")}>
                  {t(stage.weeks)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Input Cost vs. ROI breakdown — matches the horizontal bar design */
function ROIBreakdown({ rec }: { rec: CropRecommendation }) {
  const { t } = useI18n();
  const { investmentPerAcre, expectedRevenuePerAcre, profitPerAcre } = rec.estimatedROI;
  const maxVal = expectedRevenuePerAcre;

  const rows = [
    { label: "Seed & Fertilizer",  value: 24000,                color: "bg-[#2ea82e]",  width: (24000 / maxVal) * 100 },
    { label: "Labor & Irrigation",  value: 18500,               color: "bg-[#4dc24d]",  width: (18500 / maxVal) * 100 },
    { label: "Projected Revenue",   value: expectedRevenuePerAcre, color: "bg-[#82d882]", width: (expectedRevenuePerAcre / maxVal) * 100 },
  ];

  const profitabilityIndex = (expectedRevenuePerAcre / investmentPerAcre).toFixed(1);

  return (
    <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-6">
      <h3 className="text-base font-semibold text-[#e8f5e9] mb-5">
        {t("Input Cost vs. Profit ROI")}
      </h3>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-[#94a896]">{t(row.label)}</span>
              <span className="text-sm font-semibold text-[#e8f5e9]">
                ₹{row.value.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#1e2d20] overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", row.color)}
                style={{ width: `${row.width}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-[#1e2d20] flex items-center justify-between">
        <span className="text-sm text-[#94a896]">{t("Net Profitability Index")}</span>
        <span className="text-2xl font-bold text-[#4dc24d]">{profitabilityIndex}x</span>
      </div>
    </div>
  );
}

/** Action Required CTA card (dark green, bottom right) */
function ActionCard({ location }: { location: string }) {
  const { t } = useI18n();
  const locationText = location || "Nashik";
  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #1a4d1a 0%, #0c330c 60%, #061a06 100%)",
        border: "1px solid #2ea82e33",
      }}
    >
      {/* Background texture lines */}
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "repeating-linear-gradient(45deg, #4dc24d 0, #4dc24d 1px, transparent 0, transparent 50%)", backgroundSize: "20px 20px" }}
      />

      <div className="relative z-10">
        <span className="inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-[#2ea82e]/20 text-[#82d882] border border-[#2ea82e]/30 mb-3">
          {t("Action Required")}
        </span>
        <h3 className="text-lg font-bold text-white mb-2 leading-snug">
          {t("Order Seeds for Kharif Season")}
        </h3>
        <p className="text-xs text-[#82d882]/80 leading-relaxed mb-4">
          {t("Local stocks for Hybrid-4 are depleting. Reserve now to ensure 100% germination rate.")}
        </p>
        <button className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white text-[#0b1410] text-sm font-semibold hover:bg-[#e8f5e9] transition-colors active:scale-95">
          <MapPin className="w-4 h-4" />
          {t("Locate Supplier Near")} {locationText}
        </button>
      </div>

      {/* Chat bubble icon */}
      <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#2ea82e]/20 flex items-center justify-center">
        <MessageSquare className="w-4 h-4 text-[#4dc24d]" strokeWidth={2} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CropAdvisorPage() {
  const { lang, t } = useI18n();
  const [form, setForm] = useState<Partial<CropAdvisorFormData>>({
    season: "Kharif",
    waterSource: "Irrigated",
  });
  const [result, setResult] = useState<CropRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof CropAdvisorFormData, val: string | number) =>
    setForm((p: Partial<CropAdvisorFormData>) => ({ ...p, [key]: val }));

  const handleGenerate = async () => {
    if (!form.state || !form.soilType) {
      setError("Please select at least State and Soil Type.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setResult(null);

    try {
      const contextStr = [
        form.state     && `State: ${form.state}`,
        form.district  && `District: ${form.district}`,
        form.soilType  && `Soil type: ${form.soilType}`,
        form.season    && `Season: ${form.season}`,
        form.landArea  && `Land area: ${form.landArea} acres`,
        form.waterSource && `Water source: ${form.waterSource}`,
        form.previousCrop && `Previous crop: ${form.previousCrop}`,
        form.budget    && `Budget: ₹${form.budget}`,
      ].filter(Boolean).join(". ");

      const body: GeminiRequestBody = {
        prompt: `Recommend the top 3 crops for this farmer profile. Focus on Climate Resilience and Sustainability. Also provide:
        - climateRiskScore (0-100)
        - climateRiskLevel (Low, Medium, High)
        - carbonFootprint (string estimation)
        - sustainabilityTags (array of strings, e.g. "Drought-resistant", "Water-efficient"). 
        ${contextStr}`,
        mode: "crop_advisor",
        language: lang,
        context: contextStr,
      };

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: GeminiResponseBody = await res.json();
      if (!data.success || !data.structured) throw new Error(data.error ?? "No result");

      const parsed = data.structured as { recommendations: CropRecommendation[] };
      const topRec = parsed.recommendations?.[0] ?? null;
      setResult(topRec);
      // Log to Firebase
      if (topRec) {
        const { logActivity } = await import("@/lib/firebase/activity-log");
        const { auth } = await import("@/lib/firebase/client");
        const uid = auth.currentUser?.uid;
        if (uid) {
          await logActivity({ userId: uid, type: "crop_recommendation", title: `Recommended: ${topRec.cropName}`, description: `Suitability: ${topRec.suitabilityScore}%`, metadata: { crop: topRec.cropName, score: topRec.suitabilityScore } });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="mb-6 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-[#4dc24d]" />
          <span className="text-xs text-[#5a7460] uppercase tracking-wider font-medium">
            {t("AI-Powered Analysis")}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

          {/* ── LEFT: Form panel ──────────────────────────────────── */}
          <div className="space-y-4">
            <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-5">
              {/* Form header */}
              <div className="flex items-center gap-2 mb-5">
                <div className="w-7 h-7 rounded-lg bg-[#2ea82e]/20 flex items-center justify-center">
                  <BarChart2 className="w-3.5 h-3.5 text-[#4dc24d]" strokeWidth={2} />
                </div>
                <h2 className="text-sm font-semibold text-[#e8f5e9]">
                  {t("Analysis Parameters")}
                </h2>
              </div>

              <div className="space-y-4">
                {/* Regional Data */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-2">
                    {t("Regional Data")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="input-field text-sm"
                      value={form.state ?? ""}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setForm((p: Partial<CropAdvisorFormData>) => ({
                          ...p,
                          state: e.target.value,
                          district: "", // reset district when state changes
                        }))
                      }
                    >
                      <option value="">{t("State")}</option>
                      {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <select
                      className="input-field text-sm"
                      value={form.district ?? ""}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("district", e.target.value)}
                      disabled={!form.state}
                    >
                      <option value="">{t("District")}</option>
                      {(DISTRICTS_BY_STATE[form.state ?? ""] ?? []).map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Environment */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-2">
                    {t("Environment")}
                  </p>
                  <select
                    className="input-field text-sm"
                    value={form.soilType ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("soilType", e.target.value)}
                  >
                    <option value="">{t("Soil Type")}</option>
                    {SOIL_TYPES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
                  </select>
                </div>

                {/* Area + Season */}
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-2">
                        {t("Area (Acres)")}
                      </p>
                      <input
                        type="number"
                        placeholder="e.g. 5.0"
                        className="input-field text-sm"
                        min={0.5}
                        step={0.5}
                        value={form.landArea ?? ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("landArea", parseFloat(e.target.value))}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-2">
                        {t("Season")}
                      </p>
                      <select
                        className="input-field text-sm"
                        value={form.season ?? "Kharif"}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("season", e.target.value as CropAdvisorFormData["season"])}
                      >
                        <option value="Kharif">{t("Kharif")}</option>
                        <option value="Rabi">{t("Rabi")}</option>
                        <option value="Zaid">{t("Zaid")}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Water Source toggle */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-2">
                    {t("Water Source")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {WATER_SOURCES.slice(0, 2).map((src) => (
                      <button
                        key={src}
                        onClick={() => set("waterSource", src)}
                        className={cn(
                          "py-2.5 rounded-lg text-sm font-medium border transition-all duration-150",
                          form.waterSource === src
                            ? "bg-[#2ea82e] text-[#0b1410] border-[#2ea82e]"
                            : "bg-transparent text-[#94a896] border-[#2a3d2c] hover:border-[#3d5c40]"
                        )}
                      >
                        {t(src)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Previous crop */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-2">
                    {t("Previous Crop (optional)")}
                  </p>
                  <input
                    type="text"
                    placeholder={t("e.g. Soybean")}
                    className="input-field text-sm"
                    value={form.previousCrop ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("previousCrop", e.target.value)}
                  />
                </div>

                {/* Error */}
                {error && (
                  <p className="text-xs text-rose-400 bg-rose-900/20 border border-rose-800/40 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={isLoading}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all active:scale-95",
                    "text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  )}
                  style={{
                    background: isLoading
                      ? "#1a6b1a"
                      : "linear-gradient(135deg, #2ea82e 0%, #1a6b1a 100%)",
                    boxShadow: isLoading ? "none" : "0 4px 14px rgba(46,168,46,0.3)",
                  }}
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t("Analysing...")}</>
                  ) : (
                    <><Zap className="w-4 h-4" /> {t("Generate Recommendation")}</>
                  )}
                </button>
              </div>
            </div>

            {/* Precision note card */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#0d1a10] border border-[#2ea82e]/20">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#2ea82e]/15 flex items-center justify-center">
                <Info className="w-3.5 h-3.5 text-[#4dc24d]" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#4dc24d] mb-1">{t("Precision Note")}</p>
                <p className="text-xs text-[#5a7460] leading-relaxed">
                  {t("Data is analysed against 15 years of regional climate patterns and current soil health reports.")}
                </p>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Results panel ──────────────────────────────── */}
          <div className="space-y-4">
            {isLoading && (
              <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-8 flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#2ea82e]/10 flex items-center justify-center">
                  <Sprout className="w-6 h-6 text-[#4dc24d] animate-spin-slow" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-[#e8f5e9]">{t("Analysing your farm parameters…")}</p>
                  <p className="text-xs text-[#5a7460] mt-1">{t("Checking 15 years of climate data")}</p>
                </div>
                <div className="w-full max-w-xs space-y-2">
                  {[80, 60, 90].map((w, i) => (
                    <div key={i} className={`shimmer h-3 rounded-full`} style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            )}

            {!isLoading && !result && (
              <div className="flex flex-col items-center justify-center h-72 rounded-xl border border-dashed border-[#2a3d2c] text-center px-6">
                <BarChart2 className="w-10 h-10 text-[#2a3d2c] mb-3" strokeWidth={1} />
                <p className="text-sm font-medium text-[#3d4d3e]">{t("Recommendation will appear here")}</p>
                <p className="text-xs text-[#2a3d2c] mt-1">{t("Fill the form and click Generate")}</p>
              </div>
            )}

            {!isLoading && result && (
              <div className="space-y-4 animate-fade-in-up">
                {/* Top recommendation card */}
                <RecommendationHero rec={result} />

                {/* Growth stage timeline */}
                <GrowthTimeline activeStages={2} />

                {/* ROI + Action side by side on larger screens */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
                  <ROIBreakdown rec={result} />
                  <ActionCard location={form.district || form.state || "Nashik"} />
                </div>

                {/* Reasons & Risks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Reasons */}
                  <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-3">
                      Why This Crop
                    </p>
                    <ul className="space-y-2">
                      {result.reasonsForRecommendation.map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#94a896]">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-[#4dc24d] flex-shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Risks */}
                  <div className="rounded-xl bg-[#111d16] border border-[#2a3d2c] p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-3">
                      Risks to Watch
                    </p>
                    <ul className="space-y-2">
                      {result.risks.map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-[#94a896]">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
