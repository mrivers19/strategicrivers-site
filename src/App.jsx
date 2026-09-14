import React, { useState, useEffect, useMemo } from 'react';

const CODE_TAXONOMY = {
  PSY: { title: "WSI System / Scanner", reg: "21 CFR 864.3700" },
  QKQ: { title: "WSI Image Viewing & Management SW", reg: "21 CFR 864.3700" },
  SIX: { title: "WSI Artifact Detection SW", reg: "21 CFR 864.3700" },
  QYV: { title: "Digital Cervical Cytology with AI", reg: "21 CFR 864.3900" },
  QPN: { title: "Pathology AI Cancer Detection SW", reg: "21 CFR 864.3750" },
  SFH: { title: "Pathology AI Cancer Prognosis SW", reg: "21 CFR 864.3755" },
  SHW: { title: "Pathology AI Breast Cancer Prognosis", reg: "21 CFR 864.3755" }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCodeFilter, setActiveCodeFilter] = useState("ALL");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [copiedStatus, setCopiedStatus] = useState(false);

  const parseFDADate = (item) => {
    const rawDate = item.decision_date || item.date_received || item.date_cleared || item.decision_date_land || "";
    if (rawDate && rawDate.length >= 8) {
      const cleanDate = rawDate.replace(/-/g, "");
      const y = cleanDate.slice(0, 4);
      const m = cleanDate.slice(4, 6);
      const d = cleanDate.slice(6, 8);
      return { formatted: `${y}-${m}-${d}`, year: y, timestamp: new Date(`${y}-${m}-${d}`).getTime() };
    }
    return { formatted: "Date Pending", year: "Unknown", timestamp: 0 };
  };

  const fetchAllFDAEndpoints = async () => {
    setLoading(true);
    try {
      const targetCodes = ["PSY", "QKQ", "SIX", "QYV", "QPN", "SFH", "SHW"];
      const searchParam = targetCodes.map(c => `product_code:${c}`).join('+');
      
      const endpoints = [
        `https://api.fda.gov/device/510k.json?search=${searchParam}&limit=250`,
        `https://api.fda.gov/device/denovo.json?search=${searchParam}&limit=100`,
        `https://api.fda.gov/device/pma.json?search=${searchParam}&limit=100`
      ];

      const responses = await Promise.all(
        endpoints.map(url => fetch(url).then(res => res.ok ? res.json() : { results: [] }).catch(() => ({ results: [] })))
      );

      const combinedResults = [];

      if (responses[0]?.results) {
        responses[0].results.forEach(item => {
          const { formatted, year, timestamp } = parseFDADate(item);
          combinedResults.push({
            k_number: item.k_number || "510(k)",
            applicant: item.applicant || "Unknown Sponsor",
            device_name: item.device_name || "Digital Pathology System",
            decision_date: formatted,
            year: year,
            timestamp: timestamp,
            product_code: item.product_code || "PSY",
            intended_use: item.statement_or_summary || "Premarket notification clearance for digital pathology device.",
            route: "510(k)"
          });
        });
      }

      if (responses[1]?.results) {
        responses[1].results.forEach(item => {
          const { formatted, year, timestamp } = parseFDADate(item);
          combinedResults.push({
            k_number: item.denovo_number || item.k_number || "De Novo",
            applicant: item.applicant || "Unknown Sponsor",
            device_name: item.device_name || "Digital Pathology AI System",
            decision_date: formatted,
            year: year,
            timestamp: timestamp,
            product_code: item.product_code || "QPN",
            intended_use: item.statement_or_summary || "De Novo classification grant for digital pathology algorithm/system.",
            route: "De Novo"
          });
        });
      }

      if (responses[2]?.results) {
        responses[2].results.forEach(item => {
          const { formatted, year, timestamp } = parseFDADate(item);
          combinedResults.push({
            k_number: item.pma_number || "PMA",
            applicant: item.applicant || "Unknown Sponsor",
            device_name: item.trade_name || item.device_name || "PMA Diagnostic System",
            decision_date: formatted,
            year: year,
            timestamp: timestamp,
            product_code: item.product_code || "PSY",
            intended_use: item.statement_or_summary || "Premarket approval for high-risk diagnostic pathology system.",
            route: "PMA"
          });
        });
      }

      const uniqueMap = new Map();
      combinedResults.forEach(r => {
        if (!uniqueMap.has(r.k_number)) {
          uniqueMap.set(r.k_number, r);
        }
      });

      const uniqueRecords = Array.from(uniqueMap.values());
      uniqueRecords.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(uniqueRecords);
    } catch (err) {
      console.error("Error executing multi-endpoint openFDA fetch:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllFDAEndpoints();
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchCode = activeCodeFilter === "ALL" || r.product_code === activeCodeFilter;
      const matchSearch = `${r.applicant} ${r.device_name} ${r.k_number} ${r.product_code} ${r.intended_use}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      return matchCode && matchSearch;
    });
  }, [records, activeCodeFilter, searchTerm]);

  const analyticsMatrix = useMemo(() => {
    const codes = ["PSY", "QKQ", "SIX", "QYV", "QPN", "SFH", "SHW"];
    const years = ["2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];

    const matrix = {};
    codes.forEach(c => {
      matrix[c] = {};
      years.forEach(y => { matrix[c][y] = 0; });
      matrix[c]["Total"] = 0;
    });

    records.forEach(r => {
      const c = r.product_code;
      const y = r.year;
      if (matrix[c]) {
        if (matrix[c][y] !== undefined) {
          matrix[c][y] += 1;
        }
        matrix[c]["Total"] += 1;
      }
    });

    return { matrix, years, codes };
  }, [records]);

  const copyMarkdownTable = () => {
    if (filteredRecords.length === 0) return;
    let md = `| Manufacturer / Applicant | Clearance Date | ID / K-Number | Category Code | Description / Device Name | FDA Link |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;
    filteredRecords.forEach(r => {
      const fdaLink = `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${r.k_number}`;
      md += `| ${r.applicant} | ${r.decision_date} | ${r.k_number} | ${r.product_code} | ${r.device_name} | [FDA Link](${fdaLink}) |\n`;
    });
    navigator.clipboard.writeText(md);
    setCopiedStatus(true);
    setTimeout(() => setCopiedStatus(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans flex flex-col antialiased">
      {/* Prominent Executive Header */}
      <header className="bg-[#1e293b]/95 backdrop-blur-md border-b border-slate-800 px-6 py-6 sticky top-0 z-30 shadow-xl">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="cursor-pointer flex flex-col gap-1" onClick={() => setActiveTab('overview')}>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Rivers Strategic Advisors <span className="text-teal-400 font-mono text-lg md:text-xl font-medium">LLC</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-400 font-mono tracking-wide">
              Digital Diagnostics & Commercialization Advisory
            </p>
          </div>

          <nav className="flex items-center gap-2 bg-[#0f172a] p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`text-xs md:text-sm px-5 py-2.5 rounded-lg font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-slate-800 text-teal-400 shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Practice Overview
            </button>
            <button
              onClick={() => setActiveTab('radar')}
              className={`text-xs md:text-sm px-5 py-2.5 rounded-lg font-semibold transition ${
                activeTab === 'radar'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Regulatory Radar Tool
            </button>
          </nav>
        </div>
      </header>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="flex-1 max-w-[1400px] w-full mx-auto p-6 md:p-10 flex flex-col gap-12">
          
          {/* Hero Section */}
          <section className="bg-gradient-to-b from-[#1e293b] to-[#0f172a] p-8 md:p-12 rounded-2xl border border-slate-800 shadow-xl flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono bg-teal-950/80 text-teal-300 border border-teal-500/30 px-3 py-1 rounded-full">
                Strategic Advisory & Governance
              </span>
              <span className="text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-full">
                Sunnyvale, CA
              </span>
            </div>

            <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight max-w-4xl">
              Commercial Strategy & Strategic Positioning in Digital Pathology
            </h2>

            <p className="text-slate-300 text-base md:text-lg leading-relaxed max-w-3xl">
              Guiding early-stage innovators, corporate boards, and diagnostic leaders through market entry, 
              regulatory label strategies (IVD vs. RUO), and the evolving economics of digital diagnostics.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                onClick={() => setActiveTab('radar')}
                className="bg-teal-600 hover:bg-teal-500 text-white px-5 py-3 rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-teal-950/50"
              >
                Launch Regulatory Radar Tool →
              </button>
              <a
                href="mailto:michael@strategicrivers.com"
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-5 py-3 rounded-xl text-sm font-medium transition"
              >
                Contact Me
              </a>
              <a
                href="https://www.linkedin.com/in/michael-rivers-digitalpathology"
                target="_blank"
                rel="noreferrer"
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-3 rounded-xl text-sm font-medium transition flex items-center gap-2"
                title="LinkedIn Profile"
              >
                <svg className="w-4 h-4 fill-current text-teal-400" viewBox="0 0 24 24">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.72a1.47 1.47 0 1 0 0 2.94 1.47 1.47 0 0 0 0-2.94Z"/>
                </svg>
                LinkedIn
              </a>
            </div>
          </section>

          {/* Strategic Focus Areas */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-800 flex flex-col gap-3">
              <h3 className="text-lg font-bold text-white">Commercial Strategy & Market Entry</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Structuring go-to-market execution, global distribution strategy, and regulatory label positioning (IVD vs. RUO) to maximize commercial adoption.
              </p>
            </div>

            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-800 flex flex-col gap-3">
              <h3 className="text-lg font-bold text-white">Corporate Advisory & Board Work</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Providing executive mentorship, product roadmap alignment, and strategic positioning for digital pathology startups and diagnostic innovators.
              </p>
            </div>

            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-800 flex flex-col gap-3">
              <h3 className="text-lg font-bold text-white">Market Access & Commercial Economics</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Navigating customer adoption drivers, CPT add-on code frameworks, and economic trends shaping hospital and laboratory purchasing decisions.
              </p>
            </div>
          </section>

          {/* Industry Leadership Section */}
          <section className="bg-[#1e293b] p-8 rounded-2xl border border-slate-800 flex flex-col gap-6">
            <h3 className="text-base font-bold text-white uppercase tracking-wider">Industry Leadership</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-[#0f172a] p-4 rounded-xl border border-slate-800 flex flex-col gap-1">
                <span className="text-teal-400 font-semibold">Co-Chair & Founder</span>
                <span className="text-white font-medium">Digital Pathology Association Reimbursement Task Force</span>
              </div>
              <div className="bg-[#0f172a] p-4 rounded-xl border border-slate-800 flex flex-col gap-1">
                <span className="text-teal-400 font-semibold">Lead</span>
                <span className="text-white font-medium">DPA Annual Reimbursement Workshop (Pathology Visions)</span>
              </div>
              <div className="bg-[#0f172a] p-4 rounded-xl border border-slate-800 flex flex-col gap-1">
                <span className="text-teal-400 font-semibold">Board Member & Officer</span>
                <span className="text-white font-medium">Digital Pathology Association & President, DPA Foundation</span>
              </div>
              <div className="bg-[#0f172a] p-4 rounded-xl border border-slate-800 flex flex-col gap-1">
                <span className="text-teal-400 font-semibold">20+ Years Medical Diagnostics Leadership</span>
                <span className="text-white font-medium">Former VP of Digital Pathology Lifecycle, Roche</span>
              </div>
            </div>
          </section>

          {/* Matrix Widget */}
          <section className="bg-[#1e293b] rounded-2xl border border-slate-800 p-6 md:p-8 shadow-md flex flex-col gap-5">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-slate-800 pb-5">
              <div>
                <span className="text-xs font-mono text-teal-400 uppercase tracking-wider font-semibold">
                  Live Market Intelligence
                </span>
                <h3 className="text-xl font-bold text-white mt-1">Digital Pathology Regulatory Matrix (2017–2026)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Real-time FDA clearance volumes across core product codes (PSY, QKQ, SIX, QYV, QPN, SFH, SHW)</p>
              </div>
              <button
                onClick={() => setActiveTab('radar')}
                className="text-xs bg-teal-950 text-teal-300 border border-teal-500/40 hover:bg-teal-900/60 px-4 py-2 rounded-lg font-medium transition self-start md:self-auto"
              >
                Explore Full Database ({records.length} Records) →
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800/60 text-slate-400 font-semibold border-b border-slate-700/80">
                    <th className="py-2.5 px-3">Code</th>
                    <th className="py-2.5 px-3">Category Title</th>
                    {analyticsMatrix.years.slice(-5).map(y => (
                      <th key={y} className="py-2.5 px-3 text-center">{y}</th>
                    ))}
                    <th className="py-2.5 px-3 text-right font-bold text-teal-400">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {analyticsMatrix.codes.map(code => (
                    <tr key={code} className="hover:bg-slate-800/30 transition">
                      <td className="py-2 px-3 font-mono font-bold text-teal-400">{code}</td>
                      <td className="py-2 px-3 font-medium text-white">{CODE_TAXONOMY[code]?.title}</td>
                      {analyticsMatrix.years.slice(-5).map(y => (
                        <td key={y} className="py-2 px-3 text-center font-mono">
                          {analyticsMatrix.matrix[code][y] > 0 ? (
                            <span className="bg-teal-950 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/30 font-bold">
                              {analyticsMatrix.matrix[code][y]}
                            </span>
                          ) : (
                            <span className="text-slate-600">0</span>
                          )}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right font-mono font-bold text-teal-400">
                        {analyticsMatrix.matrix[code]["Total"]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      )}

      {/* RADAR TOOL TAB */}
      {activeTab === 'radar' && (
        <main className="flex-1 max-w-[1600px] w-full mx-auto p-6 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#1e293b] p-6 rounded-2xl border border-slate-800">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                Digital Pathology Regulatory Radar
                <span className="text-xs bg-slate-800 text-teal-400 px-2.5 py-1 rounded-full border border-teal-500/20 font-mono">Live FDA Feed</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">Multi-endpoint ingestion (510k, De Novo, PMA) across PSY, QKQ, SIX, QYV, QPN, SFH, SHW</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={copyMarkdownTable}
                className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2.5 rounded-lg text-xs font-semibold transition"
              >
                {copiedStatus ? "Copied Markdown!" : "Export Table"}
              </button>
              <button
                onClick={fetchAllFDAEndpoints}
                disabled={loading}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition text-xs font-mono"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="bg-[#1e293b] p-5 rounded-2xl border border-slate-800 shadow-sm">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              Summary Matrix: Clearances by Category & Year (2017–2026)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                    <th className="py-2.5 px-3">Category Code</th>
                    <th className="py-2.5 px-3">Title & Regulation Scope</th>
                    {analyticsMatrix.years.map(y => (
                      <th key={y} className="py-2.5 px-3 text-center">{y}</th>
                    ))}
                    <th className="py-2.5 px-3 text-right text-teal-400 font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {analyticsMatrix.codes.map(code => (
                    <tr key={code} className="hover:bg-slate-800/40 transition">
                      <td className="py-2 px-3 font-mono font-bold text-teal-400">{code}</td>
                      <td className="py-2 px-3 text-slate-300">
                        <span className="font-medium text-white">{CODE_TAXONOMY[code]?.title}</span>
                        <span className="text-slate-500 text-[11px] ml-2">({CODE_TAXONOMY[code]?.reg})</span>
                      </td>
                      {analyticsMatrix.years.map(y => (
                        <td key={y} className="py-2 px-3 text-center font-mono">
                          {analyticsMatrix.matrix[code][y] > 0 ? (
                            <span className="bg-teal-950/80 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/30 font-bold">
                              {analyticsMatrix.matrix[code][y]}
                            </span>
                          ) : (
                            <span className="text-slate-600">0</span>
                          )}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right font-mono font-bold text-teal-400">
                        {analyticsMatrix.matrix[code]["Total"]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#1e293b] p-4 rounded-xl border border-slate-800 shadow-sm flex flex-col gap-3">
            <input
              type="text"
              placeholder="Search by Manufacturer, Device Description, K-Number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">Filter Code:</span>
              <button
                onClick={() => setActiveCodeFilter("ALL")}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${
                  activeCodeFilter === "ALL"
                    ? "bg-teal-500/20 border-teal-500 text-teal-300 font-medium"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                }`}
              >
                ALL CODES
              </button>
              {Object.keys(CODE_TAXONOMY).map(code => (
                <button
                  key={code}
                  onClick={() => setActiveCodeFilter(code)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition font-mono ${
                    activeCodeFilter === code
                      ? "bg-teal-500/20 border-teal-500 text-teal-300 font-bold"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#1e293b] border border-slate-800 rounded-xl overflow-hidden shadow-sm flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 text-slate-400 font-semibold text-xs border-b border-slate-700 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Manufacturer / Applicant</th>
                    <th className="py-3.5 px-4">Clearance Date & K-Number</th>
                    <th className="py-3.5 px-4">Category Code</th>
                    <th className="py-3.5 px-4">Description / Device Name</th>
                    <th className="py-3.5 px-4 text-right">FDA CDRH Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        Loading live openFDA dataset...
                      </td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        No clearances match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((item, idx) => (
                      <tr 
                        key={idx}
                        onClick={() => setSelectedRecord(item)}
                        className="hover:bg-slate-800/50 transition cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-semibold text-white">{item.applicant}</td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                          {item.decision_date}
                          <span className="text-teal-400 font-bold block mt-0.5">{item.k_number}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          <span className="bg-teal-950/80 text-teal-300 px-2.5 py-1 rounded border border-teal-500/30 text-xs font-bold">
                            {item.product_code}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-[380px]">
                          <div className="font-medium text-slate-100">{item.device_name}</div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">{item.intended_use}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${item.k_number}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-xs text-teal-400 hover:text-teal-300 bg-slate-800 px-2.5 py-1.5 rounded border border-slate-700 transition"
                          >
                            FDA Record →
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* Detail Slide Drawer */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-xl bg-[#1e293b] border-l border-slate-700 shadow-2xl flex flex-col h-full">
            <div className="p-6 border-b border-slate-700 flex items-start justify-between bg-[#0f172a]">
              <div>
                <span className="text-xs font-mono text-teal-400 bg-teal-950 px-2.5 py-1 rounded border border-teal-500/30">
                  {selectedRecord.product_code} | {selectedRecord.k_number}
                </span>
                <h2 className="text-xl font-bold text-white mt-2">{selectedRecord.device_name}</h2>
                <p className="text-sm text-slate-400 mt-0.5">{selectedRecord.applicant}</p>
              </div>
              <button 
                onClick={() => setSelectedRecord(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0f172a] p-3 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-500 uppercase font-semibold">Clearance Date</span>
                  <p className="text-sm font-mono text-slate-200 mt-0.5">{selectedRecord.decision_date}</p>
                </div>
                <div className="bg-[#0f172a] p-3 rounded-lg border border-slate-800">
                  <span className="text-xs text-slate-500 uppercase font-semibold">CFR Regulation</span>
                  <p className="text-sm font-medium text-teal-400 mt-0.5">
                    {CODE_TAXONOMY[selectedRecord.product_code]?.reg || "21 CFR 864"}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  FDA Summary / Intended Use Statement
                </h3>
                <div className="bg-[#0f172a] p-4 rounded-lg border border-slate-800 text-sm text-slate-300 leading-relaxed">
                  {selectedRecord.intended_use}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 bg-[#0f172a] flex items-center justify-between">
              <a
                href={`https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${selectedRecord.k_number}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-teal-400 hover:text-teal-300"
              >
                Open Official FDA CDRH Page →
              </a>
              <button
                onClick={() => setSelectedRecord(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-xs font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#0f172a] px-6 py-6 text-center text-xs text-slate-500 font-mono">
        © {new Date().getFullYear()} Rivers Strategic Advisors LLC. All rights reserved. | Sunnyvale, California
      </footer>
    </div>
  );
}