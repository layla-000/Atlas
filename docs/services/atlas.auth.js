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
        <p>Layla Hub에 등록된 이메일로 로그인해요. 이메일로 로그인 링크를 보내드려요.</p>
        <input id="atlas-auth-email" type="email" autocomplete="email" placeholder="email@example.com" required>
        <button type="submit">로그인 링크 받기</button>
        <div class="atlas-auth-message" id="atlas-auth-message"></div>
      </form>`;
    document.body.appendChild(gate);

    gate.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = gate.querySelector("#atlas-auth-email").value;
      const button = gate.querySelector("button");
      const message = gate.querySelector("#atlas-auth-message");
      button.disabled = true;
      message.textContent = "로그인 링크를 보내는 중이에요…";
      try {
        await AtlasSupabase.signInWithEmail(email);
        message.textContent = "메일을 확인해 주세요. 링크를 누르면 Atlas로 돌아와요.";
      } catch (error) {
        message.textContent = error?.message || "로그인 링크를 보내지 못했어요.";
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
