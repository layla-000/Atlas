const AtlasCapture = (() => {
    const SELECTORS = {
        root: "atlas-overlay-root",
        button: "atlas-capture-button",
        menu: "atlas-capture-menu",
        documentInput: "atlas-document-input",
        receiptInput: "atlas-receipt-input",
        bottomSheet: "atlas-bottom-sheet"
    };

    function initialize() {
        render();
        bindEvents();
    }

    function render() {
        const root = document.getElementById(SELECTORS.root);

        root.innerHTML = `
            <div class="atlas-capture" id="atlas-capture">
                <div class="atlas-capture-menu" id="${SELECTORS.menu}">
                    <label class="atlas-capture-item">
                        <span class="atlas-capture-icon">📄</span>
                        <span>Document</span>
                        <input
                            id="${SELECTORS.documentInput}"
                            type="file"
                            accept=".pdf,image/*"
                            multiple
                            hidden>
                    </label>

                    <label class="atlas-capture-item">
                        <span class="atlas-capture-icon">🧾</span>
                        <span>Receipt</span>
                        <input
                            id="${SELECTORS.receiptInput}"
                            type="file"
                            accept="image/*"
                            multiple
                            hidden>
                    </label>
                </div>

                <button
                    id="${SELECTORS.button}"
                    class="atlas-capture-button"
                    aria-label="Open Atlas Capture">
                    +
                </button>
            </div>

            <div id="${SELECTORS.bottomSheet}" class="atlas-bottom-sheet"></div>
        `;
    }

    function bindEvents() {
        const button = document.getElementById(SELECTORS.button);
        const menu = document.getElementById(SELECTORS.menu);
        const documentInput = document.getElementById(SELECTORS.documentInput);
        const receiptInput = document.getElementById(SELECTORS.receiptInput);

        button.addEventListener("click", () => {
            menu.classList.toggle("is-open");
            button.classList.toggle("is-open");
        });

        documentInput.addEventListener("change", (event) => {
            handleFiles(event.target.files, "document");
            menu.classList.remove("is-open");
            button.classList.remove("is-open");
        });

        receiptInput.addEventListener("change", (event) => {
            handleFiles(event.target.files, "receipt");
            menu.classList.remove("is-open");
            button.classList.remove("is-open");
        });

        window.addEventListener("atlas:capture-start", (event) => {
            showBottomSheet(
                event.detail.type === "receipt" ? "🧾 Receipt" : "📄 Document",
                `${event.detail.fileName}을 확인하고 있어요.`
            );
        });

        window.addEventListener("atlas:capture-complete", (event) => {
            showBottomSheet("✅ Atlas", event.detail.message);
        });
    }

    function handleFiles(files, type) {
        if (!window.AtlasUpload) {
            showBottomSheet("⚠️ Atlas", "Upload service가 아직 준비되지 않았어요.");
            return;
        }

        AtlasUpload.handleFiles(files, type);
    }

    function showBottomSheet(title, message) {
        const sheet = document.getElementById(SELECTORS.bottomSheet);

        sheet.innerHTML = `
            <strong>${title}</strong>
            <span>${message}</span>
        `;

        sheet.classList.add("is-visible");

        window.clearTimeout(sheet.hideTimer);

        sheet.hideTimer = window.setTimeout(() => {
            sheet.classList.remove("is-visible");
        }, 3600);
    }

    return {
        initialize
    };
})();