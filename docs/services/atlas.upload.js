const AtlasUpload = (() => {
    const STATE = {
        currentTrip: "Türkiye 2026"
    };

    function getUploadEndpoint() {
        if (!window.AtlasConfig || !window.AtlasConfig.backend) {
            return "";
        }

        return window.AtlasConfig.backend.uploadEndpoint || "";
    }

    async function handleFiles(files, type) {
        const fileList = Array.from(files);

        if (fileList.length === 0) {
            return;
        }

        for (const file of fileList) {
            await uploadFile(file, type);
        }
    }

    async function uploadFile(file, type) {
        dispatchStart(file, type);

        const endpoint = getUploadEndpoint();

        if (!endpoint) {
            simulateQueuedUpload(file, type);
            return;
        }

        try {
            const payload = await buildPayload(file, type);

            const response = await fetch(endpoint, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            const result = await response.json();

            dispatchComplete(file, type, buildSuccessMessage(file, type, result));
        } catch (error) {
            dispatchError(file, type, error);
        }
    }

    function simulateQueuedUpload(file, type) {
        window.setTimeout(() => {
            dispatchComplete(file, type, buildQueuedMessage(file, type));
        }, 1200);
    }

    function buildPayload(file, type) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
                resolve({
                    trip: STATE.currentTrip,
                    type,
                    fileName: file.name,
                    mimeType: file.type || "application/octet-stream",
                    size: file.size,
                    contentBase64: extractBase64(reader.result)
                });
            };

            reader.onerror = () => {
                reject(new Error("Failed to read file."));
            };

            reader.readAsDataURL(file);
        });
    }

    function extractBase64(dataUrl) {
        return String(dataUrl).split(",")[1] || "";
    }

    function dispatchStart(file, type) {
        window.dispatchEvent(new CustomEvent("atlas:capture-start", {
            detail: {
                fileName: file.name,
                type,
                trip: STATE.currentTrip
            }
        }));
    }

    function dispatchComplete(file, type, message) {
        window.dispatchEvent(new CustomEvent("atlas:capture-complete", {
            detail: {
                fileName: file.name,
                type,
                trip: STATE.currentTrip,
                message
            }
        }));
    }

    function dispatchError(file, type, error) {
        window.dispatchEvent(new CustomEvent("atlas:capture-complete", {
            detail: {
                fileName: file.name,
                type,
                trip: STATE.currentTrip,
                message: `${file.name} 처리 중 문제가 생겼어요. ${error.message}`
            }
        }));
    }

    function buildQueuedMessage(file, type) {
        if (type === "receipt") {
            return `${file.name}을 확인했어요. Backend 연결 후 OCR과 Budget 업데이트로 이어질 예정입니다.`;
        }

        return `${file.name}을 확인했어요. Backend 연결 후 Drive 저장, Notion 기록, Parser 처리로 이어질 예정입니다.`;
    }

    function buildSuccessMessage(file, type, result) {
        if (result && result.message) {
            return result.message;
        }

        if (type === "receipt") {
            return `${file.name} 영수증을 저장했어요. Budget 업데이트 대기열에 추가했습니다.`;
        }

        return `${file.name} 문서를 저장했어요. 일정과 지도 반영 대기열에 추가했습니다.`;
    }

    return {
        handleFiles
    };
})();