import { useState, useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────
const FONT_URL    = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap";
const DTI_MAX     = 0.50;
const DTI_STRETCH = 0.36;
const DTI_HARD    = 0.43;
const C = { lime: "#c0ff02", amber: "#FFB94F", rose: "#DB5282", bg: "#262626", muted: "#bbb7af", dark: "#141414", surface: "#333", dim: "#898785" };

// ─── Design Primitives (non-negotiable) ──────────────────────────────────────
const CARD = {
  bg:          C.bg,
  radius:      25,
  padding:     20,
  leftWidth:   390,
  leftHeight:  700,
  topHeight:   315,
  botHeight:   365,
  gap:         20,
};

const SPACING = {
  titleMb:     20,
  groupGap:    16,
  labelMb:     8,
  sectionMt:   36,
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const fmt  = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtN = n => Math.round(n).toLocaleString("en-US");
const fmtK = n => n >= 1000 ? `$${Math.round(n / 1000)}K` : fmt(n);

function monthlyPI(principal, annualRate, years) {
  const r = annualRate / 100 / 12, n = years * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function fullPayment(price, down, rate, term) {
  if (price <= 0) return { total: 0, pi: 0, tax: 0, ins: 0, pmi: 0 };
  const loan = Math.max(0, price - down);
  const pi   = monthlyPI(loan, rate, term);
  const tax  = price * 0.011 / 12;
  const ins  = price * 0.005 / 12;
  const pmi  = (down / price) < 0.20 ? loan * 0.005 / 12 : 0;
  return { total: pi + tax + ins + pmi, pi, tax, ins, pmi };
}

function priceFromPayment(target, down, rate, term) {
  if (target <= 0) return 0;
  let lo = 0, hi = 10_000_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    fullPayment(mid, down, rate, term).total < target ? (lo = mid) : (hi = mid);
  }
  return Math.round((lo + hi) / 2);
}

function sliderBg(val, min, max) {
  const p = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  return { background: `linear-gradient(to right, ${C.lime} ${p}%, #3a3a3a ${p}%)` };
}

function dtiZone(dti) {
  if (dti <= DTI_STRETCH) return { label: "comfortable", color: C.lime };
  if (dti <= DTI_HARD)    return { label: "stretch",     color: C.amber };
  return                         { label: "difficult",   color: C.rose };
}

function dtiContextText(dti) {
  const pct = Math.round(dti * 100);
  if (dti <= DTI_STRETCH) return `At ${pct}% DTI you have solid breathing room. Most lenders consider back-end DTI under 36% a strong borrowing position.`;
  if (dti <= DTI_HARD)    return `At ${pct}% DTI you're in stretch territory. You can qualify with most lenders, but your monthly budget will be tighter.`;
  return `At ${pct}% DTI you're in difficult range. Many lenders cap at 43–50%. Consider a larger down payment or reducing existing debts.`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function FmtInput({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", background: C.surface, borderRadius: 8 }}>
      <span style={{ paddingLeft: 14, fontSize: 16, color: C.muted }}>$</span>
      <input
        type="text"
        inputMode="numeric"
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", padding: "11px 14px", fontFamily: "Manrope, sans-serif", fontSize: 16, color: C.muted, outline: "none", textAlign: "right" }}
        value={editing ? draft : fmtN(value)}
        onFocus={() => { setEditing(true); setDraft(String(Math.round(value))); }}
        onBlur={() => { setEditing(false); const n = parseInt(draft.replace(/\D/g, ""), 10); onChange(isNaN(n) ? 0 : Math.max(0, n)); }}
        onChange={e => setDraft(e.target.value)}
      />
    </div>
  );
}

function RateInput({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", background: C.surface, borderRadius: 8 }}>
      <input
        type="text"
        inputMode="decimal"
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", padding: "11px 4px 11px 14px", fontFamily: "Manrope, sans-serif", fontSize: 16, color: C.muted, outline: "none", textAlign: "right" }}
        value={editing ? draft : String(value)}
        onFocus={() => { setEditing(true); setDraft(String(value)); }}
        onBlur={() => { setEditing(false); const n = parseFloat(draft); onChange(isNaN(n) ? value : Math.max(0.1, n)); }}
        onChange={e => setDraft(e.target.value)}
      />
      <span style={{ paddingRight: 14, fontSize: 16, color: C.muted }}>%</span>
    </div>
  );
}

const DonutTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#1a1a1a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.muted, whiteSpace: "nowrap", fontFamily: "Manrope, sans-serif" }}>
      <span style={{ color: d.color }}>{d.name}</span><br />{fmt(d.value)}/mo
    </div>
  );
};

const ArrowIcon = () => (
  <svg width="15" height="9.5" viewBox="3 5.5 14 9" fill="none">
    <path d="M4 10h12M12 6l4 4-4 4" stroke="#1e1e1e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  svg, svg * { -webkit-tap-highlight-color: transparent; outline: none; }
  body { background: transparent; font-family: 'Manrope', sans-serif; color: ${C.muted}; }

  .slider { -webkit-appearance: none; appearance: none; width: 100%; height: 3px; border-radius: 2px; outline: none; cursor: pointer; margin-top: 6px; }
  .slider::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 14px; border-radius: 20px; background: ${C.lime}; cursor: pointer; }
  .slider::-moz-range-thumb     { width: 28px; height: 14px; border-radius: 20px; background: ${C.lime}; cursor: pointer; border: none; }

  .term-btn { padding: 11px; border: none; border-radius: 8px; font-family: 'Manrope', sans-serif; font-size: 1rem; font-weight: 700; cursor: pointer; flex: 1; }
  .term-off { background: ${C.surface}; color: ${C.muted}; }
  .term-on  { background: ${C.muted};   color: ${C.bg}; }

  .i-btn { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid ${C.muted}; background: none; color: ${C.muted}; font-size: .6rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; font-family: 'Manrope', sans-serif; flex-shrink: 0; }

  .dti-thumb-pill { position: absolute; top: 50%; transform: translate(-50%, -50%) rotate(90deg); width: 32px; height: 16px; border-radius: 20px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.4); cursor: grab; z-index: 2; }

  .g-tip { position: fixed; background: rgba(38,38,38,0.30); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: ${C.muted}; font-size: 12px; line-height: 1.5; padding: 12px; border-radius: 8px; width: 220px; pointer-events: none; font-family: 'Manrope', sans-serif; }

  /* ── Mobile carousel ── */
  .mc-pagination { display: none; height: 32px; margin-top: 10px; position: relative; }
  .mc-dot { width: 8px; height: 8px; border-radius: 50%; background: ${C.muted}; border: none; padding: 0; cursor: pointer; transition: background 0.2s, transform 0.2s; }
  .mc-dot.active { background: #333; transform: scale(1.15); }
  .mc-pill-btn { display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; width: 100px; height: 20px; border-radius: 20px; background: ${C.lime}; border: none; cursor: pointer; transition: transform 0.15s; }
  .mc-pill-btn:active { transform: scale(0.95); }
  .mc-pill-btn.flipped { justify-content: flex-start; padding-right: 0; padding-left: 10px; }
  .mc-pill-btn.flipped svg { transform: rotate(180deg); }

  /* ── Desktop layout (overridden by mobile MQ below) ── */
  .layout     { display: grid; grid-template-columns: 390px 662px; gap: 20px; align-items: start; }
  .right-col  { display: flex; flex-direction: column; gap: 20px; }

  @media (max-width: 1024px) {
    .layout-outer { overflow: hidden; width: 390px; height: 700px; }
    .layout { display: flex !important; width: max-content !important; gap: 16px !important; align-items: start !important; transition: transform 0.35s cubic-bezier(0.4,0,0.2,1) !important; padding: 0 16px !important; box-sizing: content-box !important; }
    .layout.page-0 { transform: translateX(0) !important; }
    .layout.page-1 { transform: translateX(-374px) !important; }
    .layout.page-2 { transform: translateX(-748px) !important; }
    .left-card, .top-card, .bot-card { width: 358px !important; min-width: 358px !important; height: 700px !important; flex-shrink: 0 !important; border-radius: 25px !important; }
    .top-card { position: static !important; }
    .right-col { display: contents !important; }
    .bp-d  { display: none !important; }
    .bp-m  { display: flex !important; }
    .bkd-d { display: none !important; }
    .bkd-m { display: flex !important; }
    .mc-pagination { display: flex !important; width: 390px !important; height: 32px !important; position: relative !important; }
    .mc-dots { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); display: flex; gap: 8px; align-items: center; }
    .mc-pill-left  { position: absolute; left: 30px;  top: 50%; transform: translateY(-50%); }
    .mc-pill-right { position: absolute; right: 30px; top: 50%; transform: translateY(-50%); }
  }
`;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BuyingPowerCalc() {
  // Inputs
  const [income,    setIncome]    = useState(350000);
  const [debts,     setDebts]     = useState(3000);
  const [recurring, setRecurring] = useState(4000);
  const [downCash,  setDownCash]  = useState(175000);
  const [rate,      setRate]      = useState(6.75);
  const [term,      setTerm]      = useState(30);
  const [dtiPct,    setDtiPct]    = useState(DTI_STRETCH / DTI_MAX);

  // UI state
  const [tip,        setTip]        = useState(null);
  const [mobileTip,  setMobileTip]  = useState(null);
  const [activePage, setActivePage] = useState(0);

  // Refs
  const trackRef     = useRef(null);
  const mTrackRef    = useRef(null);
  const dragging     = useRef(false);
  const activeRef    = useRef(null);
  const touchStartX  = useRef(0);
  const touchDeltaX  = useRef(0);

  // ── Derived values ──
  const mi         = income / 12;
  const targetDTI  = dtiPct * DTI_MAX;
  const maxHousing = Math.max(0, mi * targetDTI - debts);
  const homePrice  = priceFromPayment(maxHousing, downCash, rate, term);
  const downPct    = homePrice > 0 ? (downCash / homePrice) * 100 : 0;
  const pmt        = fullPayment(homePrice, downCash, rate, term);
  const actualDTI  = mi > 0 ? (pmt.total + debts) / mi : 0;
  const totalMo    = pmt.total + debts + recurring;
  const remaining  = mi - totalMo;
  const zone       = dtiZone(targetDTI);
  const remainColor = remaining < 0 ? C.rose : remaining < 2000 ? C.amber : C.muted;

  const pS = (DTI_STRETCH / DTI_MAX) * 100;
  const pH = (DTI_HARD    / DTI_MAX) * 100;
  const dtiGradient = {
    background: `linear-gradient(90deg, ${C.lime} 0%, ${C.lime} ${pS.toFixed(1)}%, ${C.amber} ${pS.toFixed(1)}%, ${C.amber} ${pH.toFixed(1)}%, ${C.rose} ${pH.toFixed(1)}%, ${C.rose} 100%)`
  };

  const segments = [
    { name: "Principal & interest", value: Math.max(0, Math.round(pmt.pi)),  color: C.lime  },
    { name: "Property tax",         value: Math.max(0, Math.round(pmt.tax)), color: C.dim   },
    { name: "Insurance",            value: Math.max(0, Math.round(pmt.ins)), color: C.dim   },
    { name: "PMI",                  value: Math.max(0, Math.round(pmt.pmi)), color: C.amber },
    { name: "Debt payments",        value: debts,                            color: "#333"  },
    { name: "Recurring expenses",   value: recurring,                        color: C.dim   },
  ].filter(s => s.value > 0);

  // ── DTI drag ──
  function startDrag(e, ref) {
    dragging.current = true;
    activeRef.current = ref;
    const rect = ref.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    setDtiPct(Math.max(0, Math.min(1, (cx - rect.left) / rect.width)));
    e.preventDefault();
  }

  useEffect(() => {
    const mv = e => {
      if (!dragging.current || !activeRef.current?.current) return;
      const rect = activeRef.current.current.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      setDtiPct(Math.max(0, Math.min(1, (cx - rect.left) / rect.width)));
    };
    const up = () => { dragging.current = false; activeRef.current = null; };
    window.addEventListener("mousemove",  mv);
    window.addEventListener("mouseup",    up);
    window.addEventListener("touchmove",  mv, { passive: false });
    window.addEventListener("touchend",   up);
    return () => {
      window.removeEventListener("mousemove",  mv);
      window.removeEventListener("mouseup",    up);
      window.removeEventListener("touchmove",  mv);
      window.removeEventListener("touchend",   up);
    };
  }, []);

  // ── Font ──
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_URL;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  // ── Tooltip ──
  function showTip(e, text) {
    const r   = e.currentTarget.getBoundingClientRect();
    const tipW = 220;
    let x = r.left + r.width / 2;
    x = Math.max(tipW / 2 + 8, Math.min(window.innerWidth - tipW / 2 - 8, x));
    setTip({ x, y: r.top, text });
  }

  const IBtn = ({ text }) => (
    <button className="i-btn" onMouseEnter={e => showTip(e, text)} onMouseLeave={() => setTip(null)}>i</button>
  );

  // ── Mobile swipe ──
  const handleTouchStart = e => { touchStartX.current = e.touches[0].clientX; touchDeltaX.current = 0; };
  const handleTouchMove  = e => { touchDeltaX.current = e.touches[0].clientX - touchStartX.current; };
  const handleTouchEnd   = () => {
    if (touchDeltaX.current < -50 && activePage < 2) setActivePage(p => p + 1);
    if (touchDeltaX.current >  50 && activePage > 0) setActivePage(p => p - 1);
  };

  // ── Shared styles ──
  const card    = { background: C.bg, borderRadius: 25, padding: 20 };
  const sectHdr = { fontSize: "1rem", fontWeight: 700, letterSpacing: "0.30em", textTransform: "uppercase", color: C.muted };
  const fLbl    = { fontSize: "1rem", fontWeight: 600, color: C.muted, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" };
  const fRow    = { marginBottom: 16 };

  // ── Donut tooltip (fixed-position) ──
  const handleDonutEnter = (data, index, e, container) => {
    const s    = segments[index];
    const rect = container?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth };
    const tipW = 220, margin = 8;
    let x = e.clientX;
    x = Math.max(rect.left + tipW / 2 + margin, Math.min(rect.right - tipW / 2 - margin, x));
    setTip({ x, y: e.clientY, text: `${s.name}: ${fmt(s.value)}/mo` });
  };

  return (
    <>
      <style>{css}</style>

      <div style={{ position: "relative" }}>
        {/* ── Carousel wrapper ── */}
        <div
          className="layout-outer"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className={`layout page-${activePage}`}>

            {/* ══════════════════════════════════════════════
                CARD 1 — Financials
            ══════════════════════════════════════════════ */}
            <div className="left-card" style={{ background: CARD.bg, borderRadius: CARD.radius, padding: CARD.padding, paddingBottom: CARD.padding, width: CARD.leftWidth, height: CARD.leftHeight, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ ...sectHdr, marginBottom: 20 }}>Financials</div>

              <div>
                <div style={fLbl}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    Annual household income <IBtn text="Combined gross income before taxes for all borrowers." />
                  </span>
                </div>
                <FmtInput value={income} onChange={setIncome} />
              </div>

              <div>
                <div style={fLbl}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    Monthly debt payments <IBtn text="Car loans, student loans, credit card minimums. Exclude rent." />
                  </span>
                </div>
                <FmtInput value={debts} onChange={setDebts} />
              </div>

              <div>
                <div style={fLbl}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    Recurring monthly expenses <IBtn text="Subscriptions, childcare, utilities — reduce real budget even if lenders don't count them." />
                  </span>
                </div>
                <FmtInput value={recurring} onChange={setRecurring} />
              </div>

              <div style={{ height: 20 }} />

              <div style={{ marginBottom: 0 }}>
                <div style={fLbl}>
                  <span>Down payment</span>
                  {downPct < 20 && homePrice > 0 && (
                    <span style={{ fontSize: "0.875rem", color: C.amber, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                      <AlertTriangle size={14} strokeWidth={2} />PMI applies
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 72px", gap: 8, marginBottom: 0 }}>
                  <FmtInput value={downCash} onChange={setDownCash} />
                  <div style={{ display: "flex", alignItems: "center", background: C.surface, borderRadius: 8 }}>
                    <span style={{ flex: 1, textAlign: "right", padding: "11px 4px 11px 10px", fontSize: 16, color: C.muted }}>{downPct.toFixed(0)}</span>
                    <span style={{ paddingRight: 14, fontSize: 16, color: C.muted }}>%</span>
                  </div>
                </div>
                <input type="range" className="slider" min={0} max={500000} step={5000}
                  value={downCash} onChange={e => setDownCash(+e.target.value)}
                  style={sliderBg(downCash, 0, 500000)} />
              </div>

              <div style={{ marginBottom: 0 }}>
                <div style={fLbl}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    Interest rate <IBtn text="Current rate from your lender. Check Freddie Mac's weekly survey for market rates." />
                  </span>
                </div>
                <RateInput value={rate} onChange={setRate} />
                <input type="range" className="slider" min={2} max={12} step={0.125}
                  value={rate} onChange={e => setRate(+e.target.value)}
                  style={sliderBg(rate, 2, 12)} />
              </div>

              <div style={{ marginBottom: 0 }}>
                <div style={{ ...fLbl, marginBottom: 8 }}>Loan term (years)</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[15, 20, 30].map(t => (
                    <button key={t} className={"term-btn " + (term === t ? "term-on" : "term-off")} onClick={() => setTerm(t)}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right column ── */}
            <div className="right-col">

              {/* ══════════════════════════════════════════════
                  CARD 2 — Buying Power
              ══════════════════════════════════════════════ */}
              <div className="right-card top-card" style={{ background: CARD.bg, borderRadius: CARD.radius, padding: CARD.padding, height: CARD.topHeight, position: "relative" }}>

                {/* Desktop */}
                <div className="bp-d">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
                    <div style={sectHdr}>Buying Power</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <IBtn text="Based on back-end DTI: (housing + all debts) ÷ gross monthly income. Recurring expenses excluded — lenders don't count them." />
                      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 20, width: 100, height: 25, fontSize: "1rem", fontWeight: 600, color: C.dark, background: zone.color }}>
                        {(targetDTI * 100).toFixed(0)}% DTI
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "3rem", fontWeight: 800, color: "#f0f0f0", lineHeight: 1.1, letterSpacing: "-0.05em", marginBottom: 15 }}>
                      {fmt(homePrice)}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Total Monthly</div>
                      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f0f0f0" }}>{fmt(totalMo)}</div>
                    </div>
                  </div>

                  <div style={{ fontSize: "0.875rem", color: C.muted }}>
                    {fmt(pmt.total)}/mo mortgage · {fmtK(downCash)} down ({downPct.toFixed(0)}%)
                  </div>

                  {/* DTI track */}
                  <div style={{ position: "absolute", bottom: 20, left: 20, right: 20 }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: C.muted, marginBottom: 14 }}>
                      Debt-to-income ratio
                    </div>
                    <div
                      ref={trackRef}
                      onMouseDown={e => startDrag(e, trackRef)}
                      onTouchStart={e => startDrag(e, trackRef)}
                      style={{ height: 10, borderRadius: 5, cursor: "pointer", position: "relative", marginBottom: 18, touchAction: "none", ...dtiGradient }}
                    >
                      <div className="dti-thumb-pill" style={{ left: `${dtiPct * 100}%` }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
                      {[
                        { color: C.lime,  label: "Comfortable ≤36%" },
                        { color: C.amber, label: "Stretch 37–43%"   },
                        { color: C.rose,  label: "Difficult 44–50%" },
                      ].map(({ color, label }) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.875rem", color: C.muted }}>
                          <div style={{ width: 28, height: 10, borderRadius: 5, background: color, flexShrink: 0 }} />
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Mobile */}
                <div className="bp-m" style={{ display: "none", flexDirection: "column", height: "100%", padding: 0 }}>
                  <div style={{ ...sectHdr, marginBottom: 40 }}>Buying Power</div>
                  <div style={{ fontSize: "3.4rem", fontWeight: 800, color: "#f3f3f3", lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 12 }}>
                    {fmt(homePrice)}
                  </div>
                  <div style={{ fontSize: "0.95rem", color: C.muted, marginBottom: 56 }}>
                    {fmt(pmt.total)}/mo mortgage &nbsp;•&nbsp; {fmtK(downCash)} down ({downPct.toFixed(0)}%)
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: zone.color, borderRadius: 30, width: 120, height: 30, fontSize: "1rem", fontWeight: 500, color: C.dark, marginBottom: 16 }}>
                    {(targetDTI * 100).toFixed(0)}% DTI
                  </div>
                  <div style={{ fontSize: "1rem", color: C.muted, lineHeight: 1.55, marginBottom: "auto" }}>
                    {dtiContextText(targetDTI)}
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: C.muted, marginBottom: 8, marginTop: 30 }}>
                    Total monthly
                  </div>
                  <div style={{ fontSize: "2.4rem", fontWeight: 800, color: "#f3f3f3", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 24 }}>
                    {fmt(totalMo)}
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 600, letterSpacing: "0.24em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>
                    Debt-to-income ratio
                  </div>
                  <div
                    ref={mTrackRef}
                    onMouseDown={e => startDrag(e, mTrackRef)}
                    onTouchStart={e => startDrag(e, mTrackRef)}
                    style={{ height: 12, borderRadius: 6, position: "relative", marginBottom: 20, cursor: "pointer", touchAction: "none", ...dtiGradient }}
                  >
                    <div style={{ position: "absolute", top: "50%", left: `${dtiPct * 100}%`, transform: "translate(-50%,-50%) rotate(90deg)", width: 36, height: 18, borderRadius: 20, background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.5)", zIndex: 2 }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { color: C.lime,  label: "Comfortable ≤ 36%" },
                      { color: C.amber, label: "Stretch  37–43%"   },
                      { color: C.rose,  label: "Difficult  44–50%" },
                    ].map(({ color, label }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 36, height: 12, borderRadius: 6, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: "0.95rem", color: C.muted }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ══════════════════════════════════════════════
                  CARD 3 — Monthly Breakdown
              ══════════════════════════════════════════════ */}
              <div className="right-card bot-card" style={{ background: CARD.bg, borderRadius: CARD.radius, padding: CARD.padding, height: CARD.botHeight }}>

                {/* Desktop */}
                <div className="bkd-d" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <div style={{ ...sectHdr, marginBottom: 0 }}>Monthly Breakdown</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 32, alignItems: "center", flex: 1 }}>

                    {/* Donut */}
                    <div style={{ position: "relative", height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={segments} cx="50%" cy="50%"
                            innerRadius={80} outerRadius={110}
                            paddingAngle={4} dataKey="value"
                            startAngle={90} endAngle={-270} stroke="none"
                            onMouseEnter={(data, index, e) => {
                              const card = document.querySelector(".bot-card");
                              handleDonutEnter(data, index, e, card);
                            }}
                            onMouseLeave={() => setTip(null)}
                          >
                            {segments.map((s, i) => <Cell key={i} fill={s.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <div style={{ fontSize: "2.2rem", fontWeight: 700, color: "#fff", lineHeight: 1, letterSpacing: "-0.05em" }}>{(actualDTI * 100).toFixed(0)}%</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, pointerEvents: "auto" }}>
                          <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".12em", color: C.muted }}>DTI</span>
                          <IBtn text="DTI excludes recurring expenses." />
                        </div>
                      </div>
                    </div>

                    {/* Table */}
                    <div>
                      {[
                        { label: "Monthly income",      val: fmt(mi),     divider: true  },
                        { label: "Debt payments",        val: fmt(debts)                  },
                        { label: "Recurring expenses",   val: fmt(recurring), divider: true },
                        { label: "MORTGAGE PAYMENTS",    val: null,        section: true  },
                        { label: "Principal & interest", val: fmt(pmt.pi)                 },
                        { label: "Property tax (Est.)",  val: fmt(pmt.tax)                },
                        { label: "Insurance",            val: fmt(pmt.ins)                },
                        { label: "PMI",                  val: pmt.pmi > 0 ? fmt(pmt.pmi) : "—", pmiColor: pmt.pmi > 0, divider: true },
                      ].map(({ label, val, divider, section, pmiColor }, i) => section ? (
                        <div key={i} style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: C.muted, padding: "10px 0 6px" }}>{label}</div>
                      ) : (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.875rem", color: C.muted, ...(divider ? { borderBottom: `1px solid #2e2e2e`, paddingBottom: 6 } : {}) }}>
                          <span>{label}</span>
                          <span style={{ color: pmiColor ? C.amber : C.muted }}>{val}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: "0.875rem", fontWeight: 700, color: C.muted }}>
                        <span>Total monthly commitments</span><span>{fmt(totalMo)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0 0", fontSize: "0.875rem", color: C.muted }}>
                        <span>Remaining monthly income</span>
                        <span style={{ fontWeight: 700, color: remainColor }}>{fmt(remaining)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile */}
                <div className="bkd-m" style={{ display: "none", flexDirection: "column", padding: 0, height: "100%" }}>
                  <div style={{ flexShrink: 0, ...sectHdr, marginBottom: 12 }}>Monthly Breakdown</div>

                  {/* Donut */}
                  <div style={{ flex: 1, position: "relative", minHeight: 0, marginBottom: 16 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={segments} cx="50%" cy="50%"
                          innerRadius={85} outerRadius={118}
                          paddingAngle={4} dataKey="value"
                          startAngle={90} endAngle={-270} stroke="none"
                          onMouseEnter={(data, index, e) => {
                            const s    = segments[index];
                            const cont = e.currentTarget.closest(".bkd-m");
                            const rect = cont?.getBoundingClientRect() ?? { width: 390 };
                            const x    = Math.max(110, Math.min(rect.width - 110, e.clientX - rect.left));
                            setMobileTip({ x, y: e.clientY - rect.top, text: `${s.name}: ${fmt(s.value)}/mo` });
                          }}
                          onMouseLeave={() => setMobileTip(null)}
                        >
                          {segments.map((s, i) => <Cell key={i} fill={s.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    {mobileTip && (
                      <div className="g-tip" style={{ position: "absolute", top: mobileTip.y - 12, left: mobileTip.x, transform: "translate(-50%,-100%)", zIndex: 10 }}>
                        {mobileTip.text}
                      </div>
                    )}
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                      <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: "-0.05em" }}>{(actualDTI * 100).toFixed(0)}%</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, pointerEvents: "auto" }}>
                        <span style={{ fontSize: 16, textTransform: "uppercase", letterSpacing: "0.18em", color: C.muted }}>DTI</span>
                        <IBtn text="DTI excludes recurring expenses." />
                      </div>
                    </div>
                  </div>

                  {/* Table */}
                  <div style={{ flexShrink: 0 }}>
                    {[
                      { label: "Monthly income",            val: fmt(mi),       divider: true  },
                      { label: "Debt payments",              val: fmt(debts)                    },
                      { label: "Recurring expenses",         val: fmt(recurring), divider: true },
                    ].map(({ label, val, divider }, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: divider ? "6px 0" : "3px 0", borderBottom: divider ? `1px solid #333` : "none", fontSize: "0.95rem", color: C.muted }}>
                        <span>{label}</span><span>{val}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.20em", textTransform: "uppercase", color: C.muted, padding: "8px 0 4px" }}>Mortgage Payments</div>
                    {[
                      { label: "Principal & interest",  val: fmt(pmt.pi)  },
                      { label: "Property tax (Est.)",   val: fmt(pmt.tax) },
                      { label: "Insurance",             val: fmt(pmt.ins) },
                    ].map(({ label, val }, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "0.95rem", color: C.muted }}>
                        <span>{label}</span><span>{val}</span>
                      </div>
                    ))}
                    {pmt.pmi > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0 6px", borderBottom: `1px solid #333`, fontSize: "0.95rem", color: C.muted }}>
                        <span>Property mortgage insurance</span><span style={{ color: C.amber }}>{fmt(pmt.pmi)}</span>
                      </div>
                    )}
                    {pmt.pmi === 0 && <div style={{ borderBottom: `1px solid #333`, margin: "4px 0" }} />}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", fontSize: "0.95rem", fontWeight: 700, color: "#f0f0f0" }}>
                      <span>Total monthly commitments</span><span>{fmt(totalMo)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0 0", fontSize: "0.95rem", color: C.muted }}>
                      <span>Remaining monthly income</span>
                      <span style={{ color: remainColor }}>{fmt(remaining)}</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* ── Mobile pagination ── */}
        <div className="mc-pagination" style={{ marginTop: 5, position: "relative", width: 390, height: 32 }}>
          <div className="mc-dots" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "flex", gap: 8, alignItems: "center" }}>
            {[0, 1, 2].map(i => (
              <button key={i} className={"mc-dot" + (activePage === i ? " active" : "")} onClick={() => setActivePage(i)} />
            ))}
          </div>
          {activePage > 0 && (
            <div className="mc-pill-left" style={{ position: "absolute", left: 32, top: "50%", transform: "translateY(-50%)" }}>
              <button className="mc-pill-btn flipped" onClick={() => setActivePage(p => p - 1)}><ArrowIcon /></button>
            </div>
          )}
          {activePage < 2 && (
            <div className="mc-pill-right" style={{ position: "absolute", right: 32, top: "50%", transform: "translateY(-50%)" }}>
              <button className="mc-pill-btn" onClick={() => setActivePage(p => p + 1)}><ArrowIcon /></button>
            </div>
          )}
        </div>
      </div>

      {/* Fixed tooltip */}
      {tip && (
        <div className="g-tip" style={{ top: tip.y - 12, left: tip.x, transform: "translate(-50%, -100%)", zIndex: 99999 }}>
          {tip.text}
        </div>
      )}
    </>
  );
}