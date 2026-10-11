import React, { useState, useEffect } from "react";

const API = "http://localhost:5000/api";
const CATEGORIES = ["General", "Tech", "Music", "Sports", "Business"];
const card = { border: "1px solid #ccc", borderRadius: 6, padding: 12, marginBottom: 10 };

// one small helper for every API call (adds the JWT token automatically)
async function api(path, method = "GET", body) {
  const token = localStorage.getItem("token");
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: "Bearer " + token }) },
    body: body && JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.error || data?.msg || "Something went wrong");
  return data;
}

// ---------- Login / Signup ----------
function Auth({ onLogin, notify }) {
  const [signup, setSignup] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (signup) await api("/signup", "POST", form);
      const data = await api("/login", "POST", form);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      notify(err.message);
    }
  };

  return (
    <form onSubmit={submit}>
      <h2>{signup ? "Sign up" : "Login"}</h2>
      {signup && <p><input placeholder="Name" value={form.name} onChange={set("name")} /></p>}
      <p><input placeholder="Email" value={form.email} onChange={set("email")} /></p>
      <p><input type="password" placeholder="Password" value={form.password} onChange={set("password")} /></p>
      <button>{signup ? "Create account" : "Login"}</button>{" "}
      <button type="button" onClick={() => setSignup(!signup)}>
        {signup ? "I have an account" : "Need an account?"}
      </button>
    </form>
  );
}

// ---------- Browse events (or "my registrations" when mine=true) ----------
function Events({ mine, notify }) {
  const [events, setEvents] = useState([]);
  const [myIds, setMyIds] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState(null);

  const load = async () => {
    try {
      const registered = await api("/my-registrations");
      setMyIds(registered.map((e) => e.id));
      setEvents(mine ? registered : await api(`/events?search=${encodeURIComponent(search)}&category=${category}`));
    } catch (err) {
      notify(err.message);
    }
  };
  useEffect(() => { load(); }, [search, category, mine]);

  const toggle = async (event, isRegistered) => {
    try {
      await api(`/events/${event.id}/register`, isRegistered ? "DELETE" : "POST");
      notify(isRegistered ? "Unregistered" : "Registered!");
      load();
    } catch (err) {
      notify(err.message);
    }
  };

  return (
    <div>
      <h2>{mine ? "My registrations" : "Events"}</h2>
      {!mine && (
        <p>
          <input placeholder="Search by title" value={search} onChange={(e) => setSearch(e.target.value)} />{" "}
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </p>
      )}
      {events.length === 0 && <p>No events found.</p>}
      {events.map((e) => {
        const isRegistered = myIds.includes(e.id);
        return (
          <div key={e.id} style={card}>
            <h3>{e.title} <small>({e.category})</small></h3>
            <p>{new Date(e.date_time).toLocaleString()} · {e.venue}</p>
            <p>{e.spots_left} of {e.capacity} spots left</p>
            {open === e.id && <p>{e.description || "No description."}</p>}
            <button onClick={() => setOpen(open === e.id ? null : e.id)}>
              {open === e.id ? "Hide details" : "View details"}
            </button>{" "}
            <button disabled={!isRegistered && e.spots_left <= 0} onClick={() => toggle(e, isRegistered)}>
              {isRegistered ? "Unregister" : e.spots_left <= 0 ? "Full" : "Register"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Admin: create / edit / delete events ----------
const empty = { title: "", description: "", venue: "", capacity: 50, category: "General", date_time: "" };

function Admin({ notify }) {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = () => api("/events").then(setEvents).catch((err) => notify(err.message));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api(editId ? `/events/${editId}` : "/events", editId ? "PUT" : "POST", { ...form, capacity: Number(form.capacity) });
      notify(editId ? "Event updated" : "Event created");
      setForm(empty);
      setEditId(null);
      load();
    } catch (err) {
      notify(err.message);
    }
  };

  const edit = (e) => {
    setEditId(e.id);
    setForm({ ...e, date_time: e.date_time.slice(0, 16) });
  };

  const remove = async (id) => {
    if (!confirm("Delete this event and all its registrations?")) return;
    try {
      await api(`/events/${id}`, "DELETE");
      notify("Event deleted");
      load();
    } catch (err) {
      notify(err.message);
    }
  };

  return (
    <div>
      <h2>Manage events</h2>
      <form onSubmit={save} style={card}>
        <h3>{editId ? "Edit event" : "New event"}</h3>
        <p><input placeholder="Title" value={form.title} onChange={set("title")} /></p>
        <p><input placeholder="Venue" value={form.venue} onChange={set("venue")} /></p>
        <p><input type="datetime-local" value={form.date_time} onChange={set("date_time")} /></p>
        <p><input type="number" min="1" placeholder="Capacity" value={form.capacity} onChange={set("capacity")} /></p>
        <p>
          <select value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </p>
        <p><textarea placeholder="Description" value={form.description} onChange={set("description")} /></p>
        <button>{editId ? "Save changes" : "Create event"}</button>{" "}
        {editId && <button type="button" onClick={() => { setEditId(null); setForm(empty); }}>Cancel</button>}
      </form>

      {events.map((e) => (
        <div key={e.id} style={card}>
          <b>{e.title}</b> · {new Date(e.date_time).toLocaleString()} · {e.registered}/{e.capacity} registered{" "}
          <button onClick={() => edit(e)}>Edit</button>{" "}
          <button onClick={() => remove(e.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}

// ---------- App ----------
export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user")));
  const [view, setView] = useState("events");
  const [message, setMessage] = useState("");

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setView("events");
  };

  return (
    <div style={{ maxWidth: 700, margin: "20px auto", fontFamily: "sans-serif", padding: "0 12px" }}>
      <h1>Event Registration</h1>
      {user && (
        <p>
          Hi, {user.name}{" "}
          <button onClick={() => setView("events")}>Events</button>{" "}
          <button onClick={() => setView("mine")}>My registrations</button>{" "}
          {user.is_admin && <button onClick={() => setView("admin")}>Admin</button>}{" "}
          <button onClick={logout}>Logout</button>
        </p>
      )}
      {message && <p style={{ background: "#eef", padding: 8 }}>{message}</p>}

      {!user && <Auth onLogin={setUser} notify={setMessage} />}
      {user && view === "events" && <Events notify={setMessage} />}
      {user && view === "mine" && <Events mine notify={setMessage} />}
      {user && view === "admin" && <Admin notify={setMessage} />}
    </div>
  );
}