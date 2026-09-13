"use strict";
// Device-local account store. Passwords use unique salts and PBKDF2-SHA-256.
// Client-side state is not a security boundary for a publicly hosted website.
window.CobaltAuth = (() => {
  const KEY = "cobalt-accounts-v1";
  const ITERATIONS = 210000;
  const normalize = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase();
  const hex = (bytes) =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  function accounts() {
    let raw;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      throw Error(
        "Account storage is unavailable. Allow browser storage and try again.",
      );
    }
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) throw Error();
      return list;
    } catch {
      throw Error(
        "The saved account data could not be read. It has not been overwritten.",
      );
    }
  }
  function config() {
    const admin = window.COBALT_ADMIN;
    if (!admin?.username || !admin?.password)
      throw Error("The temporary admin account is not configured.");
    return admin;
  }
  async function hash(password, salt) {
    if (!globalThis.crypto?.subtle)
      throw Error(
        "This browser cannot safely save passwords here. Open the site in a modern browser using a local file, localhost, or HTTPS.",
      );
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const result = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: new Uint8Array(salt.match(/../g).map((h) => parseInt(h, 16))),
        iterations: ITERATIONS,
      },
      key,
      256,
    );
    return hex(new Uint8Array(result));
  }
  async function register({ name, username, password, confirmation }) {
    name = String(name ?? "").trim();
    username = normalize(username);
    if (!name || name.length > 60)
      throw Error("Enter a display name of 1–60 characters.");
    if (!/^[a-z0-9._-]{3,32}$/.test(username))
      throw Error(
        "Use 3–32 letters, numbers, dots, underscores or hyphens for your username.",
      );
    if (username === normalize(config().username))
      throw Error("This username is reserved. Choose another one.");
    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    )
      throw Error("Use a password of 8–128 characters.");
    if (password !== confirmation) throw Error("The passwords do not match.");
    if (accounts().some((a) => a.username === username))
      throw Error(
        "That username already exists. Sign in or choose another username.",
      );
    if (!globalThis.crypto?.subtle)
      throw Error(
        "Use a modern browser that supports secure password hashing.",
      );
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash = await hash(password, salt);
    const list = accounts();
    if (list.some((a) => a.username === username))
      throw Error("That username already exists. Please sign in.");
    list.push({
      id: crypto.randomUUID(),
      name,
      username,
      salt,
      passwordHash,
      algorithm: "PBKDF2-SHA-256",
      iterations: ITERATIONS,
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      throw Error(
        "Your account could not be saved. Browser storage is full or unavailable.",
      );
    }
    return { username };
  }
  async function signIn({ username, password }) {
    username = normalize(username);
    if (
      !username ||
      typeof password !== "string" ||
      !password ||
      password.length > 128
    )
      throw Error("Enter your username and password.");
    const admin = config();
    if (username === normalize(admin.username)) {
      if (password !== admin.password)
        throw Error("Incorrect username or password.");
      return {
        id: "temporary-admin",
        username,
        name: admin.displayName,
        role: "admin",
      };
    }
    const record = accounts().find((a) => a.username === username);
    if (
      !record ||
      !/^[a-f0-9]{32}$/.test(record.salt) ||
      !/^[a-f0-9]{64}$/.test(record.passwordHash)
    )
      throw Error("Incorrect username or password.");
    const candidate = await hash(password, record.salt);
    let difference = 0;
    for (let i = 0; i < candidate.length; i++)
      difference |= candidate.charCodeAt(i) ^ record.passwordHash.charCodeAt(i);
    if (difference) throw Error("Incorrect username or password.");
    // Never read a role from the user account record or registration input.
    return { id: record.id, username, name: record.name, role: "student" };
  }
  return Object.freeze({ register, signIn });
})();
