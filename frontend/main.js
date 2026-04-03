import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  GoogleAuthProvider,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = window.__FIREBASE_CONFIG__;
const apiBaseUrl = window.__API_BASE_URL__;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await setPersistence(auth, browserSessionPersistence);

const ui = {
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  signupBtn: document.getElementById("signupBtn"),
  loginBtn: document.getElementById("loginBtn"),
  googleBtn: document.getElementById("googleBtn"),
  whoamiBtn: document.getElementById("whoamiBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  linkCalendarBtn: document.getElementById("linkCalendarBtn"),
  unlinkCalendarBtn: document.getElementById("unlinkCalendarBtn"),
  calendarStatus: document.getElementById("calendarStatus"),
  sessionInfo: document.getElementById("sessionInfo"),
  output: document.getElementById("output"),
};

let idToken = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    idToken = null;
    ui.sessionInfo.textContent = "Not authenticated.";
    ui.calendarStatus.textContent = "Calendar not linked.";
    return;
  }

  idToken = await user.getIdToken(true);
  ui.sessionInfo.textContent = `Authenticated as ${user.email}`;
  await refreshCalendarStatus();
});

ui.signupBtn.addEventListener("click", async () => {
  try {
    await createUserWithEmailAndPassword(auth, ui.email.value, ui.password.value);
    ui.output.textContent = "Sign-up successful.";
  } catch (error) {
    ui.output.textContent = error.message;
  }
});

ui.loginBtn.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(auth, ui.email.value, ui.password.value);
    ui.output.textContent = "Login successful.";
  } catch (error) {
    ui.output.textContent = error.message;
  }
});

ui.googleBtn.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    ui.output.textContent = "Google login successful.";
  } catch (error) {
    ui.output.textContent = error.message;
  }
});

ui.logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  ui.output.textContent = "Logged out.";
});

ui.linkCalendarBtn.addEventListener("click", async () => {
  if (!idToken) {
    ui.output.textContent = "Authenticate first.";
    return;
  }

  try {
    const start = await fetch(`${apiBaseUrl}/users/me/google-calendar/link/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    const startData = await start.json();
    if (!start.ok) {
      ui.output.textContent = JSON.stringify(startData, null, 2);
      return;
    }

    const authWindow = window.open(startData.authorization_url, "google-calendar-link", "width=520,height=720");
    if (!authWindow) {
      ui.output.textContent = "Failed to open OAuth window. Allow pop-ups and try again.";
      return;
    }

    const oauthPayload = await waitForOAuthMessage();
    if (oauthPayload.error) {
      ui.output.textContent = oauthPayload.error;
      return;
    }

    const complete = await fetch(`${apiBaseUrl}/users/me/google-calendar/link/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: oauthPayload.code,
        state: oauthPayload.state,
      }),
    });
    const completeData = await complete.json();
    if (!complete.ok) {
      ui.output.textContent = JSON.stringify(completeData, null, 2);
      return;
    }

    ui.output.textContent = "Google Calendar linked successfully.";
    await refreshCalendarStatus();
  } catch (error) {
    ui.output.textContent = error.message;
  }
});

ui.unlinkCalendarBtn.addEventListener("click", async () => {
  if (!idToken) {
    ui.output.textContent = "Authenticate first.";
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/users/me/google-calendar/link`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      ui.output.textContent = JSON.stringify(data, null, 2);
      return;
    }

    ui.output.textContent = "Google Calendar unlinked.";
    await refreshCalendarStatus();
  } catch (error) {
    ui.output.textContent = error.message;
  }
});

ui.whoamiBtn.addEventListener("click", async () => {
  if (!idToken) {
    ui.output.textContent = "Authenticate first.";
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/users/me`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    const data = await response.json();
    ui.output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    ui.output.textContent = error.message;
  }
});

async function refreshCalendarStatus() {
  if (!idToken) {
    ui.calendarStatus.textContent = "Calendar not linked.";
    return;
  }

  const response = await fetch(`${apiBaseUrl}/users/me/google-calendar/status`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    ui.calendarStatus.textContent = "Calendar status unavailable.";
    return;
  }

  ui.calendarStatus.textContent = data.linked
    ? `Linked as ${data.google_email}`
    : "Calendar not linked.";
}

function waitForOAuthMessage() {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("OAuth flow timed out."));
    }, 180000);

    function onMessage(event) {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!event.data || event.data.type !== "google-calendar-oauth") {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      resolve(event.data);
    }

    window.addEventListener("message", onMessage);
  });
}
