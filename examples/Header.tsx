import * as React from "react";
import * as Prism from "prismjs";

const buttonStyle: React.CSSProperties = {
    fontSize: 13,
    padding: "4px 12px",
    background: "#1f2328",
    color: "#ffffff",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
};

let sourceWindow: Window | null = null;

function openSourceWindow(title: string, source: string) {
    if (sourceWindow && !sourceWindow.closed) {
        sourceWindow.close();
    }
    const w = Math.round(screen.width * 0.9);
    const h = Math.round(screen.height * 0.9);
    const x = Math.round((screen.width - w) / 2);
    const y = Math.round((screen.height - h) / 2);
    sourceWindow = window.open("", "source", `width=${w - 20},height=${h - 100},left=${x},top=${y},scrollbars=yes,resizable=yes`);
    if (!sourceWindow) return;
    sourceWindow.document.title = title;
    const highlighted = Prism.highlight(source, Prism.languages.javascript, "javascript");
    sourceWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <title>FlexLayout ${title} Example Source Code</title>
    <link rel="stylesheet" href="https://esm.sh/prismjs/themes/prism-coy.css">
    <style>
        body { margin: 0; padding: 16px; font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace; font-size: 14px; background: #fff; }
        pre { margin: 0; white-space: pre-wrap; tab-size: 4; }
    </style>
</head>
<body>
    <pre>${highlighted}</pre>
</body>
</html>`);
    sourceWindow.document.close();
}

/** a page header with the example title and buttons to view source or see it on github */
export const ExampleHeader = ({ title, path, source }: { title: string; path: string; source?: string }) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f9fafb",
            fontFamily: "ui-sans-serif, system-ui",
        }}
    >
        <strong>{title}</strong>
        <div style={{ display: "flex", gap: 6 }}>
            {source && (
                <button style={buttonStyle} onClick={() => openSourceWindow(title, source)}>
                    Source
                </button>
            )}
            <a href={"https://github.com/caplin/FlexLayout/blob/master/" + path} target="_blank" rel="noreferrer" title="see source code on github" style={{ ...buttonStyle, textDecoration: "none" }}>
                GitHub
            </a>
        </div>
    </div>
);
