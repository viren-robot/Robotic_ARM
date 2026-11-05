import { useState } from 'react';
import { Button } from '@lobehub/ui';
import { useApp } from '../hooks.js';
import { clearLog, sendRaw } from '../lib/controller.js';

export function Console({ verbose, setVerbose }) {
  const a = useApp();
  const [raw, setRaw] = useState('');
  const shown = a.logs.filter(l => verbose || !/^→ \{"t":"(drive|ping)"|^← \{"t":"status"|ack.*"ping"/.test(l.text));
  const send = () => {
    try { sendRaw(JSON.parse(raw)); setRaw(''); } catch (e) { alert('Not valid JSON'); }
  };
  return (
    <section className="card console-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>Console</h3>
        <div className="row">
          <label className="chk small"><input type="checkbox" checked={verbose} onChange={e => setVerbose(e.target.checked)} /> <span>Show drive packets and status</span></label>
          <Button size="small" onClick={clearLog}>Clear</Button>
        </div>
      </div>
      <div className="console" role="log" aria-live="polite">
        {shown.map((l, i) => <div key={i} className={'cl ' + (l.cls || '')}>{l.t}  {l.text}</div>)}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="grow mono" value={raw} onChange={e => setRaw(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder='{"t":"hello"}  raw JSON line to the car' />
        <Button size="small" onClick={send}>Send</Button>
      </div>
    </section>
  );
}
