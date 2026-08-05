import styled from "styled-components";

// demonstrates css-in-js via styled-components; when the tab is popped out, the demo's
// PopoutStyleProvider wraps the popout content in a StyleSheetManager targeting the popout
// document so these styles are injected there (the runtime style copy cannot see the CSSOM
// insertRule calls styled-components uses).

const Box = styled.div`
    background: #1976d2;
    color: white;
    padding: 12px;
    border-radius: 6px;
    font-weight: 600;
    margin: 10px;
    display: inline-block;
`;

const Highlight = styled.span`
    background: #ff4081;
    color: white;
    border-radius: 3px;
    padding: 2px 6px;
`;

export const StyledComponentsDemo = () => (
    <div style={{ padding: 4 }}>
        <Box>Styled Components Box</Box>
        <div style={{ margin: 10 }}>
            a <Highlight>highlighted</Highlight> span
        </div>
    </div>
);
