/*
|--------------------------------------------------------------------------
| Atlas Configuration
|--------------------------------------------------------------------------
|
| Default configuration.
| This file is committed to GitHub.
|
| Local/private values should be placed in:
|
|     config.local.js
|
*/

window.AtlasConfig = {

    app: {
        name: "Atlas",
        version: "0.7.1",
        environment: "development"
    },

    maps: {
        apiKey: "",
        defaultZoom: 13,
        focusedZoom: 15
    },

    ui: {
        theme: "dark",
        language: "ko",
        use24HourClock: true
    },

    services: {
        weatherApiKey: "",
        exchangeRateApiKey: "",
        openAiApiKey: "",
        geminiApiKey: ""
    }
backend: {
    uploadEndpoint: ""
}
};