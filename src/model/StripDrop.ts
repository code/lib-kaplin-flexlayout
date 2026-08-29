import { DockLocation } from "./DockLocation";
import { DropInfo } from "./DropInfo";
import { IDraggable } from "./IDraggable";
import { Node } from "./Node";
import { Rect } from "./Rect";
import { TabGroupNode } from "./TabGroupNode";
import { TabNode } from "./TabNode";
import { CLASSES } from "../CSSClassNames";
import type { BorderNode } from "./BorderNode";
import type { TabSetNode } from "./TabSetNode";

/** @internal the rect of a strip child on the line containing the cursor, or undefined when the child
 *  is not on the cursor's line. A tab occupies a single line; a group's extent on the cursor's line
 *  is its line rect via {@link TabGroupNode.getLineRectAt}. */
function getChildLineRect(child: TabNode | TabGroupNode, x: number, y: number, vertical: boolean): Rect | undefined {
    if (child instanceof TabGroupNode) {
        return child.getLineRectAt(x, y);
    }
    const r = child.getTabRect();
    if (r === undefined) {
        return undefined;
    }
    return vertical ? (r.x <= x && x <= r.getRight() ? r : undefined) : r.y <= y && y <= r.getBottom() ? r : undefined;
}

/** @internal */
function outlineBefore(vertical: boolean, extent: Rect): Rect {
    return vertical ? new Rect(extent.x, extent.y - 2, extent.width, 3) : new Rect(extent.x - 2, extent.y, 3, extent.height);
}

/** @internal */
function outlineAfter(vertical: boolean, extent: Rect): Rect {
    return vertical ? new Rect(extent.x, extent.getBottom() - 2, extent.width, 3) : new Rect(extent.getRight() - 2, extent.y, 3, extent.height);
}

/** @internal */
function outlineReorder(vertical: boolean, boundary: Rect, before: boolean): Rect {
    if (vertical) {
        return new Rect(boundary.x, (before ? boundary.y : boundary.getBottom()) - 2, boundary.width, 3);
    }
    return new Rect((before ? boundary.x : boundary.getRight()) - 2, boundary.y, 3, boundary.height);
}

/** @internal resolve a drop over a tab strip / border header. The children (tabs and tab groups)
 *  flow left-to-right (vertical = false) or top-to-bottom (vertical = true) and may wrap onto several
 *  lines. Only the line under the cursor is walked, so each element is split at its centre into a
 *  "before" and "after" slot exactly as in a single-line strip; the trailing space of the cursor's
 *  line appends (to the strip, or into the group when the line ends in a group). */
export function findStripDrop(
    host: TabSetNode | BorderNode,
    strip: Rect,
    children: (TabNode | TabGroupNode)[],
    dragNode: Node & IDraggable,
    x: number,
    y: number,
    vertical: boolean,
    restrictAtStripStart: boolean,
): DropInfo | undefined {
    if (children.length === 0) {
        const r = strip.clone();
        if (vertical) {
            r.height = 2;
        } else {
            r.width = 2;
        }
        return new DropInfo(host, r, DockLocation.CENTER, 0, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
    }

    // the children whose line contains the cursor, in strip order
    const onLine: { child: TabNode | TabGroupNode; index: number; extent: Rect }[] = [];
    for (let i = 0; i < children.length; i++) {
        const extent = getChildLineRect(children[i], x, y, vertical);
        if (extent !== undefined) {
            onLine.push({ child: children[i], index: i, extent });
        }
    }
    if (onLine.length === 0) {
        return undefined; // the cursor is in a gap between wrapped lines
    }

    const pos = vertical ? y : x;
    const hostRect = host.getRect();
    let p = vertical ? strip.y : strip.x;

    for (let j = 0; j < onLine.length; j++) {
        const { child, index, extent } = onLine[j];
        const center = vertical ? extent.y + extent.height / 2 : extent.x + extent.width / 2;

        if (child instanceof TabGroupNode && child.contains(x, y)) {
            if (dragNode instanceof TabGroupNode) {
                // reorder a group relative to another group: drop before or after it, anchored at
                // the group's true start/end
                const region = child.getDropRegion();
                const before = vertical ? y < region.y + region.height / 2 : x < region.x + region.width / 2;
                const boundary = child.getReorderBoundary(before);
                return new DropInfo(host, outlineReorder(vertical, boundary, before), DockLocation.CENTER, before ? index : index + 1, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
            }
            // drops into the group resolve via the group's own canDrop (its dropInfo already ran
            // canDockInto); the caller returns a non-host dropInfo directly
            return child.canDrop(dragNode, x, y);
        }

        if (p <= pos && pos < center) {
            // drop before this child
            const edge = vertical ? extent.y : extent.x;
            if (!restrictAtStripStart || (hostRect.x < edge && edge < hostRect.getRight())) {
                return new DropInfo(host, outlineBefore(vertical, extent), DockLocation.CENTER, index, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
            }
            return undefined;
        }

        // each element is split at its centre: the right half belongs to the next element's
        // "before" slot (or the trailing append for the last element on the line)
        p = center;
    }

    // the trailing space on the cursor's line
    const last = onLine[onLine.length - 1];
    const lastExtent = last.extent;
    const lastCenter = vertical ? lastExtent.y + lastExtent.height / 2 : lastExtent.x + lastExtent.width / 2;
    const lastEdge = vertical ? lastExtent.getBottom() : lastExtent.getRight();
    const hostEdge = vertical ? hostRect.getBottom() : hostRect.getRight();
    if (pos >= lastCenter && lastEdge < hostEdge) {
        // when a group ends the strip, the trailing space appends after it (so a tab can still be
        // placed after the last group); otherwise the trailing line space belongs to the group
        // (e.g. just after a wrapped start pill) and defers to it
        if (last.child instanceof TabGroupNode && last.child !== children[children.length - 1]) {
            const groupDrop = last.child.canDrop(dragNode, x, y);
            if (groupDrop !== undefined) {
                return groupDrop;
            }
        }
        // for a group the append outline anchors at its true end (last element), not the cursor's line
        const end = last.child instanceof TabGroupNode ? last.child.getReorderBoundary(false) : lastExtent;
        return new DropInfo(host, outlineAfter(vertical, end), DockLocation.CENTER, children.length, CLASSES.FLEXLAYOUT__OUTLINE_RECT);
    }
    return undefined;
}
