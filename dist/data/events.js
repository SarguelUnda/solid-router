import { delegateEvents } from "solid-js/web";
import { onCleanup } from "solid-js";
import { actions, routableForms } from "./action.js";
import { mockBase } from "../utils.js";
export function setupNativeEvents(preload = true, explicitLinks = false, actionBase = "/_server") {
    return (router) => {
        const basePath = router.base.path();
        const navigateFromRoute = router.navigatorFactory(router.base);
        let preloadTimeout = {};
        function isSvg(el) {
            return el.namespaceURI === "http://www.w3.org/2000/svg";
        }
        function handleAnchor(evt) {
            if (evt.defaultPrevented ||
                evt.button !== 0 ||
                evt.metaKey ||
                evt.altKey ||
                evt.ctrlKey ||
                evt.shiftKey)
                return;
            const a = evt
                .composedPath()
                .find(el => el instanceof Node && el.nodeName.toUpperCase() === "A");
            if (!a || (explicitLinks && !a.hasAttribute("link")))
                return;
            const svg = isSvg(a);
            const href = svg ? a.href.baseVal : a.href;
            const target = svg ? a.target.baseVal : a.target;
            if (target || (!href && !a.hasAttribute("state")))
                return;
            const rel = (a.getAttribute("rel") || "").split(/\s+/);
            if (a.hasAttribute("download") || (rel && rel.includes("external")))
                return;
            const url = svg ? new URL(href, document.baseURI) : new URL(href);
            if (url.origin !== window.location.origin ||
                (basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase())))
                return;
            return [a, url];
        }
        function handleAnchorClick(evt) {
            const res = handleAnchor(evt);
            if (!res)
                return;
            const [a, url] = res;
            const to = router.parsePath(url.pathname + url.search + url.hash);
            const state = a.getAttribute("state");
            evt.preventDefault();
            navigateFromRoute(to, {
                resolve: false,
                replace: a.hasAttribute("replace"),
                scroll: !a.hasAttribute("noscroll"),
                state: state && JSON.parse(state)
            });
        }
        function handleAnchorPreload(evt) {
            const res = handleAnchor(evt);
            if (!res)
                return;
            const [a, url] = res;
            if (!preloadTimeout[url.pathname])
                router.preloadRoute(url, a.getAttribute("preload") !== "false");
        }
        function handleAnchorIn(evt) {
            const res = handleAnchor(evt);
            if (!res)
                return;
            const [a, url] = res;
            if (preloadTimeout[url.pathname])
                return;
            preloadTimeout[url.pathname] = setTimeout(() => {
                router.preloadRoute(url, a.getAttribute("preload") !== "false");
                delete preloadTimeout[url.pathname];
            }, 200);
        }
        function handleAnchorOut(evt) {
            const res = handleAnchor(evt);
            if (!res)
                return;
            const [, url] = res;
            if (preloadTimeout[url.pathname]) {
                clearTimeout(preloadTimeout[url.pathname]);
                delete preloadTimeout[url.pathname];
            }
        }
        function handleFormSubmit(evt) {
            if (evt.defaultPrevented)
                return;
            let actionRef = evt.submitter && evt.submitter.hasAttribute("formaction")
                ? evt.submitter.getAttribute("formaction")
                : evt.target.getAttribute("action");
            if (!actionRef)
                return;
            const method = evt.submitter && evt.submitter.hasAttribute("formmethod")
                ? evt.submitter.getAttribute("formmethod")
                : evt.target.getAttribute("method");
            if (method?.toUpperCase() === "GET") {
                if (routableForms.has(evt.target)) {
                    evt.preventDefault();
                    const data = new FormData(evt.target);
                    if (evt.submitter && evt.submitter.name)
                        data.append(evt.submitter.name, evt.submitter.value);
                    const url = new URL(actionRef, location.origin);
                    url.search = "?" + [...data.entries()].map(([key, value]) => `${key}=${value}`).join("&");
                    const to = router.parsePath(url.pathname + url.search + url.hash);
                    navigateFromRoute(to, { resolve: false });
                    return;
                }
            }
            if (!actionRef.startsWith("https://action/")) {
                // normalize server actions
                const url = new URL(actionRef, mockBase);
                actionRef = router.parsePath(url.pathname + url.search);
                if (!actionRef.startsWith(actionBase))
                    return;
            }
            if (method?.toUpperCase() !== "POST")
                throw new Error("Only POST forms are supported for Actions");
            const handler = actions.get(actionRef);
            if (handler) {
                evt.preventDefault();
                const data = new FormData(evt.target);
                if (evt.submitter && evt.submitter.name)
                    data.append(evt.submitter.name, evt.submitter.value);
                handler.call({ r: router, f: evt.target }, data);
            }
        }
        // ensure delegated event run first
        delegateEvents(["click", "submit"]);
        document.addEventListener("click", handleAnchorClick);
        if (preload) {
            document.addEventListener("mouseover", handleAnchorIn);
            document.addEventListener("mouseout", handleAnchorOut);
            document.addEventListener("focusin", handleAnchorPreload);
            document.addEventListener("touchstart", handleAnchorPreload);
        }
        document.addEventListener("submit", handleFormSubmit);
        onCleanup(() => {
            document.removeEventListener("click", handleAnchorClick);
            if (preload) {
                document.removeEventListener("mouseover", handleAnchorIn);
                document.removeEventListener("mouseout", handleAnchorOut);
                document.removeEventListener("focusin", handleAnchorPreload);
                document.removeEventListener("touchstart", handleAnchorPreload);
            }
            document.removeEventListener("submit", handleFormSubmit);
        });
    };
}
