import { useState, useEffect, useCallback } from 'react';
import { fetchHealth } from './lib';
import TransactionPanel from './components/TransactionPanel';
import BlockPanel from './components/BlockPanel';

type Tab = 'tx' | 'block';

function App() {
  const [tab, setTab] = useState<Tab>('tx');
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth().then(ok => setHealth(ok ? 'online' : 'offline'));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  return (
    <>
      {/* Decorative gradient orbs */}
      <div className="orb-1" />
      <div className="orb-2" />

      {/* Accent stripe */}
      <div className="accent-bar" />

      {/* Header */}
      <header className="header">
        <div className="logo" onClick={() => setTab('tx')}>
          <div className="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <text x="12" y="18" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="900" fill="#fff">₿</text>
            </svg>
          </div>
          <div className="logo-text">Chain<span>Lens</span></div>
        </div>
        <div className="header-right">
          <span className="header-tagline">Bitcoin Explorer</span>
        </div>
      </header>

      {/* Main */}
      <div className="container">
        {/* Hero Section */}
        <div className="hero-section">
          <h1 className="hero-title">Decode Bitcoin Transactions</h1>
          <p className="hero-subtitle">
            Paste raw transaction data or upload block files to explore the blockchain with interactive visualizations and plain-English explanations.
          </p>
          <div className="hero-features">
            <div className="hero-feature stagger-1">
              <span className="hero-feature-icon">⇄</span>
              <div className="hero-feature-title">Interactive Flow</div>
              <div className="hero-feature-desc">Visual diagrams showing value flowing from inputs to outputs</div>
            </div>
            <div className="hero-feature stagger-2">
              <span className="hero-feature-icon">🔍</span>
              <div className="hero-feature-title">Deep Analysis</div>
              <div className="hero-feature-desc">Script types, fees, SegWit savings, and more in plain English</div>
            </div>
            <div className="hero-feature stagger-3">
              <span className="hero-feature-icon">▦</span>
              <div className="hero-feature-title">Block Explorer</div>
              <div className="hero-feature-desc">Upload raw block files to analyze thousands of transactions</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs-wrap">
          <button className={`tab-btn ${tab === 'tx' ? 'active' : ''}`} onClick={() => setTab('tx')}>
            <span className="tab-icon">⇄</span> Transactions
          </button>
          <button className={`tab-btn ${tab === 'block' ? 'active' : ''}`} onClick={() => setTab('block')}>
            <span className="tab-icon">▦</span> Blocks
          </button>
        </div>

        {tab === 'tx' && <TransactionPanel showToast={showToast} />}
        {tab === 'block' && <BlockPanel showToast={showToast} />}
      </div>

      {/* Footer */}
      <footer className="footer">
        Built with ♥ for <span>Summer of Bitcoin 2026</span>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

export default App;
