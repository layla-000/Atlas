window.AtlasAuth = (() => {
  let gatePromise = null;
  let gateResolve = null;

  function ensureStyles() {
    if (document.getElementById("atlas-auth-style")) return;
    const style = document.createElement("style");
    style.id = "atlas-auth-style";
    style.textContent = `
      .atlas-auth-gate{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:#141817;color:#f2f4f3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .atlas-auth-card{width:min(100%,420px);padding:28px;border:1px solid rgba(192,192,192,.18);border-radius:28px;background:#1f2423;box-shadow:0 24px 80px rgba(0,0,0,.42)}
      .atlas-auth-card h1{margin:0;font-size:34px}.atlas-auth-card p{color:#c0c0c0;line-height:1.6}
      .atlas-auth-card input{width:100%;padding:14px 16px;border:1px solid rgba(192,192,192,.22);border-radius:14px;background:#141817;color:#fff;font:inherit}
      .atlas-auth-card button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:14px;background:#36c7b7;color:#071817;font-weight:800;cursor:pointer}
      .atlas-auth-message{min-height:22px;margin-top:12px;color:#c0c0c0;font-size:13px}
      .atlas-auth-logout{margin-left:auto;border:1px solid rgba(192,192,192,.2);border-radius:999px;padding:7px 12px;background:transparent;color:#c0c0c0;cursor:pointer}
    `;
    document.head.appendChild(style);
  }

  async function requireSession() {
    ensureStyles();
    const session = await AtlasSupabase.getSession();
    if (session) return session;

    if (!gatePromise) {
      gatePromise = new Promise((resolve) => { gateResolve = resolve; });
      renderGate();
      AtlasSupabase.onAuthStateChange((event, nextSession) => {
        if (nextSession && gateResolve) {
          document.getElementById("atlas-auth-gate")?.remove();
          const resolve = gateResolve;
          gateResolve = null;
          gatePromise = null;
          resolve(nextSession);
        }
      });
    }
    return gatePromise;
  }

  function renderGate() {
    document.getElementById("atlas-auth-gate")?.remove();
    const gate = document.createElement("div");
    gate.id = "atlas-auth-gate";
    gate.className = "atlas-auth-gate";
    gate.innerHTML = `
      <form class="atlas-auth-card" id="atlas-auth-form">
        <h1>ATLAS</h1>
        <p>Layla Hub에 등록된 계정으로 로그인해요.</p>
        <input id="atlas-auth-email" type="email" autocomplete="username" placeholder="이메일" required>
        <input id="atlas-auth-password" type="password" autocomplete="current-password" placeholder="비밀번호" required>
        <button type="submit">로그인</button>
        <div class="atlas-auth-message" id="atlas-auth-message"></div>
      </form>`;
    document.body.appendChild(gate);

    gate.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = gate.querySelector("#atlas-auth-email").value;
      const password = gate.querySelector("#atlas-auth-password").value;
      const button = gate.querySelector("button");
      const message = gate.querySelector("#atlas-auth-message");
      button.disabled = true;
      message.textContent = "로그인하는 중이에요…";
      try {
        await AtlasSupabase.signInWithPassword(email, password);
        message.textContent = "로그인했어요.";
      } catch (error) {
        const raw = String(error?.message || "").toLowerCase();
        if (raw.includes("invalid login credentials")) {
          message.textContent = "이메일 또는 비밀번호가 맞지 않아요.";
        } else if (raw.includes("email not confirmed")) {
          message.textContent = "이메일 인증이 완료되지 않은 계정이에요.";
        } else {
          message.textContent = error?.message || "로그인하지 못했어요.";
        }
      } finally {
        button.disabled = false;
      }
    });
  }

  async function signOut() {
    await AtlasSupabase.signOut();
    window.location.reload();
  }

  return { requireSession, signOut };
})();
