window.AtlasSupabase = (() => {
  let client = null;

  function getClient() {
    if (client) return client;
    const cfg = window.AtlasConfig?.supabase || {};
    if (!window.supabase?.createClient) {
      throw new Error("Supabase JS가 로드되지 않았어요.");
    }
    if (!cfg.url || !cfg.publishableKey) {
      throw new Error("Layla Hub Supabase 설정이 없어요.");
    }

    client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return client;
  }

  async function getSession() {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function getUser() {
    const { data, error } = await getClient().auth.getUser();
    if (error) return null;
    return data.user || null;
  }

  async function signInWithPassword(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({
      email: String(email || "").trim(),
      password: String(password || "")
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await getClient().auth.signOut();
    if (error) throw error;
  }

  function onAuthStateChange(callback) {
    return getClient().auth.onAuthStateChange(callback);
  }

  return { getClient, getSession, getUser, signInWithPassword, signOut, onAuthStateChange };
})();
