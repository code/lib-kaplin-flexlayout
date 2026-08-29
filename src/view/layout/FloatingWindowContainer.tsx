import * as React from "react";
import { PopoutWindow } from "../PopoutWindow";
import { FloatWindow } from "../FloatWindow";
import { LayoutController, LayoutInternal } from "./LayoutInternal";

export interface IFloatingWindowContainerProps {
    controller: LayoutController;
}

export const FloatingWindowContainer = ({ controller }: IFloatingWindowContainerProps) => {
    const floatingLayouts: React.ReactNode[] = [];
    const layouts = controller.getModel().getLayouts();
    let floatPopoutZIndex = 2000;
    for (const [layoutId, layout] of layouts) {
        if (!layout.isMainLayout()) {
            if (layout.getType() === "window" && controller.isSupportsPopout()) {
                floatingLayouts.push(
                    <PopoutWindow
                        key={layoutId}
                        controller={controller}
                        layout={layout}
                        title={controller.getPopoutWindowName() + " " + layoutId}
                        url={controller.getPopoutURL() + "?id=" + encodeURIComponent(layoutId)}
                        onCloseLayout={controller.onCloseLayout}
                    >
                        <div className={controller.getProps().popoutClassName}>
                            <LayoutInternal {...controller.getProps()} layoutId={layoutId} path={layout.getPath()} mainLayoutController={controller} />
                        </div>
                    </PopoutWindow>,
                );
            } else if (layout.getType() === "float") {
                floatingLayouts.push(
                    <FloatWindow key={layoutId + "float"} controller={controller} layout={layout} zIndex={floatPopoutZIndex} onCloseLayout={controller.onCloseLayout}>
                        <LayoutInternal {...controller.getProps()} layoutId={layoutId} path={layout.getPath()} mainLayoutController={controller} />
                    </FloatWindow>,
                );
                floatPopoutZIndex++;
            }
        }
    }

    return <>{floatingLayouts}</>;
};

FloatingWindowContainer.displayName = "FloatingWindowContainer"; // name in react dev tools
