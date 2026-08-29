import { TabSetNode } from "./TabSetNode";
import { BorderNode } from "./BorderNode";
import { RowNode } from "./RowNode";
import { TabGroupNode } from "./TabGroupNode";
import { Node } from "./Node";
import { TabNode } from "./TabNode";

/** @internal the flat tab-list index (getTabNodes) of the direct child at the given child index,
 *  i.e. the number of visible tabs before it. Groups count as many positions as they have tabs
 *  when open and none when closed. */
function flatIndexAt(parent: TabSetNode | BorderNode, childIndex: number): number {
    let flat = 0;
    const children = parent.getChildren();
    for (let i = 0; i < childIndex && i < children.length; i++) {
        const child = children[i];
        if (child instanceof TabGroupNode) {
            if (child.isOpened()) {
                flat += child.getChildren().length;
            }
        } else if (child instanceof TabNode) {
            flat++;
        }
    }
    return flat;
}

/** @internal */
export function adjustSelectedIndexAfterInsert(parent: TabSetNode | BorderNode | TabGroupNode, insertedIndex: number, count: number = 1) {
    // a group's children do not drive its container's selection (the container uses a flat tab
    // index), so inserts into a group never shift the container's selected index
    if (parent instanceof TabGroupNode) {
        return;
    }
    // shift the selected index when tabs are inserted at or before its flat position, so the same
    // tab stays selected (the selection is a flat tab index, not a direct-child index)
    const selectedIndex = parent.getSelected();
    if (count > 0 && selectedIndex !== -1 && flatIndexAt(parent, insertedIndex) <= selectedIndex) {
        parent.setSelected(selectedIndex + count);
    }
}

/** @internal */
export function adjustSelectedIndex(parent: TabSetNode | BorderNode | RowNode | TabGroupNode, removedIndex: number) {
    // for the tabset/border being removed from set the selected index
    if (parent instanceof TabGroupNode) {
        // a tab leaving a group: repair the containing tabset's flat selection
        parent.getTabContainer().repairSelected();
        return;
    }
    if (parent !== undefined && (parent instanceof TabSetNode || parent instanceof BorderNode)) {
        const selectedIndex = (parent as TabSetNode | BorderNode).getSelected();
        if (selectedIndex !== -1) {
            // removedIndex is a direct-child index but the selection is a flat tab index, so
            // translate the removed tab into flat space first (a group ahead of it spans several
            // flat positions but a single child index)
            const flatRemovedIndex = flatIndexAt(parent, removedIndex);
            const tabCount = (parent as TabSetNode | BorderNode).getTabNodes().length;
            if (flatRemovedIndex === selectedIndex && tabCount > 0) {
                if (flatRemovedIndex >= tabCount) {
                    // removed last tab; select new last tab
                    (parent as TabSetNode | BorderNode).setSelected(tabCount - 1);
                } else {
                    // leave selected index as is, selecting next tab after this one
                }
            } else if (flatRemovedIndex < selectedIndex) {
                (parent as TabSetNode | BorderNode).setSelected(selectedIndex - 1);
            } else if (flatRemovedIndex > selectedIndex) {
                // leave selected index as is
            } else {
                (parent as TabSetNode | BorderNode).setSelected(-1);
            }
        }
        // if the flat tab list is now empty (e.g. only collapsed groups remain), repair the
        // selection so the index doesn't point at nothing
        (parent as TabSetNode | BorderNode).repairSelected();
    }
}

/** @internal structural contract for nodes that own a flat selection over their descendant tabs */
export interface ISelectionContainer {
    getSelectedNode(): Node | undefined;
    getTabNodes(): TabNode[];
    setSelected(index: number): void;
    repairSelected(): void;
    isAutoSelectTab(): boolean;
}

/**
 * Returns true when `node` lies inside the subtree rooted at `possibleAncestor` (including
 * being that node itself), i.e. walking the parent chain from `node` reaches
 * `possibleAncestor`. Used to reject drops that would nest a container into its own
 * descendant and corrupt the tree.
 * @internal
 */
export function isInSubtree(node: Node, possibleAncestor: Node): boolean {
    let current: Node | undefined = node;
    while (current !== undefined) {
        if (current === possibleAncestor) {
            return true;
        }
        current = current.getParent();
    }
    return false;
}

/**
 * Detach a dragged node from its parent during a drop, repairing the source container's
 * selection. Returns the parent captured before removal (callers need it afterwards to
 * correct forward-move insertion indices) and the index the node occupied.
 * @internal
 */
export function detachDragNode(dragNode: Node, target: Node): { dragParent: BorderNode | TabSetNode | RowNode | TabGroupNode | undefined; fromIndex: number } {
    let fromIndex = 0;
    const dragParent = dragNode.getParent() as BorderNode | TabSetNode | RowNode | TabGroupNode | undefined;
    if (dragParent !== undefined) {
        fromIndex = dragParent.removeChild(dragNode);
        if (dragNode instanceof TabGroupNode) {
            // a whole group left its container: repair the container's flat selection
            (dragParent as TabSetNode | BorderNode).repairSelected();
        } else if (dragParent instanceof BorderNode && dragParent !== target && dragParent.getSelected() === fromIndex) {
            // if the selected node in a border is being docked into another container then deselect border tabs
            dragParent.setSelected(-1);
        } else if (dragParent instanceof TabGroupNode) {
            // a tab leaving a group: repair the group's selection and delete the empty group
            dragParent.getTabContainer().repairSelected();
            if (dragParent.getChildren().length === 0) {
                dragParent.getTabContainer().removeChild(dragParent);
            }
        } else {
            adjustSelectedIndex(dragParent, fromIndex);
        }
    }
    return { dragParent, fromIndex };
}

/**
 * Restore a container's selection after inserting a dragged tab or group. When `select` allows
 * it (explicit true, or undefined/false with autoSelect enabled) the inserted node becomes the
 * selected one; otherwise the previously selected tab stays selected where still reachable.
 * @internal
 */
export function restoreSelectionAfterInsert(container: ISelectionContainer, selectedTab: Node | undefined, select?: boolean, inserted?: Node) {
    if (inserted !== undefined && (select || (select !== false && container.isAutoSelectTab()))) {
        container.setSelected(container.getTabNodes().indexOf(inserted as TabNode));
    } else if (selectedTab !== undefined) {
        const newIndex = container.getTabNodes().indexOf(selectedTab as TabNode);
        if (newIndex === -1) {
            container.repairSelected(); // selected tab moved into a closed group
        } else {
            container.setSelected(newIndex);
        }
    } else {
        container.repairSelected();
    }
}

export function randomUUID(): string {
    // @ts-expect-error - Fallback for crypto or unknown global environments
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}
