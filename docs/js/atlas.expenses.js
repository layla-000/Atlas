const ATLAS_EXPENSE_CURRENCIES = [
  "KRW", "USD", "EUR", "TRY", "JPY", "CNY", "HKD",
  "TWD", "GBP", "CAD", "AUD", "THB", "VND", "INR"
];

const AtlasExpenses = (() => {
  const TRIP_ID = () => window.AtlasConfig?.atlas?.defaultTripId || "trip_turkiye_2026";
  let items = [];

  async function initialize() {
    await AtlasAuth.requireSession();
    const role = await AtlasAPI.getRole(TRIP_ID());
    if (role !== "owner") {
      document.getElementById("expenses-app").innerHTML = '<div class="utility-empty">가계부는 Owner 전용이에요.</div>';
      return;
    }
    const dateInput = document.querySelector('[name="spentAt"]');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);
    bind();
    await reload();
  }

  function bind() {
    document.getElementById("expense-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const f = new FormData(event.target);
      const currency = String(f.get("currency") || "KRW").toUpperCase();
      let rate = currency === "KRW" ? 1 : Number(f.get("exchangeRate") || 0);
      if (currency !== "KRW" && !rate) {
        try {
          const fx = await AtlasAPI.getExchangeRateToKrw(currency);
          rate = fx.rate;
          const rateInput = event.target.querySelector('[name="exchangeRate"]');
          if (rateInput) rateInput.value = rate.toFixed(4);
        } catch (error) {
          alert((error?.message || "자동 환율을 가져오지 못했어요.") + "\n결제 당시 환율을 직접 입력해 주세요.");
          return;
        }
      }
      await AtlasAPI.addExpense({
        tripId: TRIP_ID(), spentAt: f.get("spentAt"), category: f.get("category"), merchant: f.get("merchant"), memo: f.get("memo"),
        amount: f.get("amount"), currency, exchangeRate: rate, paymentMethod: f.get("paymentMethod")
      });
      const keepDate = f.get("spentAt");
      event.target.reset();
      event.target.querySelector('[name="spentAt"]').value = keepDate;
      event.target.querySelector('[name="currency"]').value = currency;
      await reload();
    });
  }

  async function reload() { items = await AtlasAPI.getExpenses(TRIP_ID()); render(); }

  function render() {
    const total = items.reduce((sum, item) => sum + Number(item.krw_amount || 0), 0);
    document.getElementById("expense-total").textContent = `${Math.round(total).toLocaleString("ko-KR")}원`;
    document.getElementById("expense-list").innerHTML = items.length ? items.map((row) => `
      <div class="expense-row">
        <div><strong>${escapeHtml(row.merchant || row.category || "지출")}</strong><span>${escapeHtml(row.spent_at || "")} · ${escapeHtml(row.category || "기타")}</span>${row.memo ? `<small>${escapeHtml(row.memo)}</small>` : ""}</div>
        <div class="expense-amount"><strong>${Number(row.krw_amount || 0).toLocaleString("ko-KR")}원</strong><span>${Number(row.original_amount || 0).toLocaleString()} ${escapeHtml(row.currency || "KRW")}</span><button onclick="AtlasExpenses.remove('${row.id}')">삭제</button></div>
      </div>`).join("") : '<div class="utility-empty">아직 지출 내역이 없어요.</div>';
  }

  async function remove(id) { if (!confirm("이 지출을 삭제할까요?")) return; await AtlasAPI.deleteExpense(id); await reload(); }
  function escapeHtml(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
  return { initialize, remove };
})();
window.addEventListener("DOMContentLoaded", AtlasExpenses.initialize);

function atlasPopulateExpenseCurrencySelect() {
  const select =
    document.getElementById("expense-currency") ||
    document.querySelector('[name="currency"]');

  if (!select || select.tagName !== "SELECT") return;

  const current = select.value || "TRY";
  select.innerHTML = ATLAS_EXPENSE_CURRENCIES
    .map((code) => `<option value="${code}">${code}</option>`)
    .join("");

  select.value = ATLAS_EXPENSE_CURRENCIES.includes(current) ? current : "TRY";
}

window.addEventListener("DOMContentLoaded", atlasPopulateExpenseCurrencySelect);
