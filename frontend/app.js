// frontend/app.js
const API_KEY = "thepasswordyoudontwantotherstoknow";

const N = 28;       // the model's input grid
const SCALE = 10;   // on-screen pixels per grid cell (280 / 28)

const pad = document.getElementById("pad");
const view = pad.getContext("2d");
view.imageSmoothingEnabled = false;  // draw crisp blocks

// The real drawing happens on a hidden 28x28 grid. The
// visible canvas is that grid magnified ten times, so
// the user paints at the model's own resolution.
const grid = document.createElement("canvas");
grid.width = N; grid.height = N;
const gctx = grid.getContext("2d");
gctx.lineWidth = 2.5;
gctx.lineCap = "round"; gctx.lineJoin = "round";

let drawing = false;

// Begrüßung und Logout-Button anzeigen,
// wenn der Benutzer angemeldet ist
let currentUser = localStorage.getItem("pixelwise_user") || null;

function updateAuthUI() {
    const greeting = document.getElementById("user-greeting");
    const btnLogout = document.getElementById("btn-logout");
    const btnOpenLogin = document.getElementById("btn-open-login");
    if (currentUser) {
        greeting.textContent = `Hallo, ${currentUser}`;
        greeting.classList.remove("hidden");
        btnLogout.classList.remove("hidden");
        btnOpenLogin.classList.add("hidden");
    } else {
        greeting.classList.add("hidden");
        btnLogout.classList.add("hidden");
        btnOpenLogin.classList.remove("hidden");
    }
    refresh();
}

// Login und Registrierung Pop Up.
const popup = document.getElementById("auth-popup");

function openPopup(tab) {
    popup.classList.remove("hidden");
    switchTab(tab || "login");
}

function closePopup() {
    popup.classList.add("hidden");
    clearFormMessages();
}

function switchTab(name) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.getElementById("tab-login").classList.toggle("hidden", name !== "login");
    document.getElementById("tab-register").classList.toggle("hidden", name !== "register");
    clearFormMessages();
}

function clearFormMessages() {
    ["login-error", "reg-error", "reg-success"].forEach(id => {
        const el = document.getElementById(id);
        el.textContent = "";
        el.classList.add("hidden");
    });
}

document.getElementById("btn-open-login").onclick = () => openPopup("login");
document.getElementById("btn-close-popup").onclick = closePopup;
popup.addEventListener("click", e => { if (e.target === popup) closePopup(); });
document.querySelectorAll(".tab-btn").forEach(b => b.onclick = () => switchTab(b.dataset.tab));

document.getElementById("btn-logout").onclick = () => {
    currentUser = null;
    localStorage.removeItem("pixelwise_user");
    updateAuthUI();
};

document.getElementById("btn-login").onclick = async () => {
    const username = document.getElementById("login-username").value.trim();
    const pw = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    if (!username || !pw) { showError(errEl, "Bitte füllen Sie alle Felder aus."); return; }
    const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: pw })
    });
    if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        showError(errEl, d.detail || "Anmeldung fehlgeschlagen.");
        return;
    }
    const d = await r.json();
    currentUser = d.username;
    localStorage.setItem("pixelwise_user", currentUser);
    closePopup();
    updateAuthUI();
};

document.getElementById("btn-register").onclick = async () => {
    const username = document.getElementById("reg-username").value.trim();
    const pw = document.getElementById("reg-password").value;
    const errEl = document.getElementById("reg-error");
    const okEl = document.getElementById("reg-success");
    if (!username || !pw) { showError(errEl, "Bitte füllen Sie alle Felder aus."); return; }
    const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: pw })
    });
    if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        showError(errEl, d.detail || "Registrierung fehlgeschlagen.");
        return;
    }
    okEl.textContent = "Account erstellt! Du kannst dich jetzt anmelden.";
    okEl.classList.remove("hidden");
    errEl.classList.add("hidden");
};

function showError(el, msg) {
    el.textContent = msg;
    el.classList.remove("hidden");
}



// Zeichenfeld

function render() {
    // Magnify the grid onto the canvas, smoothing off.
    view.drawImage(grid, 0, 0, pad.width, pad.height);
}

function clearPad() {
    gctx.fillStyle = "#fff";
    gctx.fillRect(0, 0, N, N);
    render();
}
clearPad();

// Mouse positions map onto the 28x28 grid via SCALE.
pad.onmousedown = e => {
    drawing = true; gctx.beginPath();
    gctx.moveTo(e.offsetX / SCALE, e.offsetY / SCALE);
};
pad.onmousemove = e => {
    if (!drawing) return;
    gctx.lineTo(e.offsetX / SCALE, e.offsetY / SCALE);
    gctx.stroke(); render();
};
pad.onmouseup = pad.onmouseleave = () => { drawing = false; };

function getPixels() {
    // The grid is already 28x28: read it and invert.
    const data = gctx.getImageData(0, 0, N, N).data;
    const pixels = [];
    for (let y = 0; y < N; y++) {
        const row = [];
        for (let x = 0; x < N; x++)
            row.push(255 - data[(y * N + x) * 4]);
        pixels.push(row);
    }
    return pixels;
}

//Mit Login wird das gemahlte zusammen mit dem Benutzername gesendet,
//dadurch kann das Backend das Ergebnis spätter einem Benutzer zuordnen.
async function classify() {
    const body = { pixels: getPixels() };
    if (currentUser) body.username = currentUser;
    const r = await fetch("/api/classify", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": API_KEY
        },
        body: JSON.stringify(body)
    });
    const out = document.getElementById("result");
    if (!r.ok) { out.textContent = "Error " + r.status; return; }
    const d = await r.json();
    out.textContent = `Prediction: ${d.prediction} ` +
        `(${(d.confidence * 100).toFixed(1)}%)`;
    refresh();
}

async function refresh() {

    // Updated Verlauf, wenn Benutzer angemeldet ist.
    let url = "/api/results";
    if (currentUser) url += `?username=${encodeURIComponent(currentUser)}`;
    const r = await fetch(url);
    if (!r.ok) return;
    const ul = document.getElementById("history");
    ul.innerHTML = "";
    for (const row of (await r.json()).results) {
        const li = document.createElement("li");
        li.textContent = `${row.prediction}  ` +
            `${row.confidence.toFixed(2)}  ${row.created_at}`;
        ul.appendChild(li);
    }
}

document.getElementById("classify").onclick = classify;
document.getElementById("clear").onclick = () => {
    clearPad();
    document.getElementById("result").textContent = "";
};

//Anmelde UI wird beim Starten direkt aktualisiert.
updateAuthUI();