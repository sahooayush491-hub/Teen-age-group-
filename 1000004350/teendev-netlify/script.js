/* =========================================================================
   Teen Dev Community — script.js

   Works in two modes, automatically:
     • STANDALONE  — no backend (e.g. a plain drag-and-drop upload).
                     Accounts are kept in the browser.
     • SERVER      — if the backend functions are deployed, it uses them
                     instead (real accounts in a Postgres database).

   It picks the mode by asking the server "who am I?". No server → standalone.
   ========================================================================= */
(function () {
  "use strict";

  /* =======================================================================
     👉 YOUR COMMUNITY LINKS — edit these three lines
     ======================================================================= */
  const COMMUNITY = {
    whatsapp:  "https://chat.whatsapp.com/IYUOV5wmIA44V3pmJG7AxY",
    instagram: "https://www.instagram.com/teen_devs_",
    discord:   "https://discord.gg/dfXhNdWsy",
  };

  /* =======================================================================
     Toast messages
     ======================================================================= */
  function toast(message, type) {
    const stack = document.getElementById("flash-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "flash flash-" + (type || "success");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .5s, transform .5s";
      el.style.opacity = "0";
      el.style.transform = "translateX(28px)";
      setTimeout(() => el.remove(), 520);
    }, 3400);
  }

  /* =======================================================================
     Which mode are we in?
     ======================================================================= */
  let MODE = "standalone";

  async function detectMode() {
    try {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      const ct = res.headers.get("content-type") || "";
      if (res.status !== 404 && ct.indexOf("application/json") > -1) {
        MODE = "server";
        return;
      }
    } catch (e) { /* no backend reachable */ }
    MODE = "standalone";
  }

  /* =======================================================================
     STANDALONE mode — accounts kept in the browser
     ======================================================================= */
  const LS_USERS = "tdc_users";
  const LS_SESSION = "tdc_session";

  async function localHash(pw) {
    if (window.crypto && window.crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch (e) { /* fall through */ }
    }
    let h = 5381;
    for (let i = 0; i < pw.length; i++) h = ((h << 5) + h) ^ pw.charCodeAt(i);
    return "fb" + (h >>> 0).toString(16);
  }

  const localUsers = () => JSON.parse(localStorage.getItem(LS_USERS) || "[]");
  const localSession = () => JSON.parse(localStorage.getItem(LS_SESSION) || "null");

  /* =======================================================================
     One API for the page — routes to the right mode
     ======================================================================= */
  async function serverCall(path, body) {
    try {
      const res = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin",
      });
      let data = {};
      try { data = await res.json(); } catch (e) { /* empty */ }
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: "Network problem. Please check your connection." } };
    }
  }

  async function register({ username, email, password }) {
    if (MODE === "server") {
      const r = await serverCall("/api/register", { username, email, password });
      return { ok: r.ok, error: r.data.error };
    }
    const users = localUsers();
    const uname = username.trim();
    const mail = email.trim().toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === uname.toLowerCase() || u.email === mail))
      return { ok: false, error: "That username or email is already registered." };
    users.push({
      username: uname, email: mail, pass: await localHash(password),
      bio: "", joined: new Date().toISOString().slice(0, 10),
    });
    localStorage.setItem(LS_USERS, JSON.stringify(users));
    return { ok: true };
  }

  async function login({ identifier, password }) {
    if (MODE === "server") {
      const r = await serverCall("/api/login", { identifier, password });
      return { ok: r.ok, error: r.data.error };
    }
    const id = identifier.trim().toLowerCase();
    const user = localUsers().find((u) => u.username.toLowerCase() === id || u.email === id);
    if (!user) return { ok: false, error: "Wrong username/email or password." };
    if ((await localHash(password)) !== user.pass) return { ok: false, error: "Wrong username/email or password." };
    localStorage.setItem(LS_SESSION, JSON.stringify({ username: user.username, email: user.email }));
    return { ok: true };
  }

  async function logout() {
    if (MODE === "server") { await serverCall("/api/logout", {}); return; }
    localStorage.removeItem(LS_SESSION);
  }

  async function getCurrentUser() {
    if (MODE === "server") {
      const r = await serverCall("/api/me");
      if (!r.ok) return null;
      return { username: r.data.username, email: r.data.email, bio: r.data.bio || "", joined: r.data.joined || "--" };
    }
    const s = localSession();
    if (!s) return null;
    const me = localUsers().find((u) => u.username === s.username);
    if (!me) return null;
    return { username: me.username, email: me.email, bio: me.bio || "", joined: me.joined || "--" };
  }

  async function saveBio(bio) {
    const clean = String(bio).trim().slice(0, 280);
    if (MODE === "server") {
      const r = await serverCall("/api/profile", { bio: clean });
      return { ok: r.ok, error: r.data.error };
    }
    const users = localUsers();
    const s = localSession();
    const me = users.find((u) => u.username === s.username);
    if (me) { me.bio = clean; localStorage.setItem(LS_USERS, JSON.stringify(users)); }
    return { ok: true };
  }

  /* =======================================================================
     Fill the page / apply links
     ======================================================================= */
  function fillUser(user) {
    document.querySelectorAll("[data-user]").forEach((el) => {
      const f = el.getAttribute("data-user");
      if (f === "username") el.textContent = user.username || "";
      else if (f === "email") el.textContent = user.email || "";
      else if (f === "initial") el.textContent = (user.username || "U").charAt(0).toUpperCase();
      else if (f === "joined") el.textContent = user.joined || "--";
      else if (f === "bio") el.textContent = user.bio || "No bio yet. Add one below to introduce yourself.";
    });
    const box = document.querySelector('#profile-form textarea[name="bio"]');
    if (box) box.value = user.bio || "";
  }

  function applyLinks() {
    document.querySelectorAll("[data-link]").forEach((el) => {
      const key = el.getAttribute("data-link");
      if (COMMUNITY[key]) el.setAttribute("href", COMMUNITY[key]);
    });
  }

  /* =======================================================================
     Forms
     ======================================================================= */
  function wireRegister() {
    const form = document.getElementById("register-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = form.username.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;
      const confirm = form.confirm.value;

      if (username.length < 3)  return toast("Username must be at least 3 characters.", "error");
      if (!email.includes("@") || !email.includes(".")) return toast("Please enter a valid email address.", "error");
      if (password.length < 8)  return toast("Password must be at least 8 characters.", "error");
      if (password !== confirm) return toast("The two passwords do not match.", "error");

      const { ok, error } = await register({ username, email, password });
      if (!ok) return toast(error || "Could not create the account.", "error");

      sessionStorage.setItem("tdc_flash", "Account created! Now log in.");
      window.location.href = "index.html";
    });
  }

  function wireLogin() {
    const form = document.getElementById("login-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const identifier = form.identifier.value.trim();
      const password = form.password.value;

      const { ok, error } = await login({ identifier, password });
      if (!ok) return toast(error || "Could not log in.", "error");

      window.location.href = "dashboard.html";
    });
  }

  function wireProfile() {
    const form = document.getElementById("profile-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { ok, error } = await saveBio(form.bio.value);
      if (!ok) return toast(error || "Could not save.", "error");
      toast("Profile updated.", "success");
    });
  }

  function wireLogout() {
    document.querySelectorAll('[data-action="logout"]').forEach((link) => {
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        await logout();
        sessionStorage.setItem("tdc_flash", "You have been logged out.");
        window.location.href = "index.html";
      });
    });
  }

  /* =======================================================================
     Visual effects
     ======================================================================= */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initSpotlight() {
    const el = document.querySelector(".spotlight");
    if (!el || reduceMotion) return;
    let raf = null;
    window.addEventListener("pointermove", (e) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--sx", e.clientX + "px");
        el.style.setProperty("--sy", e.clientY + "px");
      });
    });
  }

  function initTilt(selector, max) {
    document.querySelectorAll(selector).forEach((el) => {
      if (reduceMotion) return;
      const strength = max || 8;
      let raf = null;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.transform =
            `perspective(1000px) rotateX(${(0.5 - py) * strength * 2}deg) rotateY(${(px - 0.5) * strength * 2}deg) translateZ(6px)`;
          el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
          el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        });
      });
      el.addEventListener("pointerleave", () => {
        if (raf) cancelAnimationFrame(raf);
        el.style.transform = "";
      });
    });
  }

  function initDepthLayers() {
    const card = document.querySelector("[data-tilt3d]");
    if (!card || reduceMotion) return;
    const layers = card.querySelectorAll("[data-layer]");
    let raf = null;
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        card.style.transform = `perspective(1200px) rotateX(${(0.5 - py) * 16}deg) rotateY(${(px - 0.5) * 16}deg)`;
        card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        const sx = (px - 0.5) * 26, sy = (py - 0.5) * 26;
        layers.forEach((l) => {
          const z = parseFloat(l.getAttribute("data-layer")) || 20;
          const k = z / 60;
          l.style.transform = `translate3d(${(-sx * k).toFixed(2)}px, ${(-sy * k).toFixed(2)}px, ${z}px)`;
        });
      });
    });
    card.addEventListener("pointerleave", () => {
      if (raf) cancelAnimationFrame(raf);
      card.style.transform = "";
      layers.forEach((l) => (l.style.transform = ""));
    });
  }

  function initParallax() {
    const items = document.querySelectorAll("[data-parallax]");
    if (!items.length || reduceMotion) return;
    let raf = null;
    window.addEventListener("pointermove", (e) => {
      const cx = e.clientX / window.innerWidth - 0.5;
      const cy = e.clientY / window.innerHeight - 0.5;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        items.forEach((el) => {
          const d = parseFloat(el.getAttribute("data-parallax")) || 10;
          el.style.transform = `translate3d(${cx * d}px, ${cy * d}px, 0)`;
        });
      });
    });
  }

  function initReveal() {
    const els = document.querySelectorAll(".reveal");
    if (!els.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en, i) => {
          if (en.isIntersecting) {
            setTimeout(() => en.target.classList.add("in"), i * 70);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
  }

  function initAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (id.length < 2) return;
        const target = document.querySelector(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        }
      });
    });
  }

  function initScrollProgress() {
    const bar = document.getElementById("scroll-bar");
    if (!bar) return;
    let raf = null;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      bar.style.width = pct.toFixed(2) + "%";
    };
    window.addEventListener("scroll", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* =======================================================================
     Start
     ======================================================================= */
  async function init() {
    const protectedPage = document.body.getAttribute("data-protected") === "true";

    applyLinks();
    wireRegister();
    wireLogin();
    wireProfile();
    wireLogout();

    await detectMode();

    if (protectedPage) {
      const user = await getCurrentUser();
      if (!user) {
        window.location.replace("index.html");
        return;
      }
      document.body.classList.add("authed");
      fillUser(user);
    }

    const pending = sessionStorage.getItem("tdc_flash");
    if (pending) {
      sessionStorage.removeItem("tdc_flash");
      toast(pending, "success");
    }

    initSpotlight();
    initTilt("[data-tilt]", 8);
    initDepthLayers();
    initParallax();
    initReveal();
    initAnchors();
    initScrollProgress();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
