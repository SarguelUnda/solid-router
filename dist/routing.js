import { runWithOwner } from "solid-js";
import { createComponent, createContext, createMemo, createRenderEffect, createSignal, on, onCleanup, untrack, useContext, startTransition, resetErrorBoundaries } from "solid-js";
import { isServer, getRequestEvent } from "solid-js/web";
import { createBeforeLeave } from "./lifecycle.js";
import { mockBase, createMemoObject, extractSearchParams, invariant, resolvePath, createMatcher, joinPaths, scoreRoute, mergeSearchString, expandOptionals } from "./utils.js";
const MAX_REDIRECTS = 100;
export const RouterContextObj = createContext();
export const RouteContextObj = createContext();
export const useRouter = () => invariant(useContext(RouterContextObj), "<A> and 'use' router primitives can be only used inside a Route.");
let TempRoute;
export const useRoute = () => TempRoute || useContext(RouteContextObj) || useRouter().base;
export const useResolvedPath = (path) => {
    const route = useRoute();
    return createMemo(() => route.resolvePath(path()));
};
export const useHref = (to) => {
    const router = useRouter();
    return createMemo(() => {
        const to_ = to();
        return to_ !== undefined ? router.renderPath(to_) : to_;
    });
};
export const useNavigate = () => useRouter().navigatorFactory();
export const useLocation = () => useRouter().location;
export const useIsRouting = () => useRouter().isRouting;
export const useMatch = (path, matchFilters) => {
    const location = useLocation();
    const matchers = createMemo(() => expandOptionals(path()).map(path => createMatcher(path, undefined, matchFilters)));
    return createMemo(() => {
        for (const matcher of matchers()) {
            const match = matcher(location.pathname);
            if (match)
                return match;
        }
    });
};
export const useParams = () => useRouter().params;
export const useSearchParams = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const setSearchParams = (params, options) => {
        const searchString = untrack(() => location.pathname + mergeSearchString(location.search, params) + location.hash);
        navigate(searchString, {
            scroll: false,
            resolve: false,
            ...options
        });
    };
    return [location.query, setSearchParams];
};
export const useBeforeLeave = (listener) => {
    const s = useRouter().beforeLeave.subscribe({
        listener,
        location: useLocation(),
        navigate: useNavigate()
    });
    onCleanup(s);
};
export function createRoutes(routeDef, base = "") {
    const { component, load, children, info } = routeDef;
    const isLeaf = !children || (Array.isArray(children) && !children.length);
    const shared = {
        key: routeDef,
        component,
        load,
        info
    };
    return asArray(routeDef.path).reduce((acc, originalPath) => {
        for (const expandedPath of expandOptionals(originalPath)) {
            const path = joinPaths(base, expandedPath);
            let pattern = isLeaf ? path : path.split("/*", 1)[0];
            pattern = pattern
                .split("/")
                .map((s) => {
                return s.startsWith(":") || s.startsWith("*") ? s : encodeURIComponent(s);
            })
                .join("/");
            acc.push({
                ...shared,
                originalPath,
                pattern,
                matcher: createMatcher(pattern, !isLeaf, routeDef.matchFilters)
            });
        }
        return acc;
    }, []);
}
export function createBranch(routes, index = 0) {
    return {
        routes,
        score: scoreRoute(routes[routes.length - 1]) * 10000 - index,
        matcher(location) {
            const matches = [];
            for (let i = routes.length - 1; i >= 0; i--) {
                const route = routes[i];
                const match = route.matcher(location);
                if (!match) {
                    return null;
                }
                matches.unshift({
                    ...match,
                    route
                });
            }
            return matches;
        }
    };
}
function asArray(value) {
    return Array.isArray(value) ? value : [value];
}
export function createBranches(routeDef, base = "", stack = [], branches = []) {
    const routeDefs = asArray(routeDef);
    for (let i = 0, len = routeDefs.length; i < len; i++) {
        const def = routeDefs[i];
        if (def && typeof def === "object") {
            if (!def.hasOwnProperty("path"))
                def.path = "";
            const routes = createRoutes(def, base);
            for (const route of routes) {
                stack.push(route);
                const isEmptyArray = Array.isArray(def.children) && def.children.length === 0;
                if (def.children && !isEmptyArray) {
                    createBranches(def.children, route.pattern, stack, branches);
                }
                else {
                    const branch = createBranch([...stack], branches.length);
                    branches.push(branch);
                }
                stack.pop();
            }
        }
    }
    // Stack will be empty on final return
    return stack.length ? branches : branches.sort((a, b) => b.score - a.score);
}
export function getRouteMatches(branches, location) {
    for (let i = 0, len = branches.length; i < len; i++) {
        const match = branches[i].matcher(location);
        if (match) {
            return match;
        }
    }
    return [];
}
export function createLocation(path, state) {
    const origin = new URL(mockBase);
    const url = createMemo(prev => {
        const path_ = path();
        try {
            return new URL(path_, origin);
        }
        catch (err) {
            console.error(`Invalid path ${path_}`);
            return prev;
        }
    }, origin, {
        equals: (a, b) => a.href === b.href
    });
    const pathname = createMemo(() => url().pathname);
    const search = createMemo(() => url().search, true);
    const hash = createMemo(() => url().hash);
    const key = () => "";
    return {
        get pathname() {
            return pathname();
        },
        get search() {
            return search();
        },
        get hash() {
            return hash();
        },
        get state() {
            return state();
        },
        get key() {
            return key();
        },
        query: createMemoObject(on(search, () => extractSearchParams(url())))
    };
}
let intent;
export function getIntent() {
    return intent;
}
export function createRouterContext(integration, branches, getContext, options = {}) {
    const { signal: [source, setSource], utils = {} } = integration;
    const parsePath = utils.parsePath || (p => p);
    const renderPath = utils.renderPath || (p => p);
    const beforeLeave = utils.beforeLeave || createBeforeLeave();
    const basePath = resolvePath("", options.base || "");
    if (basePath === undefined) {
        throw new Error(`${basePath} is not a valid base path`);
    }
    else if (basePath && !source().value) {
        setSource({ value: basePath, replace: true, scroll: false });
    }
    const [isRouting, setIsRouting] = createSignal(false);
    const start = async (callback) => {
        setIsRouting(true);
        try {
            await startTransition(callback);
        }
        finally {
            setIsRouting(false);
        }
    };
    const [reference, setReference] = createSignal(source().value);
    const [state, setState] = createSignal(source().state);
    const location = createLocation(reference, state);
    const referrers = [];
    const submissions = createSignal(isServer ? initFromFlash() : []);
    const matches = createMemo(() => getRouteMatches(branches(), location.pathname));
    const params = createMemoObject(() => {
        const m = matches();
        const params = {};
        for (let i = 0; i < m.length; i++) {
            Object.assign(params, m[i].params);
        }
        return params;
    });
    const baseRoute = {
        pattern: basePath,
        path: () => basePath,
        outlet: () => null,
        resolvePath(to) {
            return resolvePath(basePath, to);
        }
    };
    createRenderEffect(() => {
        const { value, state } = source();
        // Untrack this whole block so `start` doesn't cause Solid's Listener to be preserved
        untrack(() => {
            if (value !== reference()) {
                start(() => {
                    intent = "native";
                    setReference(value);
                    setState(state);
                    resetErrorBoundaries();
                    submissions[1]([]);
                }).then(() => {
                    intent = undefined;
                });
            }
        });
    });
    return {
        base: baseRoute,
        location,
        params,
        isRouting,
        renderPath,
        parsePath,
        navigatorFactory,
        matches,
        beforeLeave,
        preloadRoute,
        singleFlight: options.singleFlight === undefined ? true : options.singleFlight,
        submissions
    };
    function navigateFromRoute(route, to, options) {
        // Untrack in case someone navigates in an effect - don't want to track `reference` or route paths
        untrack(() => {
            if (typeof to === "number") {
                if (!to) {
                    // A delta of 0 means stay at the current location, so it is ignored
                }
                else if (utils.go) {
                    utils.go(to);
                }
                else {
                    console.warn("Router integration does not support relative routing");
                }
                return;
            }
            const { replace, resolve, scroll, state: nextState } = {
                replace: false,
                resolve: true,
                scroll: true,
                ...options
            };
            const resolvedTo = resolve ? route.resolvePath(to) : resolvePath("", to);
            if (resolvedTo === undefined) {
                throw new Error(`Path '${to}' is not a routable path`);
            }
            else if (referrers.length >= MAX_REDIRECTS) {
                throw new Error("Too many redirects");
            }
            const current = reference();
            if (resolvedTo !== current || nextState !== state()) {
                if (isServer) {
                    const e = getRequestEvent();
                    e && (e.response = { status: 302, headers: new Headers({ Location: resolvedTo }) });
                    setSource({ value: resolvedTo, replace, scroll, state: nextState });
                }
                else if (beforeLeave.confirm(resolvedTo, options)) {
                    const len = referrers.push({ value: current, replace, scroll, state: state() });
                    start(() => {
                        intent = "navigate";
                        setReference(resolvedTo);
                        setState(nextState);
                        resetErrorBoundaries();
                        submissions[1]([]);
                    }).then(() => {
                        if (referrers.length === len) {
                            intent = undefined;
                            navigateEnd({
                                value: resolvedTo,
                                state: nextState
                            });
                        }
                    });
                }
            }
        });
    }
    function navigatorFactory(route) {
        // Workaround for vite issue (https://github.com/vitejs/vite/issues/3803)
        route = route || useContext(RouteContextObj) || baseRoute;
        return (to, options) => navigateFromRoute(route, to, options);
    }
    function navigateEnd(next) {
        const first = referrers[0];
        if (first) {
            if (next.value !== first.value || next.state !== first.state) {
                setSource({
                    ...next,
                    replace: first.replace,
                    scroll: first.scroll
                });
            }
            referrers.length = 0;
        }
    }
    function preloadRoute(url, preloadData) {
        const matches = getRouteMatches(branches(), url.pathname);
        const prevIntent = intent;
        intent = "preload";
        for (let match in matches) {
            const { route, params } = matches[match];
            route.component &&
                route.component.preload &&
                route.component.preload();
            const { load } = route;
            preloadData &&
                load &&
                runWithOwner(getContext(), () => load({
                    params,
                    location: {
                        pathname: url.pathname,
                        search: url.search,
                        hash: url.hash,
                        query: extractSearchParams(url),
                        state: null,
                        key: ""
                    },
                    intent: "preload"
                }));
        }
        intent = prevIntent;
    }
    function initFromFlash() {
        const e = getRequestEvent();
        return (e && e.router && e.router.submission
            ? [e.router.submission]
            : []);
    }
}
export function createRouteContext(router, parent, outlet, match) {
    const { base, location, params } = router;
    const { pattern, component, load } = match().route;
    const path = createMemo(() => match().path);
    component &&
        component.preload &&
        component.preload();
    const data = load ? load({ params, location, intent: intent || "initial" }) : undefined;
    const route = {
        parent,
        pattern,
        path,
        outlet: () => component
            ? createComponent(component, {
                params,
                location,
                data,
                get children() {
                    return outlet();
                }
            })
            : outlet(),
        resolvePath(to) {
            return resolvePath(base.path(), to, path());
        }
    };
    return route;
}
