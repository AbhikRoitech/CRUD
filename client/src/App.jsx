import { useState, useEffect } from "react";
import "./App.css";

const API = "/api/todos";
const AUTH = "/auth";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [userName, setUserName] = useState(localStorage.getItem("userName") || "");
  const [page, setPage] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState("");

  const [todos, setTodos] = useState([]);
  const [title, setTitle] = useState("");
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    if (token) fetchTodos();
  }, [token]);

  function authHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    const res = await fetch(`${AUTH}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return setAuthError(data.detail || "Login failed");
    localStorage.setItem("token", data.token);
    localStorage.setItem("userName", data.name);
    setToken(data.token);
    setUserName(data.name);
    setEmail("");
    setPassword("");
  }

  async function handleSignup(e) {
    e.preventDefault();
    setAuthError("");
    const res = await fetch(`${AUTH}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) return setAuthError(data.detail || "Signup failed");
    localStorage.setItem("token", data.token);
    localStorage.setItem("userName", data.name);
    setToken(data.token);
    setUserName(data.name);
    setName("");
    setEmail("");
    setPassword("");
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    setToken("");
    setUserName("");
    setTodos([]);
  }

  async function fetchTodos() {
    const res = await fetch(API, { headers: authHeaders() });
    if (res.status === 401) return logout();
    const data = await res.json();
    setTodos(data);
  }

  async function addTodo(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch(API, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title }),
    });
    setTitle("");
    fetchTodos();
  }

  async function deleteTodo(id) {
    await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeaders() });
    fetchTodos();
  }

  async function toggleComplete(todo) {
    await fetch(`${API}/${todo._id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ completed: !todo.completed }),
    });
    fetchTodos();
  }

  async function saveEdit(id) {
    if (!editTitle.trim()) return;
    await fetch(`${API}/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ title: editTitle }),
    });
    setEditId(null);
    setEditTitle("");
    fetchTodos();
  }

  if (!token) {
    return (
      <div className="app">
        <h1>Todo App</h1>
        {page === "login" ? (
          <form onSubmit={handleLogin} className="auth-form">
            <h2>Login</h2>
            {authError && <p className="error">{authError}</p>}
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit">Login</button>
            <p className="switch">Don't have an account? <span onClick={() => { setPage("signup"); setAuthError(""); }}>Sign up</span></p>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="auth-form">
            <h2>Sign Up</h2>
            {authError && <p className="error">{authError}</p>}
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit">Sign Up</button>
            <p className="switch">Already have an account? <span onClick={() => { setPage("login"); setAuthError(""); }}>Login</span></p>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <h1>Todo App</h1>
        <div className="user-info">
          <span>Hi, {userName}</span>
          <button onClick={logout} className="logout-btn">Logout</button>
        </div>
      </div>
      <form onSubmit={addTodo} className="add-form">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a new todo..." />
        <button type="submit">Add</button>
      </form>
      <ul className="todo-list">
        {todos.map((todo) => (
          <li key={todo._id} className={todo.completed ? "completed" : ""}>
            {editId === todo._id ? (
              <div className="edit-row">
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit(todo._id)} />
                <button onClick={() => saveEdit(todo._id)}>Save</button>
                <button onClick={() => setEditId(null)}>Cancel</button>
              </div>
            ) : (
              <div className="todo-row">
                <input type="checkbox" checked={todo.completed} onChange={() => toggleComplete(todo)} />
                <span className="todo-title">{todo.title}</span>
                <div className="actions">
                  <button onClick={() => { setEditId(todo._id); setEditTitle(todo.title); }}>Edit</button>
                  <button className="delete" onClick={() => deleteTodo(todo._id)}>Delete</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {todos.length === 0 && <p className="empty">No todos yet. Add one above!</p>}
    </div>
  );
}

export default App;
