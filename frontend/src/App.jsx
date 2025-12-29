import React, { useEffect, useState } from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsConfig from './amplify-config';
import { listEnvs, createEnv, deleteEnv, listRepos, getConfig, saveConfig, deployEnv } from './api';
import './App.css';

Amplify.configure(awsConfig);

const DEV_BYPASS_AUTH = true; // Set to false to enable Cognito

function SettingsModal({ isOpen, onClose, onSave, loading }) {
  const [formData, setFormData] = useState({
    appId: '',
    installationId: '',
    privateKey: '',
    clientSecret: ''
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = () => {
    onSave(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>⚙️ GitHub App Configuration</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>App ID</label>
            <input name="appId" value={formData.appId} onChange={handleChange} placeholder="e.g. 123456" />
          </div>
          <div className="form-group">
            <label>Installation ID</label>
            <input name="installationId" value={formData.installationId} onChange={handleChange} placeholder="e.g. 87654321" />
          </div>
          <div className="form-group">
            <label>Private Key</label>
            <textarea name="privateKey" value={formData.privateKey} onChange={handleChange} placeholder="-----BEGIN RSA PRIVATE KEY-----..." />
          </div>
          <div className="form-group">
            <label>Client Secret (Optional)</label>
            <input name="clientSecret" type="password" value={formData.clientSecret} onChange={handleChange} placeholder="************" />
          </div>
          <div className="form-actions">
            <button onClick={onClose} className="secondary-btn">Cancel</button>
            <button onClick={handleSubmit} className="primary-btn" disabled={loading}>
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ signOut, user }) {
  const [envs, setEnvs] = useState([]);
  const [repos, setRepos] = useState([]);
  // Multi-service state: [{ repo: '', branch: '', buildspec: 'buildspec.yml', appspec: 'appspec.yml' }]
  const [services, setServices] = useState([{ repo: '', branch: '', buildspec: 'buildspec.yml', appspec: 'appspec.yml' }]);
  const [envName, setEnvName] = useState('');
  const [stopTime, setStopTime] = useState('18:00');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      try {
        // Check Config Status
        const configRes = await getConfig();
        setIsConfigured(configRes.data.configured);

        const envRes = await listEnvs();
        setEnvs(envRes.data);

        if (configRes.data.configured) {
          const repoRes = await listRepos();
          setRepos(repoRes.data);
        }
      } catch (apiErr) {
        if (DEV_BYPASS_AUTH) {
          console.warn("API failed, using mock data for development preview");
          setEnvs([
            {
              StackId: '1',
              StackName: 'dev-stack-active',
              Status: 'RUNNING',
              PublicIP: '1.2.3.4',
              CreatedAt: new Date().toISOString(),
              Services: [
                { Repo: 'user/repo-a', Branch: 'feature/login' }
              ]
            },
            {
              StackId: '2',
              StackName: 'dev-stack-history',
              Status: 'ARCHIVED',
              CreatedAt: new Date().toISOString(),
              DeletedAt: new Date().toISOString(),
              Services: [
                { Repo: 'user/repo-b', Branch: 'main' }
              ]
            }
          ]);
          setRepos([
            { id: 1, full_name: 'user/repo-a' },
            { id: 2, full_name: 'user/backend' }
          ]);
          setIsConfigured(true);
        } else {
          throw apiErr;
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Split Active vs Archived
  const activeEnvs = envs.filter(e => e.Status !== 'ARCHIVED');
  const archivedEnvs = envs.filter(e => e.Status === 'ARCHIVED');

  const handleSaveConfig = async (formData) => {
    setLoading(true);
    try {
      if (DEV_BYPASS_AUTH) {
        alert('[DEV] Config Saved: ' + JSON.stringify(formData));
        setIsConfigured(true);
        setShowSettings(false);
      } else {
        await saveConfig(formData);
        alert('Configuration saved successfully!');
        setIsConfigured(true);
        setShowSettings(false);
        fetchData(); // Refresh repos
      }
    } catch (err) {
      alert('Failed to save config: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddService = () => {
    setServices([...services, { repo: '', branch: '', buildspec: 'buildspec.yml', appspec: 'appspec.yml' }]);
  };

  const handleRemoveService = (index) => {
    const newServices = [...services];
    newServices.splice(index, 1);
    setServices(newServices);
  };

  const handleServiceChange = (index, field, value) => {
    const newServices = [...services];
    newServices[index][field] = value;
    setServices(newServices);
  };

  const handleCreate = async () => {
    if (services.some(s => !s.repo || !s.branch)) return alert('Please fill in all repo and branch fields');

    setLoading(true);
    try {
      if (DEV_BYPASS_AUTH) {
        alert(`[DEV] Create Env: ${envName} (Stop: ${stopTime}) with services: ${JSON.stringify(services)}`);
        // Mock adding it to list
        setEnvs(prev => [{
          StackId: Date.now().toString(),
          StackName: envName || `stack-${Date.now()}`,
          Alias: envName,
          StopTime: stopTime,
          Status: 'CREATING',
          PublicIP: null,
          CreatedAt: new Date().toISOString(),
          Services: services.map(s => ({ Repo: s.repo, Branch: s.branch }))
        }, ...prev]);
      } else {
        // API expects { services, name, stopTime }
        await createEnv(services, envName, stopTime);
        await fetchData();
      }
      // Reset form
      setServices([{ repo: '', branch: '', buildspec: 'buildspec.yml', appspec: 'appspec.yml' }]);
      setEnvName('');
      setStopTime('18:00');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async (env) => {
    // env: { StackName, Services, ... }
    if (!confirm(`Trigger deployment pipeline for ${env.StackName}?`)) return;
    setLoading(true);
    try {
      if (DEV_BYPASS_AUTH) {
        alert(`[DEV] Deployed ${env.StackName}`);
      } else {
        await deployEnv(env.StackName, env.Services);
        alert('Deployment triggered! Pipeline will start shortly.');
      }
    } catch (err) {
      alert('Deploy failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (stackId, type = 'archive') => {
    const action = type === 'permanent' ? 'Permanently Delete' : 'Archive (Terminate)';
    if (!confirm(`Are you sure you want to ${action}?`)) return;
    try {
      if (DEV_BYPASS_AUTH) {
        if (type === 'permanent') {
          setEnvs(prev => prev.filter(e => e.StackId !== stackId));
        } else {
          setEnvs(prev => prev.map(e => e.StackId === stackId ? { ...e, Status: 'ARCHIVED', DeletedAt: new Date().toISOString() } : e));
        }
      } else {
        await deleteEnv(stackId, type);
        fetchData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRelaunch = (env) => {
    if (env.Services) {
      // Map DB keys to Form keys if necessary (or just use what's there if compliant)
      // DB usually caps RepoName etc, but services list is JSON from input.
      // Let's assume input format is preserved.
      const mapped = env.Services.map(s => ({
        repo: s.repo || s.Repo,
        branch: s.branch || s.Branch,
        buildspec: s.buildspec || s.Buildspec || 'buildspec.yml',
        appspec: s.appspec || s.Appspec || 'appspec.yml'
      }));
      setServices(mapped);
      alert('Configuration loaded! Please review and click Launch.');
      window.scrollTo(0, 0); // Scroll to top
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Branch Box 📦 {DEV_BYPASS_AUTH && <span style={{ fontSize: '0.8em', color: 'orange' }}>(Dev Mode)</span>}</h1>
        <div className="user-info">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            <span className={`status-indicator ${isConfigured ? 'configured' : 'missing'}`}></span>
            Settings
          </button>
          <span>Hello, {user?.username}</span>
          <button onClick={signOut} className="sign-out-btn">Sign out</button>
        </div>
      </header>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveConfig}
        loading={loading}
      />

      <main className="dashboard-content">
        {!isConfigured && !DEV_BYPASS_AUTH && (
          <div className="card" style={{ borderLeft: '4px solid orange' }}>
            <h3>⚠️ Configuration Required</h3>
            <p>Please configure your GitHub App credentials in Settings to list repositories.</p>
            <button onClick={() => setShowSettings(true)} className="primary-btn">Open Settings</button>
          </div>
        )}

        <section className="create-section card">
          <h2>🚀 Launch New Environment</h2>

          <div className="env-config-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9em', color: '#666' }}>Environment Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Project Alpha Demo"
                value={envName}
                onChange={(e) => setEnvName(e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9em', color: '#666' }}>Auto Stop Time (KST)</label>
              <select
                value={stopTime}
                onChange={(e) => setStopTime(e.target.value)}
                className="input-field"
                style={{ width: '100%' }}
              >
                <option value="">Disabled (Run Forever)</option>
                {Array.from({ length: 24 }).map((_, i) => {
                  const t = i.toString().padStart(2, '0') + ':00';
                  return <option key={t} value={t}>{t}</option>;
                })}
              </select>
            </div>
          </div>

          <div className="services-form">
            {services.map((service, index) => (
              <div key={index} className="service-row-container">
                <div className="service-row">
                  <select
                    value={service.repo}
                    onChange={e => handleServiceChange(index, 'repo', e.target.value)}
                    disabled={loading || (!isConfigured && !DEV_BYPASS_AUTH)}
                    className="input-field"
                  >
                    <option value="">Select Repository</option>
                    {repos.map(r => <option key={r.id} value={r.full_name}>{r.full_name}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Branch Name"
                    value={service.branch}
                    onChange={e => handleServiceChange(index, 'branch', e.target.value)}
                    disabled={loading}
                    className="input-field"
                  />
                  <input
                    type="text"
                    placeholder="Buildspec (def: buildspec.yml)"
                    value={service.buildspec}
                    onChange={e => handleServiceChange(index, 'buildspec', e.target.value)}
                    disabled={loading}
                    className="input-field spec-input"
                  />
                  <input
                    type="text"
                    placeholder="Appspec (def: appspec.yml)"
                    value={service.appspec}
                    onChange={e => handleServiceChange(index, 'appspec', e.target.value)}
                    disabled={loading}
                    className="input-field spec-input"
                  />
                  {services.length > 1 && (
                    <button onClick={() => handleRemoveService(index)} className="icon-btn delete-icon" title="Remove Service">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button onClick={handleAddService} className="secondary-btn" disabled={loading}>+ Add Service</button>
            <button onClick={handleCreate} disabled={loading} className="primary-btn">
              {loading ? 'Launching...' : 'Launch Environment'}
            </button>
          </div>
        </section>

        {/* ACTIVE ENVIRONMENTS */}
        <section className="env-list-section card">
          <div className="section-header">
            <h2>Active Environments ({activeEnvs.length})</h2>
            <button onClick={fetchData} className="icon-btn" disabled={refreshing}>
              {refreshing ? '↻' : '↻ Refresh'}
            </button>
          </div>

          <div className="env-grid">
            {activeEnvs.length === 0 ? (
              <div className="empty-state">No active environments. Launch one above!</div>
            ) : (
              activeEnvs.map((env) => (
                <div key={env.StackId} className={`env-card status-${env.Status?.toLowerCase()}`}>
                  <div className="env-header">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="env-id" style={{ fontSize: '1.1em', fontWeight: 'bold' }}>
                        {env.Alias || env.StackName || env.StackId?.substring(0, 8)}
                      </span>
                      <span style={{ fontSize: '0.8em', color: '#666' }}>
                        Stack: {env.StackName || env.StackId?.substring(0, 8)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span className={`status-badge ${env.Status?.toLowerCase()}`}>{env.Status}</span>
                      {env.Status === 'RUNNING' && env.StopTime && (
                        <span style={{ fontSize: '0.75em', marginTop: '0.3rem', color: '#f59e0b' }}>
                          🛑 Auto-Stop: {env.StopTime}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="env-body">
                    <div className="services-list">
                      {env.Services?.map((svc, i) => (
                        <div key={i} className="service-item">
                          📦 <strong>{svc.Repo || svc.repo}</strong> : {svc.Branch || svc.branch}
                          <span style={{ fontSize: '0.8em', color: '#999', marginLeft: '0.5em' }}>
                            (Build: {svc.Buildspec || 'def'}, App: {svc.Appspec || 'def'})
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="ip-info">🌐 {env.PublicIP || 'Pending IP...'}</div>
                    <div className="time-info">🕒 {new Date(env.CreatedAt).toLocaleString()}</div>
                  </div>
                  <div className="env-footer">
                    {env.PublicIP && (
                      <a href={`http://${env.PublicIP}`} target="_blank" rel="noreferrer" className="visit-btn">
                        Open App ↗
                      </a>
                    )}
                    <button onClick={() => handleDeploy(env)} className="visit-btn" style={{ borderColor: '#3b82f6', color: '#3b82f6' }}>
                      🚀 Deploy
                    </button>
                    <button onClick={() => handleDelete(env.StackId, 'archive')} className="delete-btn">
                      📦 Archive
                    </button>
                    <button onClick={() => handleDelete(env.StackId, 'permanent')} className="delete-btn" style={{ borderColor: 'red', color: 'red' }}>
                      💥 Destroy
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ARCHIVED ENVIRONMENTS */}
        {archivedEnvs.length > 0 && (
          <section className="env-list-section card" style={{ marginTop: '2rem', opacity: 0.8 }}>
            <div className="section-header">
              <h2>History / Archived ({archivedEnvs.length})</h2>
            </div>
            <div className="env-grid">
              {archivedEnvs.map((env) => (
                <div key={env.StackId} className="env-card status-archived" style={{ filter: 'grayscale(100%)' }}>
                  <div className="env-header">
                    <span className="env-id">{env.StackName || env.StackId?.substring(0, 8)}</span>
                    <span className="status-badge archived">ARCHIVED</span>
                  </div>
                  <div className="env-body">
                    <div className="services-list">
                      {env.Services?.map((svc, i) => (
                        <div key={i} className="service-item">
                          📦 {svc.Repo || svc.repo} : {svc.Branch || svc.branch}
                        </div>
                      ))}
                    </div>
                    <div className="time-info">Deleted: {new Date(env.DeletedAt || Date.now()).toLocaleString()}</div>
                  </div>
                  <div className="env-footer">
                    <button onClick={() => handleRelaunch(env)} className="visit-btn" style={{ borderColor: '#10b981', color: '#10b981' }}>📝 Relaunch</button>
                    <button onClick={() => handleDelete(env.StackId, 'permanent')} className="delete-btn">❌ Delete Forever</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}

function App() {
  if (DEV_BYPASS_AUTH) {
    return <Dashboard signOut={() => alert('Sign out clicked')} user={{ username: 'DevUser' }} />;
  }

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <Dashboard signOut={signOut} user={user} />
      )}
    </Authenticator>
  );
}

export default App;
