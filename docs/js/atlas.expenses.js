const ATLAS_EXPENSE_CURRENCIES = [
  "KRW", "USD", "EUR", "TRY", "JPY", "CNY", "HKD",
  "TWD", "GBP", "CAD", "AUD", "THB", "VND", "INR"
];

const AtlasExpenses = (() => {
  const TRIP_ID = () => window.AtlasConfig?.atlas?.defaultTripId || "trip_turkiye_2026";
  let items = [];
  let categoryFilter = "all";
  let paymentFilter = "all";
  let editingId = null;

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
    bindFilters();
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
      const payload = {
        tripId: TRIP_ID(), spentAt: f.get("spentAt"), category: f.get("category"), merchant: f.get("merchant"), memo: f.get("memo"),
        amount: f.get("amount"), currency, exchangeRate: rate, paymentMethod: f.get("paymentMethod")
      };

      if (editingId) {
        await AtlasAPI.updateExpense(editingId, payload);
      } else {
        await AtlasAPI.addExpense(payload);
      }

      const keepDate = f.get("spentAt");
      resetForm(event.target, keepDate, currency);
      await reload();
    });
  }

  async function reload() { items = await AtlasAPI.getExpenses(TRIP_ID()); render(); }

  function render() {
    const total = items.reduce((sum, item) => sum + Number(item.krw_amount || 0), 0);
    document.getElementById("expense-total").textContent = `${Math.round(total).toLocaleString("ko-KR")}원`;

    const visibleItems = items.filter((item) => {
      const categoryOk = categoryFilter === "all" || String(item.category || "기타") === categoryFilter;
      const method = normalizedPaymentMethod(item.payment_method);
      const paymentOk = paymentFilter === "all" || method === paymentFilter;
      return categoryOk && paymentOk;
    });

    const filteredTotal = visibleItems.reduce((sum, item) => sum + Number(item.krw_amount || 0), 0);
    const summary = document.getElementById("expense-filter-summary");
    if (summary) {
      summary.textContent = (categoryFilter === "all" && paymentFilter === "all")
        ? `전체 ${items.length}건`
        : `${visibleItems.length}건 · ${Math.round(filteredTotal).toLocaleString("ko-KR")}원`;
    }

    document.getElementById("expense-list").innerHTML = visibleItems.length ? visibleItems.map((row) => `
      <div class="expense-row">
        <div><strong>${escapeHtml(row.merchant || row.category || "지출")}</strong><span>${escapeHtml(row.spent_at || "")} · ${escapeHtml(row.category || "기타")} · ${escapeHtml(paymentMethodLabel(row.payment_method))}</span>${row.memo ? `<small>${escapeHtml(row.memo)}</small>` : ""}</div>
        <div class="expense-amount"><strong>${Number(row.krw_amount || 0).toLocaleString("ko-KR")}원</strong><span>${Number(row.original_amount || 0).toLocaleString()} ${escapeHtml(row.currency || "KRW")}</span><div style="display:flex;gap:6px;justify-content:flex-end;"><button onclick="AtlasExpenses.edit('${row.id}')">수정</button><button onclick="AtlasExpenses.remove('${row.id}')">삭제</button></div></div>
      </div>`).join("") : '<div class="utility-empty">조건에 맞는 지출 내역이 없어요.</div>';
  }

  function bindFilters() {
    const list = document.getElementById("expense-list");
    if (!list || document.getElementById("expense-filter-bar")) return;

    const bar = document.createElement("div");
    bar.id = "expense-filter-bar";
    bar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px;";

    const category = document.createElement("select");
    category.id = "expense-category-filter";
    category.setAttribute("aria-label", "카테고리 필터");
    category.innerHTML = `
      <option value="all">전체 카테고리</option>
      <option value="교통">교통</option>
      <option value="숙박">숙박</option>
      <option value="식비">식비</option>
      <option value="쇼핑">쇼핑</option>
      <option value="관광">관광</option>
      <option value="기타">기타</option>
    `;

    const payment = document.createElement("select");
    payment.id = "expense-payment-filter";
    payment.setAttribute("aria-label", "결제수단 필터");
    payment.innerHTML = `
      <option value="all">전체 결제수단</option>
      <option value="card">카드</option>
      <option value="cash">현금</option>
    `;

    const summary = document.createElement("span");
    summary.id = "expense-filter-summary";
    summary.style.cssText = "opacity:.72;font-size:.9rem;";

    category.addEventListener("change", () => {
      categoryFilter = category.value;
      render();
    });
    payment.addEventListener("change", () => {
      paymentFilter = payment.value;
      render();
    });

    bar.append(category, payment, summary);
    list.parentNode.insertBefore(bar, list);
  }

  function normalizedPaymentMethod(value) {
    const method = String(value || "").trim().toLowerCase();
    if (["card", "credit", "credit_card", "debit", "debit_card", "카드"].includes(method)) return "card";
    if (["cash", "현금"].includes(method)) return "cash";
    return "other";
  }

  function paymentMethodLabel(value) {
    const method = String(value || "").trim().toLowerCase();
    if (["card", "credit", "credit_card", "debit", "debit_card", "카드"].includes(method)) return "카드";
    if (["cash", "현금"].includes(method)) return "현금";
    return value || "결제수단 미지정";
  }

  function edit(id) {
    const item = items.find((row) => row.id === id);
    if (!item) return alert("수정할 지출을 찾지 못했어요.");

    editingId = id;
    const form = document.getElementById("expense-form");
    form.querySelector('[name="spentAt"]').value = item.spent_at || "";
    form.querySelector('[name="category"]').value = item.category || "기타";
    form.querySelector('[name="amount"]').value = Number(item.original_amount || 0);
    form.querySelector('[name="currency"]').value = item.currency || "KRW";
    form.querySelector('[name="exchangeRate"]').value = item.currency === "KRW" ? "" : Number(item.exchange_rate_to_krw || 0);
    form.querySelector('[name="paymentMethod"]').value = normalizedPaymentMethod(item.payment_method) === "cash" ? "cash" : "card";
    form.querySelector('[name="merchant"]').value = item.merchant || "";
    form.querySelector('[name="memo"]').value = item.memo || "";

    const submit = form.querySelector('button[type="submit"], button:not([type])');
    if (submit) submit.textContent = "지출 수정";
    ensureCancelEditButton(form);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function ensureCancelEditButton(form) {
    if (document.getElementById("expense-edit-cancel")) return;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.id = "expense-edit-cancel";
    cancel.textContent = "수정 취소";
    cancel.addEventListener("click", () => resetForm(form));
    const submit = form.querySelector('button[type="submit"], button:not([type])');
    submit?.insertAdjacentElement("beforebegin", cancel);
  }

  function resetForm(form, keepDate = "", keepCurrency = "TRY") {
    editingId = null;
    form.reset();
    form.querySelector('[name="spentAt"]').value = keepDate || new Date().toISOString().slice(0,10);
    form.querySelector('[name="currency"]').value = ATLAS_EXPENSE_CURRENCIES.includes(keepCurrency) ? keepCurrency : "TRY";
    const submit = form.querySelector('button[type="submit"], button:not([type])');
    if (submit) submit.textContent = "지출 추가";
    document.getElementById("expense-edit-cancel")?.remove();
  }

  async function remove(id) {
    if (!confirm("이 지출을 삭제할까요?")) return;
    await AtlasAPI.deleteExpense(id);
    if (editingId === id) resetForm(document.getElementById("expense-form"));
    await reload();
  }
  function escapeHtml(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
  return { initialize, edit, remove };
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
