import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "com.digitalmusicdatabase.app",
    appName: "Music Data Base",
    webDir: "www",
    server: {
        url: "https://www.digitalmusicdatabase.com",
        cleartext: false,
        androidScheme: "https",
    },
    ios: {
        contentInset: "automatic",
        allowsLinkPreview: true,
    },
};

export default config;
