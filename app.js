"use strict";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const KEY = "cobalt-class-v1";
const initial = () => ({
  students: [],
  hero: [null, null],
  albums: [],
  messages: [
    {
      id: "welcome",
      name: "Your Cobalt classroom",
      text: "Here’s to the little moments that become our favorite memories. This space is ours. ♡",
      color: "#d6eaff",
      date: "Welcome",
      image: null,
    },
  ],
  deck: [],
  last: null,
});
let state;
try {
  state = JSON.parse(localStorage.getItem(KEY)) || initial();
} catch {
  state = initial();
}
// Import the supplied roster once while preserving locally added photos and quotes.
function mergeClassRoster(target, roster) {
  const canonical = (name) =>
    name
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/\s*,\s*/g, ",")
      .replace(/\s+/g, " ")
      .trim();
  for (const student of target.students) {
    if (student.gender === "Boys") student.gender = "Males";
    if (student.gender === "Girls") student.gender = "Females";
  }
  for (const student of roster) {
    if (
      (target.deletedStudents || []).some(
        (s) =>
          s.id === student.id || canonical(s.name) === canonical(student.name),
      )
    )
      continue;
    const existing = target.students.find(
      (s) =>
        s.id === student.id || canonical(s.name) === canonical(student.name),
    );
    if (existing) {
      existing.gender = student.gender;
    } else target.students.push(JSON.parse(JSON.stringify(student)));
  }
  target.adviser ??= { name: "", message: "", image: null };
  target.rosterVersion = 1;
}
mergeClassRoster(state, window.COBALT_ROSTER || []);
let user = null,
  messagePage = 0,
  albumPage = 0,
  toastTimer,
  studentQuery = "",
  authBusy = false;

const admin = () => user?.role === "admin";
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    toast(
      "Storage is full or unavailable. This change could not be saved. Remove some photos and try again.",
    );
    return false;
  }
}
function commit(change) {
  const before = JSON.stringify(state);
  change();
  if (!save()) {
    state = JSON.parse(before);
    return false;
  }
  render();
  return true;
}
const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  Date.now().toString(36) + Math.random().toString(36).slice(2);
function modal(title, html) {
  $("#modal").dataset.dismiss = "normal";
  $("#modal").classList.remove("image-viewer-modal");
  $("#modal-title").textContent = title;
  $("#modal-content").innerHTML = html;
  if (!$("#modal").open) $("#modal").showModal();
  document.body.classList.add("modal-open");
}
function close() {
  if (!authBusy) $("#modal").close();
}
$("#close-modal").onclick = close;
$("#modal").addEventListener("cancel", (e) => {
  if (authBusy || $("#modal").dataset.dismiss === "explicit")
    e.preventDefault();
});
$("#modal").addEventListener("close", () =>
  document.body.classList.remove("modal-open"),
);
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal") && $("#modal").dataset.dismiss !== "explicit") {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      close();
  }
});
function guard() {
  if (admin()) return true;
  modal(
    "A little space for your adviser",
    /* HTML */ `
      <p>Only the admin can make this change.</p>
      <button class="pill" id="guard-signin">Sign in</button>
    `,
  );
  $("#guard-signin").onclick = login;
  return false;
}
function login(mode = "signin", prefill = "") {
  const creating = mode === "register";
  modal(
    creating ? "Join the Cobalt classroom" : "Welcome back to Cobalt",
    /* HTML */ `
      <div class="auth-tabs">
        <button
          type="button"
          id="show-signin"
          class="${creating ? "outline" : "pill"}"
          aria-pressed="${!creating}"
        >
          Sign in
        </button>
        <button
          type="button"
          id="show-register"
          class="${creating ? "pill" : "outline"}"
          aria-pressed="${creating}"
        >
          Create account
        </button>
      </div>
      <p class="hint">
        ${creating ? "Create your classmate account to leave messages for the class." : "Use the username and password for your existing account."}
      </p>
      <form id="login-form">
        <fieldset class="auth-fields">
          ${creating ? '<label class="field">Your display name<input name="displayName" maxlength="60" required autocomplete="name"></label>' : ""}
          <label class="field">
            Username
            <input
              name="username"
              required
              minlength="3"
              maxlength="32"
              pattern="[A-Za-z0-9._-]+"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              value="${esc(prefill)}"
            />
          </label>
          <label class="field">
            Password
            <input
              name="password"
              type="password"
              required
              ${creating ? 'minlength="8"' : ""}
              maxlength="128"
              autocomplete="${creating ? "new-password" : "current-password"}"
            />
          </label>
          ${creating ? '<label class="field">Confirm password<input name="confirmation" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><p class="hint">Use at least 8 characters. This account is saved in this browser.</p>' : ""}
          <p id="auth-error" class="auth-error" role="alert"></p>
          <button type="submit" class="pill" id="auth-submit">
            ${creating ? "Create account" : "Sign in"} ↗
          </button>
        </fieldset>
      </form>
    `,
  );
  $("#show-signin").onclick = () => login("signin");
  $("#show-register").onclick = () => login("register");
  $("#modal").dataset.dismiss = "explicit";
  const f = $("#login-form");
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.dataset.busy) return;
    const input = {
      username: f.elements.username.value,
      password: f.elements.password.value,
    };
    if (creating) {
      input.name = f.elements.displayName.value;
      input.confirmation = f.elements.confirmation.value;
    }
    const submit = $("#auth-submit");
    f.dataset.busy = "true";
    f.querySelector("fieldset").disabled = true;
    $("#auth-error").textContent = "";
    submit.innerHTML =
      '<span class="button-spinner" aria-hidden="true"></span> ' +
      (creating ? "Creating account…" : "Signing in…");
    try {
      const result = creating
        ? await CobaltAuth.register(input)
        : await CobaltAuth.signIn(input);
      if (!f.isConnected || !$("#modal").open) return;
      if (creating) {
        modal(
          "Your account is ready",
          /* HTML */ `
            <div class="session-state">
              <span class="session-check" aria-hidden="true">✓</span>
              <h3>Welcome to Cobalt!</h3>
              <p>
                Your username is
                <strong>${esc(result.username)}</strong>
                . You can now sign in with your password.
              </p>
              <button class="pill" id="account-ready">
                Sign in to my account
              </button>
            </div>
          `,
        );
        $("#account-ready").onclick = () => login("signin", result.username);
      } else await changeSession(result);
    } catch (error) {
      if (f.isConnected && $("#modal").open)
        $("#auth-error").textContent = error.message;
    } finally {
      delete f.dataset.busy;
      f.querySelector("fieldset").disabled = false;
      submit.textContent = creating ? "Create account ↗" : "Sign in ↗";
    }
  };
}
function account() {
  document.body.classList.toggle("is-admin", admin());
  $("#account").innerHTML = user
    ? /* HTML */ `
        <button id="user-menu" class="pill" aria-expanded="false">
          ${esc(user.name)} ⌄
        </button>
        <button id="logout" hidden>Log out</button>
      `
    : /* HTML */ `
        <button id="login" class="pill">Sign in ↗</button>
      `;
  if (!user) $("#login").onclick = login;
  else {
    $("#user-menu").onclick = () => {
      const b = $("#logout");
      b.hidden = !b.hidden;
      $("#user-menu").setAttribute("aria-expanded", String(!b.hidden));
    };
    $("#logout").onclick = () => changeSession(null);
  }
}
function media(image, label = "Your photo here") {
  return image
    ? /* HTML */ `
        <img
          class="media-image"
          src="${esc(image.src)}"
          alt="${esc(label)}"
          style="transform:scale(${Number(image.zoom) || 1});object-position:${Number(image.x) ?? 50}% ${Number(image.y) ?? 50}%"
        />
      `
    : /* HTML */ `
        <span class="placeholder">
          <span class="symbol">◇</span>
          <small>${esc(label)}</small>
        </span>
      `;
}
function mediaTools(key, image, allowCrop = true) {
  return admin()
    ? /* HTML */ `
        <div class="admin-tools">
          <button data-media="${esc(key)}">
            ${image ? "Replace" : "Upload"} photo
          </button>
          ${
            image
              ? `${
                  allowCrop
                    ? /* HTML */ `
                        <button data-resize="${esc(key)}">Resize / crop</button>
                      `
                    : ""
                }<button data-remove="${esc(key)}">Delete photo</button>`
              : ""
          }
        </div>
      `
    : "";
}
function resolveMedia(key) {
  const [type, id, index] = key.split(":");
  if (type === "adviser")
    return {
      get: () => state.adviser.image,
      set: (v) => (state.adviser.image = v),
    };
  if (type === "hero")
    return { get: () => state.hero[+id], set: (v) => (state.hero[+id] = v) };
  if (type === "student") {
    const s = state.students.find((s) => s.id === id);
    return { get: () => s.images[+index], set: (v) => (s.images[+index] = v) };
  }
  if (type === "album") {
    const a = state.albums.find((a) => a.id === id);
    return {
      get: () => a.images.find((i) => i.id === index),
      set: (v) => {
        const n = a.images.findIndex((i) => i.id === index);
        if (v) a.images[n] = { ...v, id: index };
        else a.images.splice(n, 1);
      },
    };
  }
  if (type === "message") {
    const m = state.messages.find((m) => m.id === id);
    return { get: () => m.image, set: (v) => (m.image = v) };
  }
}
async function readImage(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type))
    throw Error("Choose a JPG, PNG or WebP photo.");
  if (file.size > 15 * 1024 * 1024)
    throw Error("Please choose a photo smaller than 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return { src: canvas.toDataURL("image/jpeg", 0.78), zoom: 1, x: 50, y: 50 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
function pickImage(callback, multiple = false) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.multiple = multiple;
  input.onchange = async () => {
    try {
      const images = [];
      for (const file of input.files) images.push(await readImage(file));
      callback(multiple ? images : images[0]);
    } catch (e) {
      toast(e.message);
    }
  };
  input.click();
}
function refreshDetail(key) {
  const [type, id] = key.split(":");
  if (type === "adviser") adviserDetail();
  else if (type === "student") studentDetail(id);
  else if (type === "album") albumDetail(id);
  else if (type === "message") messageDetail(id);
  else if ($("#modal").open) close();
}
function cropImage(key) {
  if (!guard()) return;
  const im = resolveMedia(key).get();
  modal(
    "Make it picture perfect",
    /* HTML */ `
      <div
        class="detail-photo ${key.startsWith("hero:") ? "home-crop-preview" : ""}"
        id="crop-preview"
      >
        ${media(im)}
      </div>
      <form id="crop-form">
        <label class="field">
          Zoom
          <input
            type="range"
            name="zoom"
            min="1"
            max="3"
            step=".05"
            value="${im.zoom || 1}"
          />
        </label>
        <label class="field">
          Horizontal position
          <input
            type="range"
            name="x"
            min="0"
            max="100"
            value="${im.x ?? 50}"
          />
        </label>
        <label class="field">
          Vertical position
          <input
            type="range"
            name="y"
            min="0"
            max="100"
            value="${im.y ?? 50}"
          />
        </label>
        <button class="pill">Save photo</button>
      </form>
    `,
  );
  const f = $("#crop-form");
  f.oninput = () =>
    ($("#crop-preview").innerHTML = media({
      ...im,
      zoom: +f.zoom.value,
      x: +f.x.value,
      y: +f.y.value,
    }));
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!guard()) return;
    if (
      commit(() =>
        resolveMedia(key).set({
          ...im,
          zoom: +f.zoom.value,
          x: +f.x.value,
          y: +f.y.value,
        }),
      )
    )
      refreshDetail(key);
  };
}
function confirmDelete(action) {
  modal(
    "Delete this item?",
    /* HTML */ `
      <p>This removes it from this browser’s saved classroom.</p>
      <div class="actions">
        <button class="outline" id="cancel-delete">Keep it</button>
        <button class="pill" id="confirm-delete">Delete</button>
      </div>
    `,
  );
  $("#cancel-delete").onclick = close;
  $("#confirm-delete").onclick = () => {
    if (guard()) {
      action();
    }
  };
}
function renderHero() {
  $("#class-front").innerHTML = media(state.hero[0], "Our class pictorial");
  $("#class-back").innerHTML = media(state.hero[1], "Our next adventure");
  $("#hero-tools").innerHTML = admin()
    ? /* HTML */ `
        <span>Front</span>
        ${mediaTools("hero:0", state.hero[0])}
        <span>Back</span>
        ${mediaTools("hero:1", state.hero[1])}
      `
    : "";
}
$("#class-photo").onclick = () => $("#class-photo").classList.toggle("flipped");
function studentCard(s) {
  const index = state.students.findIndex((item) => item.id === s.id);
  const hue = Math.round((index * 137.508 + 95) % 360);
  return /* HTML */ `
    <button
      class="student-card"
      style="--student-color:hsl(${hue} 63% 64%);--student-tint:hsl(${hue} 80% 94%)"
      data-student="${s.id}"
      title="${esc(s.name)}"
    >
      <div class="student-photo">${media(s.images[0], s.name)}</div>
      <h4>${esc(s.name)}</h4>
      <p>${esc(s.quote || "A little spark of Cobalt.")}</p>
    </button>
  `;
}
function filteredStudents(group, query = "") {
  const normalize = (s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return state.students
    .filter(
      (s) =>
        s.gender === group && words.every((w) => normalize(s.name).includes(w)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
function studentsHTML(all = false, query = studentQuery) {
  return ["Males", "Females"]
    .map((g) => {
      const list = filteredStudents(g, query),
        searching = Boolean(query.trim());
      return /* HTML */ `
        <div class="student-group">
          <h3>
            ${g}
            <span>/ ${String(list.length).padStart(2, "0")}</span>
          </h3>
          <div class="student-grid ${searching ? "search-results-grid" : ""}">
            ${
              list.length
                ? (all || searching ? list : list.slice(0, 5))
                    .map(studentCard)
                    .join("")
                : /* HTML */ `
                    <div class="empty">
                      ${searching ? "No matching students in this group." : "Your adviser can add students to this group."}
                    </div>
                  `
            }
          </div>
        </div>
      `;
    })
    .join("");
}
function renderStudents() {
  $("#students").innerHTML = studentsHTML();
  const total = ["Males", "Females"].reduce(
    (n, g) => n + filteredStudents(g, studentQuery).length,
    0,
  );
  $("#student-results").textContent = studentQuery.trim()
    ? `${total} matching ${total === 1 ? "student" : "students"}`
    : `${state.students.length} classmates`;
  $("#clear-student-search").hidden = !studentQuery;
}
function addStudent() {
  if (!guard()) return;
  modal(
    "Another classmate in our story",
    /* HTML */ `
      <form id="student-form">
        <label class="field">
          Student name
          <input name="studentName" maxlength="80" required />
        </label>
        <label class="field">
          Group
          <select name="gender">
            <option>Males</option>
            <option>Females</option>
          </select>
        </label>
        <button class="pill">Add student</button>
      </form>
    `,
  );
  $("#student-form").onsubmit = (e) => {
    e.preventDefault();
    if (!guard()) return;
    const f = e.target,
      name = f.studentName.value.trim();
    if (!name) return toast("Please enter a student name.");
    const id = uid();
    if (
      commit(() =>
        state.students.push({
          id,
          name,
          gender: f.gender.value,
          quote: "",
          images: [null, null],
        }),
      )
    )
      studentDetail(id);
  };
}
function studentDetail(id) {
  const s = state.students.find((s) => s.id === id);
  if (!s) return;
  modal(
    s.name,
    /* HTML */ `
      <div class="detail-photos">
        ${s.images
          .map(
            (im, i) => /* HTML */ `
              <div>
                <div class="detail-photo">
                  ${media(im, `${s.name} · photo ${i + 1}`)}
                </div>
                ${mediaTools(`student:${id}:${i}`, im)}
              </div>
            `,
          )
          .join("")}
      </div>
      ${
        admin()
          ? /* HTML */ `
              <form id="quote-form">
                <label class="field">
                  Their words
                  <textarea
                    name="quote"
                    maxlength="300"
                    placeholder="A quote to remember…"
                  >
${esc(s.quote)}</textarea>
                </label>
                <button class="pill">Save quote</button>
              </form>
              <div class="danger-zone">
                <button class="danger-button" data-delete-student="${id}">
                  Delete student
                </button>
              </div>
            `
          : /* HTML */ `
              <p class="hint">${esc(s.quote || "A little spark of Cobalt.")}</p>
            `
      }
    `,
  );
  if (admin())
    $("#quote-form").onsubmit = (e) => {
      e.preventDefault();
      if (!guard()) return;
      const value = e.target.quote.value.trim();
      if (commit(() => (state.students.find((s) => s.id === id).quote = value)))
        toast("Quote saved.");
    };
}
const messageCount = () => (innerWidth <= 760 ? 1 : 3);
const albumCount = () =>
  innerWidth <= 350 ? 1 : innerWidth <= 480 ? 2 : innerWidth <= 760 ? 3 : 4;
function note(m, full = false) {
  const color = /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : "#d6eaff";
  const rgb = color
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16));
  const ink =
    rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 145
      ? "#142c58"
      : "#ffffff";
  return /* HTML */ `
    <article
      class="note ${full ? "note-full" : ""}"
      style="background:${color};color:${ink}"
    >
      ${
        !full
          ? /* HTML */ `
              <button
                class="note-open"
                data-message="${m.id}"
                aria-label="Read message by ${esc(m.name)}"
              ></button>
            `
          : ""
      }
      <div class="note-body ${m.image ? "note-with-image" : ""}">
        <p>${esc(m.text)}</p>
        ${
          m.image
            ? /* HTML */ `
                <div class="note-image-frame">
                  <img
                    class="note-image"
                    src="${esc(m.image.src)}"
                    alt="Photo from ${esc(m.name)}"
                    loading="lazy"
                  />
                </div>
              `
            : ""
        }
      </div>
      <div class="author">
        <strong>— ${esc(m.name)}</strong>
        <span>${esc(m.date)}</span>
      </div>
      ${
        admin()
          ? /* HTML */ `
              <div class="admin-tools">
                <button data-delete-message="${m.id}">Delete message</button>
              </div>
              ${mediaTools(`message:${m.id}`, m.image, false)}
            `
          : ""
      }
    </article>
  `;
}
function renderMessages() {
  const n = messageCount(),
    pages = Math.max(1, Math.ceil(state.messages.length / n));
  messagePage = Math.min(messagePage, pages - 1);
  $("#message-cards").innerHTML = state.messages.length
    ? state.messages
        .slice(messagePage * n, messagePage * n + n)
        .map((m) => note(m))
        .join("")
    : '<div class="empty">The noticeboard is waiting for your first little note.</div>';
  $("#message-dots").innerHTML = Array.from(
    { length: pages },
    (_, i) => /* HTML */ `
      <button
        class="${i === messagePage ? "selected" : ""}"
        data-message-page="${i}"
        aria-label="Message page ${i + 1}"
        aria-current="${i === messagePage}"
      ></button>
    `,
  ).join("");
  $('[data-action="messages-prev"]').disabled = messagePage === 0;
  $('[data-action="messages-next"]').disabled = messagePage >= pages - 1;
}
function messageDetail(id) {
  const m = state.messages.find((m) => m.id === id);
  if (m) modal("A note for Cobalt", note(m, true));
}
$("#message-image").onchange = () =>
  ($("#attachment-note").textContent =
    $("#message-image").files[0]?.name || "");
$("#message-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!user) return login();
  const text = $("#message-text").value.trim();
  if (!text) return toast("Write a little message first.");
  const button = e.target.querySelector("[type=submit]");
  button.disabled = true;
  try {
    const image = $("#message-image").files[0]
      ? await readImage($("#message-image").files[0])
      : null;
    const ok = commit(() =>
      state.messages.unshift({
        id: uid(),
        name: user.name,
        text,
        color: $("#message-color").value,
        image,
        date: new Date().toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      }),
    );
    if (ok) {
      messagePage = 0;
      renderMessages();
      e.target.reset();
      $("#attachment-note").textContent = "";
      $("#message-counter").textContent = "0 / 1000";
      updateComposerColor();
      toast("Your note is on the board.");
    }
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
  }
};
function renderAlbums() {
  const n = albumCount(),
    pages = Math.max(1, Math.ceil(state.albums.length / n));
  albumPage = Math.min(albumPage, pages - 1);
  $("#albums").innerHTML = state.albums.length
    ? state.albums
        .slice(albumPage * n, albumPage * n + n)
        .map(
          (a) => /* HTML */ `
            <button class="album-card" data-album="${a.id}">
              <div class="album-cover">
                ${media(a.images[0], "Memories go here")}
              </div>
              <h3>${esc(a.name)}</h3>
              <p>
                ${a.images.length}
                ${a.images.length === 1 ? "memory" : "memories"} · OPEN ALBUM ↗
              </p>
            </button>
          `,
        )
        .join("")
    : '<div class="empty">Every album starts with a moment.<br><br>Your adviser can create the first one.</div>';
  $("#album-page").textContent = `${albumPage + 1} / ${pages}`;
  $('[data-action="albums-prev"]').disabled = albumPage === 0;
  $('[data-action="albums-next"]').disabled = albumPage >= pages - 1;
}
function addAlbum() {
  if (!guard()) return;
  modal(
    "Save a chapter",
    /* HTML */ `
      <form id="album-form">
        <label class="field">
          Album name
          <input
            name="albumName"
            required
            maxlength="80"
            placeholder="Our first day together"
          />
        </label>
        <button class="pill">Create album</button>
      </form>
    `,
  );
  $("#album-form").onsubmit = (e) => {
    e.preventDefault();
    if (!guard()) return;
    const name = e.target.albumName.value.trim();
    if (!name) return toast("Please enter an album name.");
    const id = uid();
    if (commit(() => state.albums.push({ id, name, images: [] })))
      albumDetail(id);
  };
}
function albumDetail(id) {
  const a = state.albums.find((a) => a.id === id);
  if (!a) return;
  modal(
    a.name,
    `${
      admin()
        ? /* HTML */ `
            <div class="album-actions">
              <button class="pill" id="album-upload">+ Add photos</button>
              <button class="danger-button" data-delete-album="${id}">
                Delete album
              </button>
            </div>
            <p class="hint">Select one or more favorite moments.</p>
          `
        : ""
    }<div class="gallery">${
      a.images.length
        ? a.images
            .map(
              (im) => /* HTML */ `
                <div>
                  <button
                    type="button"
                    class="gallery-image"
                    data-album-photo="${im.id}"
                    data-photo-album="${a.id}"
                    aria-label="View full photo in ${esc(a.name)}"
                  >
                    ${media(im, a.name)}
                  </button>
                  ${mediaTools(`album:${id}:${im.id}`, im)}
                </div>
              `,
            )
            .join("")
        : '<div class="empty">The next memory belongs here.</div>'
    }</div>`,
  );
  if (admin())
    $("#album-upload").onclick = () => {
      if (guard())
        pickImage((images) => {
          if (!guard()) return;
          if (
            commit(() =>
              state.albums
                .find((a) => a.id === id)
                .images.push(...images.map((im) => ({ ...im, id: uid() }))),
            )
          )
            albumDetail(id);
        }, true);
    };
}
const encouragements = [
  "You do not have to figure everything out today.",
  "A difficult day does not erase how far you have come.",
  "You belong here, even on the days you feel out of place.",
  "Rest is part of growing. You are allowed to pause.",
  "One small step is still a step forward.",
  "Your grades are a part of your story, not your whole identity.",
  "You can be proud of yourself for trying.",
  "It is okay to ask someone to sit with you for a while.",
  "You have time to become the person you want to be.",
  "Today can be messy and still contain a good moment.",
  "You are allowed to start again without having everything sorted.",
  "Learning something slowly is still learning.",
  "Your kindness matters more than you might realize.",
  "Take a breath. You only need to do the next little thing.",
  "You do not need to earn a place in this classroom.",
  "Not knowing yet is where learning begins.",
  "You can feel disappointed and still be worthy of care.",
  "Some progress is too quiet to notice right away.",
  "Asking for help is a skill worth practicing.",
  "Let yourself enjoy one simple thing today.",
  "You do not have to match anyone else’s pace.",
  "One mistake is not the ending of your story.",
  "Your voice deserves space, even if it shakes.",
  "You can set down something that is too heavy for today.",
  "There is more to you than your hardest moment.",
  "You are allowed to change your mind as you learn.",
  "Being a beginner takes courage.",
  "A kind word to yourself counts, too.",
  "You can care deeply and still need a break.",
  "Your effort has value even before the results arrive.",
  "Today’s goal can simply be getting through today.",
  "You are not behind in becoming yourself.",
  "Let the next breath be a fresh beginning.",
  "You can be both a work in progress and someone worth celebrating.",
  "It is okay if your best looks different today.",
  "You deserve friends who make room for the real you.",
  "You can take a hard task one question at a time.",
  "Your curiosity is worth keeping.",
  "You do not have to hide every feeling behind a smile.",
  "Small joys are still real joys.",
  "Give yourself the patience you would give a friend.",
  "You can try a different way without calling the first try a failure.",
  "A quiet contribution can make a big difference.",
  "You have permission to say that you need support.",
  "Your future has room for possibilities you have not met yet.",
  "You are more than a comparison with someone else.",
  "An unfinished task can wait while you take care of yourself.",
  "You do not have to be perfect to make a good memory.",
  "Sometimes courage looks like showing up quietly.",
  "Notice one thing you did today that took effort.",
  "Your feelings do not need to be the same as everyone else’s.",
  "You can miss an opportunity and still find another direction.",
  "You deserve a gentle conversation with yourself.",
  "You do not have to turn every moment into an achievement.",
  "Being thoughtful is a strength.",
  "You can celebrate a small win without explaining it.",
  "The next page does not have to look like this one.",
  "You can learn from yesterday without living there.",
  "Let yourself be supported by people you trust.",
  "You bring something to this class that no one else can bring.",
  "A pause can help you see the next step more clearly.",
  "You are allowed to find some things difficult.",
  "It is never silly to care about something that matters to you.",
  "You can ask for an explanation one more time.",
  "Your dreams are allowed to grow and change.",
  "You are worth listening to.",
  "You can be kind without saying yes to everything.",
  "You do not need a big reason to take a calming breath.",
  "Trying again can begin with something very small.",
  "There is room for your questions here.",
  "Your worth does not disappear when you need help.",
  "You can do something brave while feeling nervous.",
  "Take a moment to unclench your shoulders.",
  "You can choose one manageable thing and let that be enough for now.",
  "You deserve encouragement on ordinary days, too.",
  "It is okay to feel proud of progress that others cannot see.",
  "A tough lesson can be approached with a fresh start tomorrow.",
  "Your gentleness is not a weakness.",
  "You are allowed to have interests that make you different.",
  "You can make room for hope without forcing yourself to feel happy.",
  "The care you give others is care you deserve as well.",
  "Your presence matters beyond what you produce.",
  "You can spend a moment outside your worries.",
  "Learning to rest is something you can practice.",
  "You do not have to have the right words to reach out.",
  "You can make today a little softer for yourself.",
  "You are not a problem to be solved.",
  "There is value in the things you notice and wonder about.",
  "You can leave room for an unexpected good moment.",
  "You are allowed to be proud and nervous at the same time.",
  "You can take feedback without turning it into a judgment of your worth.",
  "A favorite song or a quiet minute can be a small comfort.",
  "You can return to a goal after taking a break.",
  "You deserve respect while you are still learning.",
  "You can let someone know that today has been hard.",
  "Your path can have bends and still be your own.",
  "You can choose patience over pressure for the next few minutes.",
  "You do not need to solve tomorrow before going to sleep tonight.",
  "You are part of our class, on your bright days and your cloudy ones.",
  "For this moment, let being yourself be enough.",
];
function nextEncouragement() {
  let index;
  const success = commit(() => {
    if (!state.deck.length) {
      state.deck = encouragements.map((_, i) => i);
      for (let i = state.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
      }
      if (state.deck.at(-1) === state.last)
        [state.deck[0], state.deck[state.deck.length - 1]] = [
          state.deck.at(-1),
          state.deck[0],
        ];
    }
    index = state.deck.pop();
    state.last = index;
  });
  if (!success) return null;
  const text = encouragements[index];
  modal(
    "A little sunshine for you",
    /* HTML */ `
      <div class="encouragement">
        <span>☀</span>
        <p>${esc(text)}</p>
        <button class="pill" id="another-reminder">
          One more little reminder
        </button>
        <p class="hint" style="font:14px 'DM Sans',sans-serif">
          ${100 - state.deck.length} of 100 reminders in this round
        </p>
      </div>
    `,
  );
  $("#another-reminder").onclick = nextEncouragement;
  return { message: text, remaining: state.deck.length };
}
$("#encourage").onclick = nextEncouragement;
const actions = {
  "all-students": () =>
    modal(
      "Our classmates",
      /* HTML */ `
        <div class="all-students">${studentsHTML(true, "")}</div>
      `,
    ),
  "add-student": addStudent,
  "all-messages": () =>
    modal(
      "Our noticeboard",
      /* HTML */ `
        <div class="all-notes">
          ${state.messages.length ? state.messages.map((m) => note(m, true)).join("") : "<p>No notes yet. Yours can be the first.</p>"}
        </div>
      `,
    ),
  "messages-prev": () => {
    messagePage = Math.max(0, messagePage - 1);
    renderMessages();
  },
  "messages-next": () => {
    messagePage++;
    renderMessages();
  },
  "add-album": addAlbum,
  "albums-prev": () => {
    albumPage = Math.max(0, albumPage - 1);
    renderAlbums();
  },
  "albums-next": () => {
    albumPage++;
    renderAlbums();
  },
};
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.noteColor) {
    $("#message-color").value = d.noteColor;
    updateComposerColor();
  } else if (d.action) actions[d.action]?.();
  else if (d.student) studentDetail(d.student);
  else if (d.albumPhoto) albumPhotoDetail(d.photoAlbum, d.albumPhoto);
  else if (d.album) albumDetail(d.album);
  else if (d.message) messageDetail(d.message);
  else if (d.messagePage !== undefined) {
    messagePage = +d.messagePage;
    renderMessages();
  } else if (d.media) {
    if (guard())
      pickImage((image) => {
        if (guard() && commit(() => resolveMedia(d.media).set(image)))
          refreshDetail(d.media);
      });
  } else if (d.resize) cropImage(d.resize);
  else if (d.remove) {
    if (guard())
      confirmDelete(() => {
        if (commit(() => resolveMedia(d.remove).set(null)))
          refreshDetail(d.remove);
      });
  } else if (d.deleteStudent) {
    deleteStudent(d.deleteStudent);
  } else if (d.deleteAlbum) {
    deleteAlbum(d.deleteAlbum);
  } else if (d.deleteMessage) {
    if (guard())
      confirmDelete(() => {
        if (
          commit(
            () =>
              (state.messages = state.messages.filter(
                (m) => m.id !== d.deleteMessage,
              )),
          )
        )
          close();
      });
  }
});
function render() {
  account();
  renderHero();
  renderStudents();
  renderMessages();
  renderAlbums();
}
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries)
      if (entry.isIntersecting) {
        $$("nav a").forEach((a) => {
          const active = a.hash === "#" + entry.target.id;
          a.classList.toggle("active", active);
          if (active) a.setAttribute("aria-current", "location");
          else a.removeAttribute("aria-current");
        });
      }
  },
  { rootMargin: "-30% 0px -50% 0px", threshold: 0 },
);
$$("main>section").forEach((s) => observer.observe(s));
window.addEventListener("resize", () => {
  renderMessages();
  renderAlbums();
});
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: "show_cobalt_encouragement",
        description:
          "Show the next non-repeating encouragement in the classroom dialog.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input) => {
          if (!input || typeof input !== "object" || Object.keys(input).length)
            throw Error("Expected an empty object.");
          return nextEncouragement();
        },
      }),
    ).catch(() => {});
  } catch {}
}
render();

// The same colors appear in the writing area and on the pinned note.
function updateComposerColor() {
  const color = $("#message-color").value;
  $("#message-form").style.setProperty("--chosen-note", color);
  $$(".swatches button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.noteColor === color)),
  );
}
$("#message-color").addEventListener("input", updateComposerColor);
$("#message-text").addEventListener(
  "input",
  () =>
    ($("#message-counter").textContent =
      `${$("#message-text").value.length} / 1000`),
);
updateComposerColor();
// A short, skippable opening; all controls remain accessible after dismissal.
const intro = $("#opening");

function dismissOpening() {
  intro.classList.add("dismissed");
  document.body.classList.remove("opening-active");
  for (const el of [$("#site-header"), $("main"), $(".section-rail")])
    el.inert = false;
  setTimeout(() => {
    intro.hidden = true;
  }, 650);
}
$("#skip-opening").addEventListener("click", () => {
  dismissOpening();
  $("header .brand").focus();
});
// Entry is always explicit, including when reduced motion is enabled.
document.body.classList.add("opening-active");
for (const el of [$("#site-header"), $("main"), $(".section-rail")])
  el.inert = true;
if (matchMedia("(prefers-reduced-motion: reduce)").matches)
  intro.classList.add("reduced-opening");
// Native scroll snapping centers sections below the header without trapping long content.
let scrollFrame = 0;
function updateSectionNavigation() {
  const headerHeight = $("#site-header").getBoundingClientRect().height;
  document.documentElement.style.setProperty(
    "--header-height",
    `${headerHeight}px`,
  );
  const center = headerHeight + (innerHeight - headerHeight) / 2;
  const panels = $$("main>section");
  const nearest = panels.reduce(
    (best, p) => {
      const r = p.getBoundingClientRect(),
        distance =
          center < r.top
            ? r.top - center
            : center > r.bottom
              ? center - r.bottom
              : 0;
      return distance < best.distance ? { id: p.id, distance } : best;
    },
    { id: "home", distance: Infinity },
  );
  $$("header nav a,.section-rail a").forEach((a) => {
    const active = a.hash === "#" + nearest.id;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "location");
    else a.removeAttribute("aria-current");
  });
  scrollFrame = 0;
}
observer.disconnect();
addEventListener(
  "scroll",
  () => {
    if (!scrollFrame)
      scrollFrame = requestAnimationFrame(updateSectionNavigation);
  },
  { passive: true },
);
addEventListener("resize", updateSectionNavigation);
updateSectionNavigation();

$("#student-search").addEventListener("input", (e) => {
  studentQuery = e.target.value;
  renderStudents();
});
$("#clear-student-search").addEventListener("click", () => {
  studentQuery = "";
  $("#student-search").value = "";
  renderStudents();
  $("#student-search").focus();
});
$("#meet-adviser").addEventListener("click", adviserDetail);
function adviserDetail() {
  const a = state.adviser;
  modal(
    "Meet our adviser",
    /* HTML */ `
      <div class="adviser-profile">
        <div>
          <div class="adviser-photo">
            ${media(a.image, "Your adviser’s photo")}
          </div>
          ${mediaTools("adviser:main", a.image)}
        </div>
        <div class="adviser-copy">
          <p class="eyebrow">GRADE 9 · COBALT</p>
          <h3>${esc(a.name || "Your Cobalt adviser")}</h3>
          <p class="adviser-message">
            ${esc(a.message || "A message from your adviser will appear here.")}
          </p>
        </div>
      </div>
      ${
        admin()
          ? /* HTML */ `
              <form id="adviser-form">
                <label class="field">
                  Your name
                  <input
                    name="adviserName"
                    maxlength="100"
                    value="${esc(a.name)}"
                    placeholder="Enter your name"
                    required
                  />
                </label>
                <label class="field">
                  Your message to the class
                  <textarea
                    name="adviserMessage"
                    maxlength="2000"
                    placeholder="Dear classmates, …"
                  >
${esc(a.message)}</textarea>
                </label>
                <button class="pill">Save adviser profile</button>
              </form>
            `
          : ""
      }
    `,
  );
  if (admin())
    $("#adviser-form").onsubmit = (e) => {
      e.preventDefault();
      if (!guard()) return;
      const name = e.target.adviserName.value.trim(),
        message = e.target.adviserMessage.value.trim();
      if (!name) return toast("Please enter your name.");
      if (
        commit(() => {
          state.adviser.name = name;
          state.adviser.message = message;
        })
      ) {
        adviserDetail();
        toast("Adviser profile saved.");
      }
    };
}
async function changeSession(nextUser) {
  if (authBusy) return;
  authBusy = true;
  const signingIn = Boolean(nextUser);
  modal(
    signingIn ? "Signing you in…" : "Signing you out…",
    /* HTML */ `
      <div class="session-state" role="status">
        <div class="session-loader">
          <img src="assets/cobalt-mark.svg" alt="" width="52" height="52" />
        </div>
        <p>
          ${signingIn ? "Getting your classroom ready." : "Wrapping up your visit."}
        </p>
      </div>
    `,
  );
  $("#close-modal").disabled = true;
  await new Promise((resolve) => setTimeout(resolve, 850));
  user = nextUser;
  authBusy = false;
  $("#close-modal").disabled = false;
  render();
  modal(
    signingIn ? "You’re signed in!" : "You’re signed out",
    /* HTML */ `
      <div class="session-state">
        <span class="session-check" aria-hidden="true">✓</span>
        <h3>
          ${signingIn ? `Welcome, ${esc(nextUser.name)}!` : "See you in the classroom!"}
        </h3>
        <p>
          ${signingIn ? "You’re ready to leave a little kindness." : "Your classroom content is still saved in this browser."}
        </p>
        <button class="pill" id="session-done">
          ${signingIn ? "Back to the classroom" : "Got it"}
        </button>
      </div>
    `,
  );
  $("#session-done").onclick = close;
}
// Persist the merged roster using the existing classroom storage key.
save();

function confirmRemoval(title, description, onConfirm) {
  if (!guard()) return;
  modal(
    title,
    /* HTML */ `
      <p class="hint">${esc(description)}</p>
      <div class="actions">
        <button class="outline" id="keep-item">Keep it</button>
        <button class="danger-button" id="remove-item">
          Delete permanently
        </button>
      </div>
    `,
  );
  $("#keep-item").onclick = close;
  $("#remove-item").onclick = () => {
    if (guard()) onConfirm();
  };
}
function deleteStudent(id) {
  if (!guard()) return;
  const student = state.students.find((s) => s.id === id);
  if (!student) return;
  confirmRemoval(
    "Delete this student?",
    `Remove ${student.name}, their quote and both profile photos from this browser? This does not delete their sign-in account.`,
    () => {
      if (
        commit(() => {
          state.deletedStudents ??= [];
          state.deletedStudents.push({ id: student.id, name: student.name });
          state.students = state.students.filter((s) => s.id !== id);
        })
      ) {
        close();
        toast("Student deleted.");
      }
    },
  );
}
function deleteAlbum(id) {
  if (!guard()) return;
  const album = state.albums.find((a) => a.id === id);
  if (!album) return;
  confirmRemoval(
    "Delete this album?",
    `Remove “${album.name}” and all ${album.images.length} photos in it from this browser?`,
    () => {
      if (
        commit(() => (state.albums = state.albums.filter((a) => a.id !== id)))
      ) {
        close();
        toast("Album deleted.");
      }
    },
  );
}

function albumPhotoDetail(albumId, imageId) {
  const album = state.albums.find((a) => a.id === albumId);
  const photo = album?.images.find((image) => image.id === imageId);
  if (!photo) return;
  modal(
    album.name,
    /* HTML */ `
      <div class="album-photo-view">
        <img src="${esc(photo.src)}" alt="${esc(album.name)} — full photo" />
      </div>
      <div class="photo-view-actions">
        <button class="outline" id="back-to-album">← Back to album</button>
      </div>
    `,
  );
  $("#modal").classList.add("image-viewer-modal");
  $("#back-to-album").onclick = () => albumDetail(albumId);
}
