import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true, // so can use `describe`/`it` without importing them
        environment: "node",
        include: ["tests/**/*.test.{js,ts,tsx}"],
        setupFiles: ["tests/setup.ts"],

        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/model/**", "src/view/**"],
            // the view layer is now exercised by the jsdom unit/component suite (tests/ and
            // tests/view/) as well as the playwright e2e suite; the model layer is guarded more
            // tightly. Raise these as coverage improves.
            thresholds: {
                statements: 70,
                lines: 70,
                functions: 72,
                branches: 50,
                "src/model/**": {
                    statements: 75,
                    lines: 75,
                    functions: 80,
                    branches: 62,
                },
                "src/view/**": {
                    statements: 55,
                    lines: 55,
                    functions: 50,
                    branches: 40,
                },
            },
        },
    },

    define: {
        __VERSION__: JSON.stringify("test-version"),
    },
});
