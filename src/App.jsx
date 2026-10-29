import { useEffect, useState } from "react";
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, LineChart, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from "recharts";

const API = "http://127.0.0.1:8000";
const cache = new Map();
async function call(path, body) {
  if (!body && cache.has(path)) return cache.get(path);
  let r;
  try { r = await fetch(API + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined); }
  catch { throw new Error(`Cannot reach the API at ${API}`); }
  if (!r.ok) throw new Error(r.status === 404 ? "Not found (check player name / that /meta and /stats exist)" : r.status === 502 ? "Model returned an invalid answer, try again" : `API error ${r.status}`);
  const j = await r.json(); if (!body) cache.set(path, j); return j;
}
function useGet(path) {
  const [s, set] = useState({ data: null, err: null, loading: true });
  const [k, setK] = useState(0);
  useEffect(() => {
    let live = true; set({ data: null, err: null, loading: true });
    call(path).then(d => live && set({ data: d, err: null, loading: false })).catch(e => live && set({ data: null, err: e.message, loading: false }));
    return () => { live = false; };
  }, [path, k]);
  return { ...s, retry: () => setK(x => x + 1) };
}
const n1 = x => (x == null || isNaN(x) ? "–" : String(Math.round(x * 10) / 10));
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const col = r => (r >= 50 ? "#10b981" : r >= 30 ? "#f59e0b" : "#6b7280");
const tip = { contentStyle: { background: "#111827", border: "1px solid #1f2937", color: "#f3f4f6" } };
const ax = { stroke: "#9ca3af", fontSize: 11 };

const Card = ({ title, children }) => <section className="card">{title && <h3>{title}</h3>}{children}</section>;
const Err = ({ msg, retry }) => msg ? <div className="err"><span>{msg}</span>{retry && <button onClick={retry}>Retry</button>}</div> : null;
const Sel = ({ label, value, onChange, options }) => (
  <label className="f"><span>{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select…</option>{options.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
    </select></label>
);
const Box = ({ loading, children }) => loading ? <div className="sk" /> : <div style={{ height: 260 }}><ResponsiveContainer>{children}</ResponsiveContainer></div>;
const HBar = ({ title, rows, loading }) => (
  <Card title={title}><Box loading={loading}>
    <BarChart data={rows} layout="vertical" margin={{ left: 10 }}>
      <CartesianGrid stroke="#1f2937" /><XAxis type="number" {...ax} /><YAxis type="category" dataKey="name" width={150} {...ax} />
      <Tooltip {...tip} formatter={(v, _, p) => [`${v} avg (n=${p.payload.n})`, "Runs"]} />
      <Bar dataKey="avg" fill="#10b981" radius={4} />
    </BarChart></Box></Card>
);

export default function App() {
  const [tab, setTab] = useState("Dashboard");
  const [player, setPlayer] = useState("V Kohli");
  const meta = useGet("/meta"); const m = meta.data;
  const shared = {
    player, setPlayer, m,
    pOpts: m ? m.players.map(p => ({ v: p.name, t: `${p.name} (${p.innings})` })) : [],
    vLabel: id => m?.venues.find(v => v.id === id)?.label || id,
  };
  return (<>
    <nav><b>CricPredict</b>
      {["Dashboard", "Predict", "Stats"].map(t => <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
      <span className={"dot " + (m ? "ok" : meta.err ? "bad" : "")} title={m ? "API connected" : "API unreachable"} /></nav>
    <main>
      <Err msg={meta.err} retry={meta.retry} />
      {m && tab === "Dashboard" && <Dashboard {...shared} />}
      {m && tab === "Predict" && <Predict {...shared} />}
      {m && tab === "Stats" && <Stats {...shared} />}
    </main></>);
}

function Dashboard({ player, setPlayer, pOpts, vLabel }) {
  const h = useGet(`/history/${encodeURIComponent(player)}?limit=20`);
  const s = useGet(`/stats/${encodeURIComponent(player)}`);
  const d = (h.data || []).map((r, i, a) => ({ ...r, label: r.date.slice(2, 10), roll: i >= 4 ? avg(a.slice(i - 4, i + 1).map(x => x.target_runs)) : null }));
  const runs = d.map(r => r.target_runs);
  const kp = [["Last-5 avg", n1(avg(runs.slice(-5)))], ["Last-20 avg", n1(avg(runs))],
    ["30+ rate", runs.length ? Math.round(100 * runs.filter(r => r >= 30).length / runs.length) + "%" : "–"],
    ["Highest (20)", runs.length ? Math.max(...runs) : "–"]];
  return (<>
    <Sel label="Player" value={player} onChange={setPlayer} options={pOpts} />
    <Err msg={h.err || s.err} retry={() => { h.retry(); s.retry(); }} />
    <div className="kpis">{kp.map(([k, v]) => <div className="card kpi" key={k}><small>{k}</small><strong>{v}</strong></div>)}</div>
    <Card title="Recent innings (dashed = 5-innings average, red outline = not out)">
      <Box loading={h.loading}><ComposedChart data={d}>
        <CartesianGrid stroke="#1f2937" /><XAxis dataKey="label" {...ax} /><YAxis {...ax} /><Tooltip {...tip} />
        <Bar dataKey="target_runs" name="Runs">{d.map((r, i) => <Cell key={i} fill={col(r.target_runs)} stroke={r.dismissed === 0 ? "#ef4444" : "none"} strokeWidth={2} />)}</Bar>
        <Line dataKey="roll" name="5-inn avg" stroke="#f3f4f6" strokeDasharray="5 4" dot={false} />
      </ComposedChart></Box></Card>
    <div className="two">
      <Card title="Season average"><Box loading={s.loading}><LineChart data={s.data?.by_season || []}>
        <CartesianGrid stroke="#1f2937" /><XAxis dataKey="season" {...ax} /><YAxis {...ax} /><Tooltip {...tip} />
        <Line dataKey="avg" stroke="#10b981" strokeWidth={2} /></LineChart></Box></Card>
      <Card title="Last 10 innings"><table><thead><tr><th>Date</th><th>Opp</th><th>Venue</th><th>Runs</th><th>SR</th></tr></thead><tbody>
        {[...d].reverse().slice(0, 10).map((r, i) => <tr key={i}><td>{r.date}</td><td>{r.opposition.split(" ").map(w => w[0]).join("")}</td>
          <td>{vLabel(r.venue_id).slice(0, 18)}</td><td>{r.target_runs}{r.dismissed === 0 ? "*" : ""}</td>
          <td>{r.balls_faced ? n1(100 * r.target_runs / r.balls_faced) : "–"}</td></tr>)}</tbody></table></Card>
    </div></>);
}

const MSGS = ["Crunching recent form…", "Checking venue record…", "Asking the model…"];
function Predict({ player, setPlayer, pOpts, m }) {
  const [f, setF] = useState({ opposition: "", venue: "", dn: "day" });
  const [st, setSt] = useState({ res: null, err: null, loading: false, msg: "" });
  const ok = player && f.opposition && f.venue && !st.loading;
  async function go() {
    let i = 0; setSt({ res: null, err: null, loading: true, msg: MSGS[0] });
    const t = setInterval(() => setSt(s => ({ ...s, msg: MSGS[++i % MSGS.length] })), 2500);
    try { const res = await call("/predict", { player, venue: f.venue, opposition: f.opposition, day_night: f.dn }); setSt({ res, err: null, loading: false }); }
    catch (e) { setSt({ res: null, err: e.message, loading: false }); }
    finally { clearInterval(t); }
  }
  const r = st.res, p = r?.prediction, c = r?.context;
  const max = p ? Math.max(100, p.high * 1.25) : 100, pos = v => (v / max) * 100 + "%";
  const cmp = c ? [["Career", c.career.avg], ["Last 10", c.form.avg10], ["Last 5", c.form.avg5],
    [`vs opp (n=${c.vs_opp.n})`, c.vs_opp.avg], [`venue (n=${c.at_venue.n})`, c.at_venue.avg], ["Predicted", p.expected]].map(([name, v]) => ({ name, v })) : [];
  const hist = (r?.history || []).map(x => ({ label: x.date.slice(2, 10), runs: x.target_runs }));
  return (<>
    <Card title="Match setup"><div className="form">
      <Sel label="Player" value={player} onChange={setPlayer} options={pOpts} />
      <Sel label="Opposition" value={f.opposition} onChange={v => setF({ ...f, opposition: v })} options={m.teams.map(t => ({ v: t, t }))} />
      <Sel label="Venue" value={f.venue} onChange={v => setF({ ...f, venue: v })} options={m.venues.map(v => ({ v: v.id, t: `${v.label} · ${v.matches} matches` }))} />
      <Sel label="Day / Night" value={f.dn} onChange={v => setF({ ...f, dn: v || "day" })} options={[{ v: "day", t: "Day" }, { v: "night", t: "Night" }]} />
      <button className="go" disabled={!ok} onClick={go}>{st.loading ? st.msg : "Predict score"}</button>
    </div></Card>
    <Err msg={st.err} retry={ok ? go : null} />
    {p && <>
      <Card title="Predicted score">
        <div><span className="big">{p.expected}</span><span className={"badge conf-" + p.confidence}>{p.confidence} confidence</span>
          {p.factors?.some(x => /LLM unavailable/i.test(x)) && <span className="badge conf-low">Stats-only estimate</span>}</div>
        <div className="track"><div className="fill" style={{ left: pos(p.low), width: `calc(${pos(p.high)} - ${pos(p.low)})` }} /><div className="mark" style={{ left: pos(p.expected) }} /></div>
        <div className="row"><span>Low {p.low}</span><span>High {p.high}</span></div>
        <p>{p.reasoning}</p>{p.factors?.map((x, i) => <span className="chip" key={i}>{x}</span>)}
      </Card>
      <div className="two">
        <Card title="Averages vs prediction"><Box><BarChart data={cmp}>
          <CartesianGrid stroke="#1f2937" /><XAxis dataKey="name" {...ax} interval={0} angle={-20} height={60} textAnchor="end" /><YAxis {...ax} /><Tooltip {...tip} />
          <Bar dataKey="v" name="Runs">{cmp.map((x, i) => <Cell key={i} fill={x.name === "Predicted" ? "#f59e0b" : "#10b981"} />)}</Bar></BarChart></Box></Card>
        <Card title="Last 20 innings vs predicted range"><Box><LineChart data={hist}>
          <CartesianGrid stroke="#1f2937" /><XAxis dataKey="label" {...ax} /><YAxis {...ax} /><Tooltip {...tip} />
          <ReferenceLine y={p.low} stroke="#6b7280" strokeDasharray="4 4" /><ReferenceLine y={p.expected} stroke="#f59e0b" /><ReferenceLine y={p.high} stroke="#6b7280" strokeDasharray="4 4" />
          <Line dataKey="runs" stroke="#10b981" strokeWidth={2} /></LineChart></Box></Card>
      </div></>}
  </>);
}

function Stats({ player, setPlayer, pOpts, vLabel }) {
  const s = useGet(`/stats/${encodeURIComponent(player)}`); const d = s.data;
  const v = (d?.by_venue || []).map(x => ({ name: vLabel(x.key).slice(0, 26), avg: x.avg, n: x.n }));
  const o = (d?.by_opposition || []).map(x => ({ name: x.key, avg: x.avg, n: x.n })).sort((a, b) => b.avg - a.avg);
  return (<>
    <Sel label="Player" value={player} onChange={setPlayer} options={pOpts} />
    <Err msg={s.err} retry={s.retry} />
    <div className="two"><HBar title="Average by venue (min 3 innings)" rows={v} loading={s.loading} /><HBar title="Average by opposition" rows={o} loading={s.loading} /></div>
  </>);
}
