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
      console.error("Error fetching openFDA data:", err);
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

  const styles = {
    wrapper: {
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    },
    header: {
      backgroundColor: '#1e293b',
      borderBottom: '1px solid #334155',
      padding: '20px 32px',
      position: 'sticky',
      top: 0,
      zIndex: 30,
      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)'
    },
    headerContainer: {
      maxWidth: '1400px',
      margin: '0 auto',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '16px'
    },
    title: {
      fontSize: '24px',
      fontWeight: '800',
      color: '#ffffff',
      margin: 0
    },
    subtitle: {
      fontSize: '13px',
      color: '#94a3b8',
      margin: '4px 0 0 0',
      fontFamily: 'monospace'
    },
    navGroup: {
      display: 'flex',
      gap: '8px',
      backgroundColor: '#0f172a',
      padding: '6px',
      borderRadius: '10px',
      border: '1px solid #334155'
    },
    navBtn: (active) => ({
      padding: '10px 20px',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: '600',
      border: 'none',
      cursor: 'pointer',
      backgroundColor: active ? '#0d9488' : 'transparent',
      color: active ? '#ffffff' : '#94a3b8',
      transition: 'all 0.2s ease'
    }),
    container: {
      maxWidth: '1400px',
      width: '100%',
      margin: '0 auto',
      padding: '40px 24px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '32px'
    },
    hero: {
      backgroundColor: '#1e293b',
      borderRadius: '16px',
      border: '1px solid #334155',
      padding: '40px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: '#134e4a',
      color: '#2dd4bf',
      border: '1px solid #0d9488',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      fontFamily: 'monospace'
    },
    heroTitle: {
      fontSize: '36px',
      fontWeight: '800',
      color: '#ffffff',
      lineHeight: '1.2',
      margin: 0
    },
    heroDesc: {
      fontSize: '16px',
      color: '#cbd5e1',
      lineHeight: '1.6',
      margin: 0,
      maxWidth: '900px'
    },
    btnGroup: {
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
      marginTop: '8px'
    },
    primaryBtn: {
      backgroundColor: '#0d9488',
      color: '#ffffff',
      padding: '12px 24px',
      borderRadius: '8px',
      fontWeight: '600',
      fontSize: '14px',
      border: 'none',
      cursor: 'pointer'
    },
    secondaryBtn: {
      backgroundColor: '#334155',
      color: '#f8fafc',
      padding: '12px 24px',
      borderRadius: '8px',
      fontWeight: '600',
      fontSize: '14px',
      textDecoration: 'none',
      display: 'inline-block'
    },
    grid3: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '20px'
    },
    card: {
      backgroundColor: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    },
    cardTitle: {
      fontSize: '18px',
      fontWeight: '700',
      color: '#ffffff',
      margin: 0
    },
    cardText: {
      fontSize: '14px',
      color: '#94a3b8',
      lineHeight: '1.5',
      margin: 0
    },
    tableCard: {
      backgroundColor: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '24px',
      overflowX: 'auto'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      textAlign: 'left',
      fontSize: '13px'
    },
    th: {
      backgroundColor: '#0f172a',
      color: '#94a3b8',
      padding: '12px',
      borderBottom: '1px solid #334155',
      fontWeight: '600'
    },
    td: {
      padding: '12px',
      borderBottom: '1px solid #334155',
      color: '#cbd5e1'
    },
    input: {
      width: '100%',
      backgroundColor: '#0f172a',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '12px 16px',
      color: '#ffffff',
      fontSize: '14px',
      boxSizing: 'border-box'
    },
    drawer: {
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      maxWidth: '500px',
      backgroundColor: '#1e293b',
      borderLeft: '1px solid #334155',
      boxShadow: '-10px 0 25px rgba(0,0,0,0.5)',
      zIndex: 50,
      padding: '32px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Executive Header */}
      <header style={styles.header}>
        <div style={styles.headerContainer}>
          <div>
            <h1 style={styles.title}>
              Rivers Strategic Advisors <span style={{ color: '#2dd4bf' }}>LLC</span>
            </h1>
            <p style={styles.subtitle}>Digital Diagnostics & Commercialization Advisory | Sunnyvale, CA</p>
          </div>

          <div style={styles.navGroup}>
            <button
              onClick={() => setActiveTab('overview')}
              style={styles.navBtn(activeTab === 'overview')}
            >
              Practice Overview
            </button>
            <button
              onClick={() => setActiveTab('radar')}
              style={styles.navBtn(activeTab === 'radar')}
            >
              Regulatory Radar Tool
            </button>
          </div>
        </div>
      </header>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <main style={styles.container}>
          <section style={styles.hero}>
            <span style={styles.badge}>Strategic Advisory & Governance</span>
            <h2 style={styles.heroTitle}>
              Commercial Strategy & Strategic Positioning in Digital Pathology
            </h2>
            <p style={styles.heroDesc}>
              Guiding early-stage innovators, corporate boards, and diagnostic leaders through market entry, 
              regulatory label strategies (IVD vs. RUO), and the evolving commercial economics of digital diagnostics.
            </p>
            <div style={styles.btnGroup}>
              <button onClick={() => setActiveTab('radar')} style={styles.primaryBtn}>
                Launch Regulatory Radar Tool →
              </button>
              <a href="mailto:michael@strategicrivers.com" style={styles.secondaryBtn}>
                Contact Advisor
              </a>
              <a 
                href="https://www.linkedin.com/in/michael-rivers-digitalpathology" 
                target="_blank" 
                rel="noreferrer" 
                style={styles.secondaryBtn}
              >
                LinkedIn Profile
              </a>
            </div>
          </section>

          <section style={styles.grid3}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Commercial Strategy & Market Entry</h3>
              <p style={styles.cardText}>
                Structuring go-to-market execution, global distribution strategy, and regulatory label positioning (IVD vs. RUO) to maximize commercial adoption.
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Corporate Advisory & Board Work</h3>
              <p style={styles.cardText}>
                Providing executive mentorship, product roadmap alignment, and strategic positioning for digital pathology startups and diagnostic innovators.
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Market Access & Commercial Economics</h3>
              <p style={styles.cardText}>
                Navigating customer adoption drivers, CPT add-on code frameworks, and economic trends shaping hospital and laboratory purchasing decisions.
              </p>
            </div>
          </section>

          <section style={styles.tableCard}>
            <h3 style={{ ...styles.cardTitle, marginBottom: '16px' }}>
              Live Digital Pathology FDA Clearances Summary (2017–2026)
            </h3>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Code</th>
                  <th style={styles.th}>Category Title</th>
                  <th style={styles.th}>CFR Regulation</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Total Clearances</th>
                </tr>
              </thead>
              <tbody>
                {analyticsMatrix.codes.map(code => (
                  <tr key={code}>
                    <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 'bold', color: '#2dd4bf' }}>{code}</td>
                    <td style={{ ...styles.td, color: '#ffffff', fontWeight: '500' }}>{CODE_TAXONOMY[code]?.title}</td>
                    <td style={styles.td}>{CODE_TAXONOMY[code]?.reg}</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#2dd4bf' }}>
                      {analyticsMatrix.matrix[code]["Total"]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      )}

      {/* RADAR TOOL TAB */}
      {activeTab === 'radar' && (
        <main style={styles.container}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ ...styles.cardTitle, fontSize: '24px' }}>Digital Pathology Regulatory Radar</h2>
              <p style={styles.cardText}>Real-time FDA openFDA multi-endpoint feed across core pathology product codes</p>
            </div>
            <div style={styles.btnGroup}>
              <button onClick={copyMarkdownTable} style={styles.primaryBtn}>
                {copiedStatus ? "Copied Markdown!" : "Export Table"}
              </button>
              <button onClick={fetchAllFDAEndpoints} style={styles.secondaryBtn}>
                {loading ? "Refreshing..." : "Refresh Feed"}
              </button>
            </div>
          </div>

          <input
            type="text"
            placeholder="Search by Manufacturer, Device Description, K-Number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.input}
          />

          <div style={styles.tableCard}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Manufacturer / Applicant</th>
                  <th style={styles.th}>Clearance Date & ID</th>
                  <th style={styles.th}>Code</th>
                  <th style={styles.th}>Device Description</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ ...styles.td, textAlign: 'center', padding: '40px' }}>Loading openFDA data...</td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...styles.td, textAlign: 'center', padding: '40px' }}>No clearances match search query.</td>
                  </tr>
                ) : (
                  filteredRecords.map((item, idx) => (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedRecord(item)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ ...styles.td, color: '#ffffff', fontWeight: 'bold' }}>{item.applicant}</td>
                      <td style={{ ...styles.td, fontFamily: 'monospace' }}>
                        {item.decision_date} <span style={{ color: '#2dd4bf', display: 'block' }}>{item.k_number}</span>
                      </td>
                      <td style={{ ...styles.td, fontFamily: 'monospace', color: '#2dd4bf', fontWeight: 'bold' }}>{item.product_code}</td>
                      <td style={styles.td}>{item.device_name}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <a 
                          href={`https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${item.k_number}`}
                          target="_blank" 
                          rel="noreferrer"
                          style={{ color: '#2dd4bf', textDecoration: 'none', fontSize: '12px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          FDA Link →
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* Slide Drawer */}
      {selectedRecord && (
        <div style={styles.drawer}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={styles.badge}>{selectedRecord.product_code} | {selectedRecord.k_number}</span>
            <button onClick={() => setSelectedRecord(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>
          <h2 style={{ ...styles.cardTitle, fontSize: '20px' }}>{selectedRecord.device_name}</h2>
          <p style={styles.cardText}>{selectedRecord.applicant}</p>
          <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Summary Statement</span>
            <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5', marginTop: '8px' }}>{selectedRecord.intended_use}</p>
          </div>
          <a 
            href={`https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${selectedRecord.k_number}`}
            target="_blank" 
            rel="noreferrer"
            style={{ ...styles.primaryBtn, textAlign: 'center', textDecoration: 'none', marginTop: 'auto' }}
          >
            Open Official CDRH Record
          </a>
        </div>
      )}

      <footer style={{ padding: '24px', borderTop: '1px solid #334155', textAlign: 'center', fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
        © {new Date().getFullYear()} Rivers Strategic Advisors LLC. All rights reserved. | Sunnyvale, California
      </footer>
    </div>
  );
}