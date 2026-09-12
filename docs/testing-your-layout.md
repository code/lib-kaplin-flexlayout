# Testing Your Layout

Every element the library renders carries a `data-layout-path` attribute describing its position in the layout tree — a stable selector for end-to-end tests (FlexLayout's own Playwright suite is built on it; see `tests-playwright/helpers.ts` for ready-made helper functions):

| Path | Element |
| --- | --- |
| `/r<n>` / `/ts<n>` | Row / tabset (`n` is the index within the parent), nested as in the model, e.g. `/r1/ts0` |
| `/border/<location>` | Border strip (`top`, `bottom`, `left`, `right`) |
| `.../tb<n>` | Tab button `n`, in the same tree location as its panel (e.g. panel `/ts0/t0` ↔ button `/ts0/tb0`, and inside a group `/ts0/g0/t0` ↔ `/ts0/g0/tb0`); `n` is the tab's index within its parent |
| `.../g<n>` | Group pill `n` (e.g. `/ts0/g0`, `/border/right/g0`) |
| `.../g<n>/end` | Group end marker (right cap of a split pill, e.g. `/ts0/g0/end`) |
| `.../t<n>` | Tab panel `n` within a tabset or border path |
| `.../tabstrip` | A tabset's tab strip |
| `.../s<n>` | Splitter after child `n` of a row (e.g. `/s0`), or a border's splitter |
| `.../button/<name>` | Toolbar buttons: `max`, `overflow`, `close`, `popout`, `float`, `pin` |
| `.../textbox` | The inline rename textbox |
| `/popup-menu` | The overflow/popup menu |

```ts
// playwright example: select the second tab of the first tabset, check a border panel opened
await page.locator('[data-layout-path="/ts0/tb1"]').click();
await expect(page.locator('[data-layout-path="/border/left/t0"]')).toBeVisible();
```

Note the paths describe the current structure, so indices shift when tabs and tabsets move — target stable states, or use node ids via the model for highly dynamic layouts.
