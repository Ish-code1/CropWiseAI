"use client";
/**
 * app/pest-diagnosis/page.tsx — v2
 * Rebuilt to match design Image 4 exactly.
 *
 * All TypeScript errors fixed:
 *  - React explicitly imported (fixes TS2503 React namespace errors)
 *  - data.structured cast via `as unknown as PestDiagnosisResult` (fixes TS2352)
 *  - All onChange/onClick/onDrag handlers fully typed with React.ChangeEvent<T>
 *  - TreatmentStep key uses React.Fragment wrapper (avoids TS2322 key prop error)
 *  - err caught as `unknown` and narrowed with instanceof
 */

"use client";

import React, { useState, useRef, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Upload, ScanSearch, X, Loader2, AlertCircle,
  Info, FileText, Download, BarChart2, ShoppingCart,
  AlertTriangle,
} from "lucide-react";
import { cn, fileToBase64, getImageMimeType } from "@/lib/utils";
import type { PestDiagnosisResult, GeminiRequestBody, GeminiResponseBody } from "@/types";
import { useI18n } from "@/lib/i18n/LanguageProvider";

// ─── Pre-loaded mock result (matches design screenshot) ───────────────────────

const MOCK_RESULT: PestDiagnosisResult = {
  diseaseName: "Yellow Rust",
  scientificName: "Puccinia striiformis",
  confidencePercent: 92,
  severity: "Moderate",
  affectedArea: "~25% of leaf area",
  symptoms: [
    "Stripes of yellow-to-orange pustules parallel to leaf veins",
    "Powdery spore masses on upper leaf surface",
    "Stunted growth and premature leaf death",
  ],
  treatment: {
    immediate: [
      "Apply Fungicide — Apply a triazole-based fungicide immediately to halt pustule development.",
      "Isolate Affected Area — Restrict machinery movement through infected plots to prevent spore transfer.",
      "Monitor Neighbouring Crops — Scout downwind fields daily for early signs of yellow stippling.",
    ],
    preventive: [
      "Plant rust-resistant wheat varieties next season.",
      "Avoid excessive nitrogen fertilisation.",
    ],
    recommendedPesticides: ["Tilt 250 EC (Propiconazole)", "Folicur (Tebuconazole)"],
  },
  disclaimer: "Consult a local agronomist for confirmation before applying treatments.",
};

const CROP_TYPES: string[]  = ["Winter Wheat","Rice","Maize","Cotton","Soybean","Mustard","Sugarcane","Tomato"];
const CROP_STAGES: string[] = ["Germination","Seedling","Vegetative","Tillering","Flowering","Grain Fill","Maturity"];

// ─── TreatmentStep sub-component ─────────────────────────────────────────────
// Note: key is NOT in the props interface — React strips it.
// At the call-site we use <React.Fragment key={i}> as the keyed wrapper.

function TreatmentStep({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#2ea82e]/20 border border-[#2ea82e]/30 flex items-center justify-center text-xs font-bold text-[#4dc24d]">
        {num}
      </span>
      <div>
        <p className="text-sm font-semibold text-white leading-snug">{title}</p>
        <p className="text-xs text-[#82d882]/60 mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function PestDiagnosisPage() {
  const { t, lang } = useI18n();
  const [imageFile,    setImageFile]    = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanning,   setIsScanning]   = useState(false);
  const [observations, setObservations] = useState(
    "Yellow spots on leaves, circular patterns observed on upper canopy. Wilted stems in some clusters."
  );
  const [cropType,  setCropType]  = useState("Winter Wheat");
  const [cropStage, setCropStage] = useState("Flowering");
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [result,    setResult]    = useState<PestDiagnosisResult | null>(null);
  const [analysisId]              = useState("CWP-992-B");
  const inputRef = useRef<HTMLInputElement>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── File selection handler ─────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setIsScanning(true);
    setScanProgress(0);
    let p = 0;
    scanIntervalRef.current = setInterval(() => {
      p += 4;
      if (p >= 100) {
        // Finish the scan, then clear the overlay so the image is visible
        // and the user can run the actual diagnosis.
        setScanProgress(100);
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
        setTimeout(() => { setIsScanning(false); setScanProgress(0); }, 350);
      } else {
        setScanProgress(p);
      }
    }, 40);
  }, []);

  // ── Drag-and-drop handler (fully typed) ────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // ── AI diagnosis handler ───────────────────────────────────────────────────
  const handleDiagnose = async () => {
    if (!imageFile) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const base64   = await fileToBase64(imageFile);
      const mimeType = getImageMimeType(imageFile);
      const prompt   = [
        "Diagnose any disease or pest issues.",
        `Crop: ${cropType}.`,
        `Stage: ${cropStage}.`,
        observations && `Symptoms: ${observations}`,
      ].filter(Boolean).join(" ");

      const body: GeminiRequestBody = {
        prompt,
        mode: "pest_diagnosis",
        language: lang, // diagnosis text comes back in the user's language
        imageBase64: base64,
        imageMimeType: mimeType,
      };

      const res = await fetch("/api/gemini", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      const data: GeminiResponseBody = await res.json();
      if (!data.success || !data.structured) {
        throw new Error(data.error ?? "Diagnosis failed.");
      }

      const diagResult = data.structured as unknown as PestDiagnosisResult;
      setResult(diagResult);
      // Log to Firebase
      const { logActivity } = await import("@/lib/firebase/activity-log");
      const { auth } = await import("@/lib/firebase/client");
      const uid = auth.currentUser?.uid;
      if (uid) {
        await logActivity({ userId: uid, type: "pest_diagnosis", title: `Diagnosed: ${diagResult.diseaseName}`, description: `${diagResult.severity} severity — ${diagResult.confidencePercent}% confidence`, metadata: { disease: diagResult.diseaseName, severity: diagResult.severity, confidence: diagResult.confidencePercent } });
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Download report as PDF (via the browser's print dialog) ─────────────────
  const handleDownloadReport = () => {
    if (!result) return;
    const r = result;
    const esc = (s: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const list = (arr?: string[]) => (arr?.length ? `<ul>${arr.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "<p>—</p>");
    const sections = (r.detailedReportSections ?? [])
      .map((s) => `<h3>${esc(s.title)}</h3><p>${esc(s.content)}</p>`).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>CropWise AI — ${esc(r.diseaseName)}</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.55}
        h1{margin:0;font-size:24px} h2{margin-top:28px;font-size:18px;border-bottom:1px solid #ddd;padding-bottom:4px}
        h3{margin:16px 0 4px;font-size:14px} .muted{color:#666} .pill{display:inline-block;padding:2px 10px;border-radius:999px;background:#eef6ee;color:#1a6b1a;font-size:12px;font-weight:600;margin-right:8px}
        ul{margin:6px 0;padding-left:20px} li{margin:3px 0} .head{border-bottom:2px solid #2ea82e;padding-bottom:10px;margin-bottom:6px}
        @media print{.no-print{display:none}}
      </style></head><body>
      <div class="head"><h1>CropWise AI — ${t("Pest Diagnosis Report")}</h1>
      <p class="muted">${t("Analysis ID")}: #${esc(analysisId)} · ${new Date().toLocaleString("en-IN")}</p></div>
      <h2>${esc(r.diseaseName)} ${r.scientificName ? `<span class="muted" style="font-size:14px">(${esc(r.scientificName)})</span>` : ""}</h2>
      <p><span class="pill">${esc(r.severity)} severity</span><span class="pill">${r.confidencePercent}% match</span></p>
      <p><strong>${t("Affected area")}:</strong> ${esc(r.affectedArea)}</p>
      <h2>${t("Symptoms")}</h2>${list(r.symptoms)}
      <h2>${t("Immediate Treatment")}</h2>${list(r.treatment?.immediate)}
      <h2>${t("Preventive Measures")}</h2>${list(r.treatment?.preventive)}
      <h2>${t("Recommended Products")}</h2>${list(r.treatment?.recommendedPesticides)}
      ${sections ? `<h2>${t("Detailed Report")}</h2>${sections}` : ""}
      <p class="muted" style="margin-top:24px;font-style:italic">${esc(r.disclaimer ?? "")}</p>
      <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:10px 18px;border:0;border-radius:8px;background:#2ea82e;color:#fff;font-weight:600;cursor:pointer">${t("Save as PDF")}</button>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
      </body></html>`;

    const w = window.open("", "_blank");
    if (!w) { alert(t("Please allow pop-ups to download the report.")); return; }
    w.document.write(html);
    w.document.close();
  };

  // ── View similar cases (web search for this disease) ────────────────────────
  const handleViewSimilar = () => {
    if (!result) return;
    const q = `${result.diseaseName} ${result.scientificName ?? ""} ${cropType} disease treatment`.trim();
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
  };

  // ── Severity colour helper ─────────────────────────────────────────────────
  const severityColor = (s: string): string =>
    ({ Low: "text-[#4dc24d]", Moderate: "text-amber-400", High: "text-orange-400", Critical: "text-rose-400" })[s as "Low" | "Moderate" | "High" | "Critical"] ?? "text-[#94a896]";

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Row 1: Image Analysis + Symptom Profile ─────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

          {/* ── Image Analysis card ─────────────────────────────── */}
          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#e8f5e9]">{t("Image Analysis")}</h2>
              <p className="text-xs text-[#5a7460] mt-0.5">
                {t("Upload a clear photo of the affected plant parts for AI analysis.")}
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(_e: React.DragEvent<HTMLDivElement>) => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !imagePreview && inputRef.current?.click()}
              className={cn(
                "relative h-64 rounded-xl border-2 overflow-hidden transition-all duration-200",
                imagePreview
                  ? "border-[#2a3d2c] cursor-default"
                  : isDragging
                    ? "border-[#2ea82e] bg-[#2ea82e]/5 cursor-copy scale-[1.01]"
                    : "border-dashed border-[#2a3d2c] bg-[#0d1a10] cursor-pointer hover:border-[#3d5c40]"
              )}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Uploaded crop" className="w-full h-full object-cover" />

                  {/* Scanning progress overlay */}
                  {(isScanning || scanProgress > 0) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b1410]/65 backdrop-blur-sm">
                      <div className="w-14 h-14 rounded-xl bg-[#182419] border border-[#2a3d2c] flex items-center justify-center mb-3">
                        <Upload className="w-6 h-6 text-[#5a7460]" strokeWidth={1.5} />
                      </div>
                      <p className="text-sm font-bold text-[#e8f5e9] mb-0.5">{t("Scanning in progress...")}</p>
                      <p className="text-[10px] text-[#5a7460] mb-4 text-center px-6">
                        {t("Drop high-resolution leaf or stem images here")}<br />(JPEG, PNG up to 20MB)
                      </p>
                      <div className="w-48">
                        <div className="h-1.5 w-full rounded-full bg-[#1e2d20] overflow-hidden mb-1.5">
                          <div
                            className="h-full rounded-full bg-[#2ea82e] transition-all duration-200"
                            style={{ width: `${scanProgress}%` }}
                          />
                        </div>
                        <p className="text-center text-[10px] font-semibold text-[#5a7460] uppercase tracking-widest">
                          {scanProgress}% {t("Analysed")}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Clear button */}
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
                      scanIntervalRef.current = null;
                      setImagePreview(null);
                      setImageFile(null);
                      setIsScanning(false);
                      setScanProgress(0);
                      setResult(null);
                    }}
                    className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-[#0b1410]/80 border border-[#2a3d2c] flex items-center justify-center text-[#94a896] hover:text-rose-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
                  <div className={cn(
                    "w-12 h-12 rounded-xl border flex items-center justify-center transition-colors",
                    isDragging ? "bg-[#2ea82e]/15 border-[#2ea82e]/30" : "bg-[#182419] border-[#2a3d2c]"
                  )}>
                    <Upload className={cn("w-6 h-6", isDragging ? "text-[#4dc24d]" : "text-[#5a7460]")} strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-medium text-[#94a896]">
                    {t("Drop high-resolution leaf or stem images here")}
                  </p>
                  <p className="text-xs text-[#5a7460]">(JPEG, PNG up to 20MB)</p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-1 text-xs font-medium text-[#4dc24d] underline underline-offset-2 hover:text-[#82d882]"
                  >
                    {t("Browse files")}
                  </button>
                </div>
              )}
            </div>

            {/* Verified badge */}
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-1">
                <span className="w-6 h-6 rounded-full bg-[#2ea82e]/20 border border-[#2ea82e]/40 flex items-center justify-center text-[9px] font-bold text-[#4dc24d]">
                  AI
                </span>
                <span className="w-6 h-6 rounded-full bg-blue-900/40 border border-blue-800/40 flex items-center justify-center text-[9px] font-bold text-blue-400">
                  RH
                </span>
              </div>
              <p className="text-xs text-[#5a7460]">
                {t("Verified by Plant Pathology Model v4.2 and Regional Experts")}
              </p>
            </div>

            {/* Hidden file input */}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {/* ── Symptom Profile panel ──────────────────────────── */}
          <div className="space-y-4">
            <div className="card space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#4dc24d]" strokeWidth={2} />
                <h2 className="text-sm font-bold text-[#e8f5e9]">{t("Symptom Profile")}</h2>
              </div>

              {/* Visual observations textarea */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-2">
                  {t("Visual Observations")}
                </p>
                <textarea
                  rows={4}
                  value={observations}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObservations(e.target.value)}
                  className="input-field text-sm resize-none"
                  placeholder={t("Describe what you see...")}
                />
              </div>

              {/* Crop Type + Stage */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-2">
                    {t("Crop Type")}
                  </p>
                  <select
                    className="input-field text-sm"
                    value={cropType}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCropType(e.target.value)}
                  >
                    {CROP_TYPES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-2">
                    {t("Stage")}
                  </p>
                  <select
                    className="input-field text-sm"
                    value={cropStage}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCropStage(e.target.value)}
                  >
                    {CROP_STAGES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
                  </select>
                </div>
              </div>

              {/* Error display */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-900/20 border border-rose-800/40">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300">{error}</p>
                </div>
              )}

              {/* CTA button */}
              <button
                type="button"
                onClick={handleDiagnose}
                disabled={!imageFile || isLoading}
                className="btn-primary w-full justify-center py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t("Analysing...")}</>
                ) : (
                  <><BarChart2 className="w-4 h-4" /> {t("Run Diagnostic Report")}</>
                )}
              </button>
            </div>

            {/* Diagnosis tip card */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#111d16] border border-[#2a3d2c]">
              <div className="w-7 h-7 rounded-full bg-blue-900/30 border border-blue-800/40 flex items-center justify-center flex-shrink-0">
                <Info className="w-3.5 h-3.5 text-blue-400" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold text-[#e8f5e9] mb-0.5">{t("Diagnosis Tip")}</p>
                <p className="text-xs text-[#5a7460] leading-relaxed">
                  {t("Include the underside of leaves and a shot of the whole plant for 30% higher accuracy.")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2: Diagnostic Results ─────────────────────────────── */}
        {result && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#e8f5e9]">{t("Diagnostic Results")}</h2>
              <p className="text-xs text-[#5a7460]">{t("Analysis ID")}: #{analysisId}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_310px] gap-5">

              {/* ── Disease details card ─────────────────────────── */}
              <div className="card space-y-5">
                <div className="flex items-start gap-5">
                  {/* Thumbnail with severity badge */}
                  <div className="flex-shrink-0 w-36 h-36 rounded-xl overflow-hidden border border-[#2a3d2c] bg-[#182419] flex items-center justify-center relative">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Crop" className="w-full h-full object-cover" />
                    ) : (
                      <ScanSearch className="w-8 h-8 text-[#3d4d3e]" strokeWidth={1} />
                    )}
                    <div className="absolute bottom-0 inset-x-0 px-2 pb-2 flex justify-center">
                      <span className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0b1410]/85 backdrop-blur-sm",
                        severityColor(result.severity)
                      )}>
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {t(result.severity)} {t("SEVERITY")}
                      </span>
                    </div>
                  </div>

                  {/* Disease name + confidence */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460] mb-1">
                      {t("Disease Name")}
                    </p>
                    <h3 className="text-2xl font-bold text-[#e8f5e9]">{result.diseaseName}</h3>
                    {result.scientificName && (
                      <p className="text-sm italic text-[#5a7460] mt-0.5">({result.scientificName})</p>
                    )}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5a7460]">
                          {t("AI Confidence")}
                        </p>
                        <p className="text-xs font-bold text-[#e8f5e9]">
                          {result.confidencePercent}% {t("Match")}
                        </p>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#1e2d20] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#2ea82e] transition-all duration-700"
                          style={{ width: `${result.confidencePercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description paragraph */}
                <p className="text-sm text-[#94a896] leading-relaxed">
                  {result.symptoms?.length > 0 
                    ? result.symptoms.join(" ")
                    : `Affected Area: ${result.affectedArea}. This pest/disease can cause significant yield loss if not managed properly using the sustainable protocols listed.`}
                </p>

                {/* Action buttons */}
                <div className="flex items-center gap-3 pt-1 border-t border-[#1e2d20]">
                  <button
                    type="button"
                    onClick={handleDownloadReport}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2a3d2c] text-sm text-[#94a896] hover:border-[#4dc24d] hover:text-[#4dc24d] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> {t("Download Report")}
                  </button>
                  <button
                    type="button"
                    onClick={handleViewSimilar}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2a3d2c] text-sm text-[#94a896] hover:border-[#4dc24d] hover:text-[#4dc24d] transition-colors"
                  >
                    {t("View Similar Cases")}
                  </button>
                </div>
              </div>

              {/* ── Treatment Protocol card ──────────────────────── */}
              <div
                className="rounded-xl p-5 relative overflow-hidden flex flex-col gap-5"
                style={{
                  background: "linear-gradient(145deg, #1a4d1a 0%, #0c330c 100%)",
                  border: "1px solid rgba(46,168,46,0.2)",
                }}
              >
                {/* Grid texture background */}
                <div
                  className="absolute inset-0 opacity-[0.05]"
                  style={{
                    backgroundImage: "linear-gradient(rgba(77,194,77,1) 1px, transparent 1px), linear-gradient(90deg, rgba(77,194,77,1) 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }}
                />

                <div className="relative z-10 flex-1 space-y-4">
                  <h3 className="text-base font-bold text-white">{t("Treatment Protocol")}</h3>

                  {/* Treatment steps — key on Fragment, not on TreatmentStep props */}
                  {result.treatment.immediate.slice(0, 3).map((step: string, i: number) => {
                    const parts = step.includes(" — ") ? step.split(" — ") : step.includes(": ") ? step.split(": ") : [];
                    const title = parts.length > 1
                      ? parts[0].trim()
                      : `Step ${i + 1}`;
                    const body = parts.length > 1 ? parts.slice(1).join(" — ").trim() : step.trim();
                    return (
                      <React.Fragment key={i}>
                        <TreatmentStep num={String(i + 1).padStart(2, "0")} title={title} body={body} />
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Order supplies CTA */}
                <button
                  type="button"
                  className="relative z-10 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/20 text-white text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  <ShoppingCart className="w-4 h-4" /> {t("Order Recommended Supplies")}
                </button>
              </div>
            </div>

            {/* ── Full Detailed Report ─────────────────────────────── */}
            {result.detailedReportSections && result.detailedReportSections.length > 0 ? (
              <div className="mt-6 space-y-4">
                <h3 className="text-xl font-bold text-[#e8f5e9] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#4dc24d]" />
                  {t("Detailed Sustainability Report")}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.detailedReportSections.map((section, idx) => (
                    <div key={idx} className="card p-5 space-y-3 border border-[#2a3d2c] bg-[#111d16] hover:border-[#3d5c40] transition-colors">
                      <h4 className="text-sm font-bold text-[#e8f5e9] border-b border-[#1e2d20] pb-2">
                        {section.title.replace(/^SECTION\s*\d+:\s*/i, '').replace(/^SECTION\s*\d+\s*/i, '')}
                      </h4>
                      <div className="text-sm text-[#94a896] leading-relaxed whitespace-pre-wrap">
                        {section.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : result.fullReportText ? (
              <div className="mt-6 card space-y-3">
                <h3 className="text-lg font-bold text-[#e8f5e9]">Detailed Sustainability Report</h3>
                <div className="p-5 rounded-xl bg-[#0d1a10] border border-[#2a3d2c]">
                  <p className="text-sm text-[#94a896] leading-relaxed whitespace-pre-wrap">
                    {result.fullReportText}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}

      </div>
    </AppShell>
  );
}
