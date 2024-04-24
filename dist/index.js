import { isServer, getRequestEvent, createComponent as createComponent$1, memo, delegateEvents, spread, mergeProps as mergeProps$1, template, use } from 'solid-js/web';
import { getOwner, runWithOwner, createMemo, createContext, onCleanup, useContext, untrack, createSignal, createRenderEffect, on, startTransition, resetErrorBoundaries, createComponent, children, mergeProps, Show, createRoot, getListener, sharedConfig, $TRACK, splitProps, createResource, onMount } from 'solid-js';
import { createStore, reconcile, unwrap } from 'solid-js/store';

function createBeforeLeave() {
  let listeners = new Set();
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  let ignore = false;
  function confirm(to, options) {
    if (ignore) return !(ignore = false);
    const e = {
      to,
      options,
      defaultPrevented: false,
      preventDefault: () => e.defaultPrevented = true
    };
    for (const l of listeners) l.listener({
      ...e,
      from: l.location,
      retry: force => {
        force && (ignore = true);
        l.navigate(to, {
          ...options,
          resolve: false
        });
      }
    });
    return !e.defaultPrevented;
  }
  return {
    subscribe,
    confirm
  };
}

// The following supports browser initiated blocking (eg back/forward)

let depth;
function saveCurrentDepth() {
  if (!window.history.state || window.history.state._depth == null) {
    window.history.replaceState({
      ...window.history.state,
      _depth: window.history.length - 1
    }, "");
  }
  depth = window.history.state._depth;
}
if (!isServer) {
  saveCurrentDepth();
}
function keepDepth(state) {
  return {
    ...state,
    _depth: window.history.state && window.history.state._depth
  };
}
function notifyIfNotBlocked(notify, block) {
  let ignore = false;
  return () => {
    const prevDepth = depth;
    saveCurrentDepth();
    const delta = prevDepth == null ? null : depth - prevDepth;
    if (ignore) {
      ignore = false;
      return;
    }
    if (delta && block(delta)) {
      ignore = true;
      window.history.go(-delta);
    } else {
      notify();
    }
  };
}

const hasSchemeRegex = /^(?:[a-z0-9]+:)?\/\//i;
const trimPathRegex = /^\/+|(\/)\/+$/g;
const mockBase = "http://sr";
function normalizePath(path, omitSlash = false) {
  const s = path.replace(trimPathRegex, "$1");
  return s ? omitSlash || /^[?#]/.test(s) ? s : "/" + s : "";
}
function resolvePath(base, path, from) {
  if (hasSchemeRegex.test(path)) {
    return undefined;
  }
  const basePath = normalizePath(base);
  const fromPath = from && normalizePath(from);
  let result = "";
  if (!fromPath || path.startsWith("/")) {
    result = basePath;
  } else if (fromPath.toLowerCase().indexOf(basePath.toLowerCase()) !== 0) {
    result = basePath + fromPath;
  } else {
    result = fromPath;
  }
  return (result || "/") + normalizePath(path, !result);
}
function invariant(value, message) {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}
function joinPaths(from, to) {
  return normalizePath(from).replace(/\/*(\*.*)?$/g, "") + normalizePath(to);
}
function extractSearchParams(url) {
  const params = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}
function createMatcher(path, partial, matchFilters) {
  const [pattern, splat] = path.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  const len = segments.length;
  return location => {
    const locSegments = location.split("/").filter(Boolean);
    const lenDiff = locSegments.length - len;
    if (lenDiff < 0 || lenDiff > 0 && splat === undefined && !partial) {
      return null;
    }
    const match = {
      path: len ? "" : "/",
      params: {}
    };
    const matchFilter = s => matchFilters === undefined ? undefined : matchFilters[s];
    for (let i = 0; i < len; i++) {
      const segment = segments[i];
      const locSegment = locSegments[i];
      const dynamic = segment[0] === ":";
      const key = dynamic ? segment.slice(1) : segment;
      if (dynamic && matchSegment(locSegment, matchFilter(key))) {
        match.params[key] = locSegment;
      } else if (dynamic || !matchSegment(locSegment, segment)) {
        return null;
      }
      match.path += `/${locSegment}`;
    }
    if (splat) {
      const remainder = lenDiff ? locSegments.slice(-lenDiff).join("/") : "";
      if (matchSegment(remainder, matchFilter(splat))) {
        match.params[splat] = remainder;
      } else {
        return null;
      }
    }
    return match;
  };
}
function matchSegment(input, filter) {
  const isEqual = s => s.localeCompare(input, undefined, {
    sensitivity: "base"
  }) === 0;
  if (filter === undefined) {
    return true;
  } else if (typeof filter === "string") {
    return isEqual(filter);
  } else if (typeof filter === "function") {
    return filter(input);
  } else if (Array.isArray(filter)) {
    return filter.some(isEqual);
  } else if (filter instanceof RegExp) {
    return filter.test(input);
  }
  return false;
}
function scoreRoute(route) {
  const [pattern, splat] = route.pattern.split("/*", 2);
  const segments = pattern.split("/").filter(Boolean);
  return segments.reduce((score, segment) => score + (segment.startsWith(":") ? 2 : 3), segments.length - (splat === undefined ? 0 : 1));
}
function createMemoObject(fn) {
  const map = new Map();
  const owner = getOwner();
  return new Proxy({}, {
    get(_, property) {
      if (!map.has(property)) {
        runWithOwner(owner, () => map.set(property, createMemo(() => fn()[property])));
      }
      return map.get(property)();
    },
    getOwnPropertyDescriptor() {
      return {
        enumerable: true,
        configurable: true
      };
    },
    ownKeys() {
      return Reflect.ownKeys(fn());
    }
  });
}
function mergeSearchString(search, params) {
  const merged = new URLSearchParams(search);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") {
      merged.delete(key);
    } else {
      merged.set(key, String(value));
    }
  });
  const s = merged.toString();
  return s ? `?${s}` : "";
}
function expandOptionals(pattern) {
  let match = /(\/?\:[^\/]+)\?/.exec(pattern);
  if (!match) return [pattern];
  let prefix = pattern.slice(0, match.index);
  let suffix = pattern.slice(match.index + match[0].length);
  const prefixes = [prefix, prefix += match[1]];

  // This section handles adjacent optional params. We don't actually want all permuations since
  // that will lead to equivalent routes which have the same number of params. For example
  // `/:a?/:b?/:c`? only has the unique expansion: `/`, `/:a`, `/:a/:b`, `/:a/:b/:c` and we can
  // discard `/:b`, `/:c`, `/:b/:c` by building them up in order and not recursing. This also helps
  // ensure predictability where earlier params have precidence.
  while (match = /^(\/\:[^\/]+)\?/.exec(suffix)) {
    prefixes.push(prefix += match[1]);
    suffix = suffix.slice(match[0].length);
  }
  return expandOptionals(suffix).reduce((results, expansion) => [...results, ...prefixes.map(p => p + expansion)], []);
}

const MAX_REDIRECTS = 100;
const RouterContextObj = createContext();
const RouteContextObj = createContext();
const useRouter = () => invariant(useContext(RouterContextObj), "<A> and 'use' router primitives can be only used inside a Route.");
const useRoute = () => useContext(RouteContextObj) || useRouter().base;
const useResolvedPath = path => {
  const route = useRoute();
  return createMemo(() => route.resolvePath(path()));
};
const useHref = to => {
  const router = useRouter();
  return createMemo(() => {
    const to_ = to();
    return to_ !== undefined ? router.renderPath(to_) : to_;
  });
};
const useNavigate = () => useRouter().navigatorFactory();
const useLocation = () => useRouter().location;
const useIsRouting = () => useRouter().isRouting;
const useMatch = (path, matchFilters) => {
  const location = useLocation();
  const matchers = createMemo(() => expandOptionals(path()).map(path => createMatcher(path, undefined, matchFilters)));
  return createMemo(() => {
    for (const matcher of matchers()) {
      const match = matcher(location.pathname);
      if (match) return match;
    }
  });
};
const useParams = () => useRouter().params;
const useSearchParams = () => {
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
const useBeforeLeave = listener => {
  const s = useRouter().beforeLeave.subscribe({
    listener,
    location: useLocation(),
    navigate: useNavigate()
  });
  onCleanup(s);
};
function createRoutes(routeDef, base = "") {
  const {
    component,
    load,
    children,
    info
  } = routeDef;
  const isLeaf = !children || Array.isArray(children) && !children.length;
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
      pattern = pattern.split("/").map(s => {
        return s.startsWith(":") || s.startsWith("*") ? s : encodeURIComponent(s);
      }).join("/");
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
function createBranch(routes, index = 0) {
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
function createBranches(routeDef, base = "", stack = [], branches = []) {
  const routeDefs = asArray(routeDef);
  for (let i = 0, len = routeDefs.length; i < len; i++) {
    const def = routeDefs[i];
    if (def && typeof def === "object") {
      if (!def.hasOwnProperty("path")) def.path = "";
      const routes = createRoutes(def, base);
      for (const route of routes) {
        stack.push(route);
        const isEmptyArray = Array.isArray(def.children) && def.children.length === 0;
        if (def.children && !isEmptyArray) {
          createBranches(def.children, route.pattern, stack, branches);
        } else {
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
function getRouteMatches(branches, location) {
  for (let i = 0, len = branches.length; i < len; i++) {
    const match = branches[i].matcher(location);
    if (match) {
      return match;
    }
  }
  return [];
}
function createLocation(path, state) {
  const origin = new URL(mockBase);
  const url = createMemo(prev => {
    const path_ = path();
    try {
      return new URL(path_, origin);
    } catch (err) {
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
function getIntent() {
  return intent;
}
function createRouterContext(integration, branches, getContext, options = {}) {
  const {
    signal: [source, setSource],
    utils = {}
  } = integration;
  const parsePath = utils.parsePath || (p => p);
  const renderPath = utils.renderPath || (p => p);
  const beforeLeave = utils.beforeLeave || createBeforeLeave();
  const basePath = resolvePath("", options.base || "");
  if (basePath === undefined) {
    throw new Error(`${basePath} is not a valid base path`);
  } else if (basePath && !source().value) {
    setSource({
      value: basePath,
      replace: true,
      scroll: false
    });
  }
  const [isRouting, setIsRouting] = createSignal(false);
  const start = async callback => {
    setIsRouting(true);
    try {
      await startTransition(callback);
    } finally {
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
    const {
      value,
      state
    } = source();
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
        if (!to) ; else if (utils.go) {
          utils.go(to);
        } else {
          console.warn("Router integration does not support relative routing");
        }
        return;
      }
      const {
        replace,
        resolve,
        scroll,
        state: nextState
      } = {
        replace: false,
        resolve: true,
        scroll: true,
        ...options
      };
      const resolvedTo = resolve ? route.resolvePath(to) : resolvePath("", to);
      if (resolvedTo === undefined) {
        throw new Error(`Path '${to}' is not a routable path`);
      } else if (referrers.length >= MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }
      const current = reference();
      if (resolvedTo !== current || nextState !== state()) {
        if (isServer) {
          const e = getRequestEvent();
          e && (e.response = {
            status: 302,
            headers: new Headers({
              Location: resolvedTo
            })
          });
          setSource({
            value: resolvedTo,
            replace,
            scroll,
            state: nextState
          });
        } else if (beforeLeave.confirm(resolvedTo, options)) {
          const len = referrers.push({
            value: current,
            replace,
            scroll,
            state: state()
          });
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
      const {
        route,
        params
      } = matches[match];
      route.component && route.component.preload && route.component.preload();
      const {
        load
      } = route;
      preloadData && load && runWithOwner(getContext(), () => load({
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
    return e && e.router && e.router.submission ? [e.router.submission] : [];
  }
}
function createRouteContext(router, parent, outlet, match) {
  const {
    base,
    location,
    params
  } = router;
  const {
    pattern,
    component,
    load
  } = match().route;
  const path = createMemo(() => match().path);
  component && component.preload && component.preload();
  const data = load ? load({
    params,
    location,
    intent: intent || "initial"
  }) : undefined;
  const route = {
    parent,
    pattern,
    path,
    outlet: () => component ? createComponent(component, {
      params,
      location,
      data,
      get children() {
        return outlet();
      }
    }) : outlet(),
    resolvePath(to) {
      return resolvePath(base.path(), to, path());
    }
  };
  return route;
}

const createRouterComponent = router => props => {
  const {
    base
  } = props;
  const routeDefs = children(() => props.children);
  const branches = createMemo(() => createBranches(routeDefs(), props.base || ""));
  let context;
  const routerState = createRouterContext(router, branches, () => context, {
    base,
    singleFlight: props.singleFlight
  });
  router.create && router.create(routerState);
  return createComponent$1(RouterContextObj.Provider, {
    value: routerState,
    get children() {
      return createComponent$1(Root, {
        routerState: routerState,
        get root() {
          return props.root;
        },
        get load() {
          return props.rootLoad;
        },
        get children() {
          return [memo(() => (context = getOwner()) && null), createComponent$1(Routes, {
            routerState: routerState,
            get branches() {
              return branches();
            }
          })];
        }
      });
    }
  });
};
function Root(props) {
  const location = props.routerState.location;
  const params = props.routerState.params;
  const data = createMemo(() => props.load && untrack(() => props.load({
    params,
    location,
    intent: "preload"
  })));
  return createComponent$1(Show, {
    get when() {
      return props.root;
    },
    keyed: true,
    get fallback() {
      return props.children;
    },
    children: Root => createComponent$1(Root, {
      params: params,
      location: location,
      get data() {
        return data();
      },
      get children() {
        return props.children;
      }
    })
  });
}
function Routes(props) {
  if (isServer) {
    const e = getRequestEvent();
    if (e && e.router && e.router.dataOnly) {
      dataOnly(e, props.routerState, props.branches);
      return;
    }
    e && ((e.router || (e.router = {})).matches || (e.router.matches = props.routerState.matches().map(({
      route,
      path,
      params
    }) => ({
      path: route.originalPath,
      pattern: route.pattern,
      match: path,
      params,
      info: route.info
    }))));
  }
  const disposers = [];
  let root;
  const routeStates = createMemo(on(props.routerState.matches, (nextMatches, prevMatches, prev) => {
    let equal = prevMatches && nextMatches.length === prevMatches.length;
    const next = [];
    for (let i = 0, len = nextMatches.length; i < len; i++) {
      const prevMatch = prevMatches && prevMatches[i];
      const nextMatch = nextMatches[i];
      if (prev && prevMatch && nextMatch.route.key === prevMatch.route.key) {
        next[i] = prev[i];
      } else {
        equal = false;
        if (disposers[i]) {
          disposers[i]();
        }
        createRoot(dispose => {
          disposers[i] = dispose;
          next[i] = createRouteContext(props.routerState, next[i - 1] || props.routerState.base, createOutlet(() => routeStates()[i + 1]), () => props.routerState.matches()[i]);
        });
      }
    }
    disposers.splice(nextMatches.length).forEach(dispose => dispose());
    if (prev && equal) {
      return prev;
    }
    root = next[0];
    return next;
  }));
  return createOutlet(() => routeStates() && root)();
}
const createOutlet = child => {
  return () => createComponent$1(Show, {
    get when() {
      return child();
    },
    keyed: true,
    children: child => createComponent$1(RouteContextObj.Provider, {
      value: child,
      get children() {
        return child.outlet();
      }
    })
  });
};
const Route = props => {
  const childRoutes = children(() => props.children);
  return mergeProps(props, {
    get children() {
      return childRoutes();
    }
  });
};

// for data only mode with single flight mutations
function dataOnly(event, routerState, branches) {
  const url = new URL(event.request.url);
  const prevMatches = getRouteMatches(branches, new URL(event.router.previousUrl || event.request.url).pathname);
  const matches = getRouteMatches(branches, url.pathname);
  for (let match = 0; match < matches.length; match++) {
    if (!prevMatches[match] || matches[match].route !== prevMatches[match].route) event.router.dataOnly = true;
    const {
      route,
      params
    } = matches[match];
    route.load && route.load({
      params,
      location: routerState.location,
      intent: "preload"
    });
  }
}

function intercept([value, setValue], get, set) {
  return [get ? () => get(value()) : value, set ? v => setValue(set(v)) : setValue];
}
function querySelector(selector) {
  if (selector === "#") {
    return null;
  }
  // Guard against selector being an invalid CSS selector
  try {
    return document.querySelector(selector);
  } catch (e) {
    return null;
  }
}
function createRouter(config) {
  let ignore = false;
  const wrap = value => typeof value === "string" ? {
    value
  } : value;
  const signal = intercept(createSignal(wrap(config.get()), {
    equals: (a, b) => a.value === b.value
  }), undefined, next => {
    !ignore && config.set(next);
    return next;
  });
  config.init && onCleanup(config.init((value = config.get()) => {
    ignore = true;
    signal[1](wrap(value));
    ignore = false;
  }));
  return createRouterComponent({
    signal,
    create: config.create,
    utils: config.utils
  });
}
function bindEvent(target, type, handler) {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}
function scrollToHash(hash, fallbackTop) {
  const el = querySelector(`#${hash}`);
  if (el) {
    el.scrollIntoView();
  } else if (fallbackTop) {
    window.scrollTo(0, 0);
  }
}

function getPath(url) {
  const u = new URL(url);
  return u.pathname + u.search;
}
function StaticRouter(props) {
  let e;
  const obj = {
    value: props.url || (e = getRequestEvent()) && getPath(e.request.url) || ""
  };
  return createRouterComponent({
    signal: [() => obj, next => Object.assign(obj, next)]
  })(props);
}

const LocationHeader = "Location";
const PRELOAD_TIMEOUT = 5000;
const CACHE_TIMEOUT = 180000;
let cacheMap = new Map();

// cleanup forward/back cache
if (!isServer) {
  setInterval(() => {
    const now = Date.now();
    for (let [k, v] of cacheMap.entries()) {
      if (!v[3].count && now - v[0] > CACHE_TIMEOUT) {
        cacheMap.delete(k);
      }
    }
  }, 300000);
}
function getCache() {
  if (!isServer) return cacheMap;
  const req = getRequestEvent();
  if (!req) throw new Error("Cannot find cache context");
  return (req.router || (req.router = {})).cache || (req.router.cache = new Map());
}
function revalidate(key, force = true) {
  return startTransition(() => {
    const now = Date.now();
    cacheKeyOp(key, entry => {
      force && (entry[0] = 0); //force cache miss
      entry[3][1](now); // retrigger live signals
    });
  });
}
function cacheKeyOp(key, fn) {
  key && !Array.isArray(key) && (key = [key]);
  for (let k of cacheMap.keys()) {
    if (key === undefined || matchKey(k, key)) fn(cacheMap.get(k));
  }
}
function cache(fn, name) {
  // prioritize GET for server functions
  if (fn.GET) fn = fn.GET;
  const cachedFn = (...args) => {
    const cache = getCache();
    const intent = getIntent();
    const owner = getOwner();
    const navigate = owner ? useNavigate() : undefined;
    const now = Date.now();
    const key = name + hashKey(args);
    let cached = cache.get(key);
    let tracking;
    if (isServer) {
      const e = getRequestEvent();
      if (e) {
        const dataOnly = (e.router || (e.router = {})).dataOnly;
        if (dataOnly) {
          const data = e && (e.router.data || (e.router.data = {}));
          if (data && key in data) return data[key];
          if (Array.isArray(dataOnly) && !dataOnly.includes(key)) {
            data[key] = undefined;
            return Promise.resolve();
          }
        }
      }
    }
    if (getListener() && !isServer) {
      tracking = true;
      onCleanup(() => cached[3].count--);
    }
    if (cached && cached[0] && (isServer || intent === "native" || cached[3].count || Date.now() - cached[0] < PRELOAD_TIMEOUT)) {
      if (tracking) {
        cached[3].count++;
        cached[3][0](); // track
      }
      if (cached[2] === "preload" && intent !== "preload") {
        cached[0] = now;
      }
      let res = cached[1];
      if (intent !== "preload") {
        res = "then" in cached[1] ? cached[1].then(handleResponse(false), handleResponse(true)) : handleResponse(false)(cached[1]);
        !isServer && intent === "navigate" && startTransition(() => cached[3][1](cached[0])); // update version
      }
      return res;
    }
    let res = !isServer && sharedConfig.context && sharedConfig.has(key) ? sharedConfig.load(key) // hydrating
    : fn(...args);
    if (cached) {
      cached[0] = now;
      cached[1] = res;
      cached[2] = intent;
      !isServer && intent === "navigate" && startTransition(() => cached[3][1](cached[0])); // update version
    } else {
      cache.set(key, cached = [now, res, intent, createSignal(now)]);
      cached[3].count = 0;
    }
    if (tracking) {
      cached[3].count++;
      cached[3][0](); // track
    }
    if (isServer) {
      const e = getRequestEvent();
      if (e && e.router.dataOnly) return e.router.data[key] = res;
    }
    if (intent !== "preload") {
      res = "then" in res ? res.then(handleResponse(false), handleResponse(true)) : handleResponse(false)(res);
    }
    // serialize on server
    if (isServer && sharedConfig.context && sharedConfig.context.async && !sharedConfig.context.noHydrate) {
      const e = getRequestEvent();
      (!e || !e.serverOnly) && sharedConfig.context.serialize(key, res);
    }
    return res;
    function handleResponse(error) {
      return async v => {
        if (v instanceof Response) {
          if (v.headers.has("Location")) {
            if (navigate) {
              startTransition(() => {
                let url = v.headers.get(LocationHeader);
                if (url && url.startsWith("/")) {
                  navigate(url, {
                    replace: true
                  });
                } else if (!isServer && url) {
                  window.location.href = url;
                }
              });
            }
            return;
          }
          if (v.customBody) v = await v.customBody();
        }
        if (error) throw v;
        return v;
      };
    }
  };
  cachedFn.keyFor = (...args) => name + hashKey(args);
  cachedFn.key = name;
  return cachedFn;
}
cache.set = (key, value) => {
  const cache = getCache();
  const now = Date.now();
  let cached = cache.get(key);
  if (cached) {
    cached[0] = now;
    cached[1] = value;
    cached[2] = "preload";
  } else {
    cache.set(key, cached = [now, value,, createSignal(now)]);
    cached[3].count = 0;
  }
};
cache.clear = () => getCache().clear();
function matchKey(key, keys) {
  for (let k of keys) {
    if (key.startsWith(k)) return true;
  }
  return false;
}

// Modified from the amazing Tanstack Query library (MIT)
// https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts#L168
function hashKey(args) {
  return JSON.stringify(args, (_, val) => isPlainObject(val) ? Object.keys(val).sort().reduce((result, key) => {
    result[key] = val[key];
    return result;
  }, {}) : val);
}
function isPlainObject(obj) {
  let proto;
  return obj != null && typeof obj === "object" && (!(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype);
}

const actions = /* #__PURE__ */new Map();
const routableForms = /* #__PURE__ */new Set();
function useSubmissions(fn, filter) {
  const router = useRouter();
  const subs = createMemo(() => router.submissions[0]().filter(s => s.url === fn.toString() && (!filter || filter(s.input))));
  return new Proxy([], {
    get(_, property) {
      if (property === $TRACK) return subs();
      if (property === "pending") return subs().some(sub => !sub.result);
      return subs()[property];
    }
  });
}
function useSubmission(fn, filter) {
  const submissions = useSubmissions(fn, filter);
  return new Proxy({}, {
    get(_, property) {
      return submissions[submissions.length - 1]?.[property];
    }
  });
}
function useAction(action) {
  const r = useRouter();
  return (...args) => action.apply({
    r
  }, args);
}
function action(fn, name) {
  function mutate(...variables) {
    const router = this.r;
    const form = this.f;
    const p = (router.singleFlight && fn.withOptions ? fn.withOptions({
      headers: {
        "X-Single-Flight": "true"
      }
    }) : fn)(...variables);
    const [result, setResult] = createSignal();
    let submission;
    function handler(error) {
      return async res => {
        const result = await handleResponse(res, error, router.navigatorFactory());
        if (!result) return submission.clear();
        setResult(result);
        if (result.error && !form) throw result.error;
        return result.data;
      };
    }
    router.submissions[1](s => [...s, submission = {
      input: variables,
      url,
      get result() {
        return result()?.data;
      },
      get error() {
        return result()?.error;
      },
      get pending() {
        return !result();
      },
      clear() {
        router.submissions[1](v => v.filter(i => i.input !== variables));
      },
      retry() {
        setResult(undefined);
        const p = fn(...variables);
        return p.then(handler(), handler(true));
      }
    }]);
    return p.then(handler(), handler(true));
  }
  const url = fn.url || name && `https://action/${name}` || (!isServer ? `https://action/${hashString(fn.toString())}` : "");
  return toAction(mutate, url);
}
function toAction(fn, url) {
  fn.toString = () => {
    if (!url) throw new Error("Client Actions need explicit names if server rendered");
    return url;
  };
  fn.with = function (...args) {
    const newFn = function (...passedArgs) {
      return fn.call(this, ...args, ...passedArgs);
    };
    const uri = new URL(url, mockBase);
    uri.searchParams.set("args", hashKey(args));
    return toAction(newFn, (uri.origin === "https://action" ? uri.origin : "") + uri.pathname + uri.search);
  };
  fn.url = url;
  if (!isServer) {
    actions.set(url, fn);
    getOwner() && onCleanup(() => actions.delete(url));
  }
  return fn;
}
const hashString = s => s.split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0) | 0, 0);
async function handleResponse(response, error, navigate) {
  let data;
  let keys;
  let invalidateKeys;
  if (response instanceof Response) {
    if (response.headers.has("X-Revalidate")) keys = invalidateKeys = response.headers.get("X-Revalidate").split(",");
    if (response.customBody) {
      data = await response.customBody();
      if (response.headers.has("X-Single-Flight")) {
        keys || (keys = []);
        invalidateKeys || (invalidateKeys = []);
        Object.keys(data).forEach(key => {
          if (key === "_$value") return;
          keys.push(key);
          cache.set(key, data[key]);
        });
        data = data._$value;
      }
    }
    if (response.headers.has("Location")) {
      const locationUrl = response.headers.get("Location") || "/";
      if (locationUrl.startsWith("http")) {
        window.location.href = locationUrl;
      } else {
        navigate(locationUrl);
      }
    }
  } else if (error) return {
    error: response
  };else data = response;
  // invalidate
  cacheKeyOp(invalidateKeys, entry => entry[0] = 0);
  // trigger revalidation
  await revalidate(keys, false);
  return data != null ? {
    data
  } : undefined;
}

function setupNativeEvents(preload = true, explicitLinks = false, actionBase = "/_server") {
  return router => {
    const basePath = router.base.path();
    const navigateFromRoute = router.navigatorFactory(router.base);
    let preloadTimeout = {};
    function isSvg(el) {
      return el.namespaceURI === "http://www.w3.org/2000/svg";
    }
    function handleAnchor(evt) {
      if (evt.defaultPrevented || evt.button !== 0 || evt.metaKey || evt.altKey || evt.ctrlKey || evt.shiftKey) return;
      const a = evt.composedPath().find(el => el instanceof Node && el.nodeName.toUpperCase() === "A");
      if (!a || explicitLinks && !a.hasAttribute("link")) return;
      const svg = isSvg(a);
      const href = svg ? a.href.baseVal : a.href;
      const target = svg ? a.target.baseVal : a.target;
      if (target || !href && !a.hasAttribute("state")) return;
      const rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (a.hasAttribute("download") || rel && rel.includes("external")) return;
      const url = svg ? new URL(href, document.baseURI) : new URL(href);
      if (url.origin !== window.location.origin || basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase())) return;
      return [a, url];
    }
    function handleAnchorClick(evt) {
      const res = handleAnchor(evt);
      if (!res) return;
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
      if (!res) return;
      const [a, url] = res;
      if (!preloadTimeout[url.pathname]) router.preloadRoute(url, a.getAttribute("preload") !== "false");
    }
    function handleAnchorIn(evt) {
      const res = handleAnchor(evt);
      if (!res) return;
      const [a, url] = res;
      if (preloadTimeout[url.pathname]) return;
      preloadTimeout[url.pathname] = setTimeout(() => {
        router.preloadRoute(url, a.getAttribute("preload") !== "false");
        delete preloadTimeout[url.pathname];
      }, 200);
    }
    function handleAnchorOut(evt) {
      const res = handleAnchor(evt);
      if (!res) return;
      const [, url] = res;
      if (preloadTimeout[url.pathname]) {
        clearTimeout(preloadTimeout[url.pathname]);
        delete preloadTimeout[url.pathname];
      }
    }
    function handleFormSubmit(evt) {
      if (evt.defaultPrevented) return;
      let actionRef = evt.submitter && evt.submitter.hasAttribute("formaction") ? evt.submitter.getAttribute("formaction") : evt.target.getAttribute("action");
      if (!actionRef) return;
      const method = evt.submitter && evt.submitter.hasAttribute("formmethod") ? evt.submitter.getAttribute("formmethod") : evt.target.getAttribute("method");
      if (method?.toUpperCase() === "GET") {
        if (routableForms.has(evt.target)) {
          evt.preventDefault();
          const data = new FormData(evt.target);
          if (evt.submitter && evt.submitter.name) data.append(evt.submitter.name, evt.submitter.value);
          const url = new URL(actionRef, location.origin);
          url.search = "?" + [...data.entries()].map(([key, value]) => `${key}=${value}`).join("&");
          const to = router.parsePath(url.pathname + url.search + url.hash);
          navigateFromRoute(to, {
            resolve: false
          });
          return;
        }
      }
      if (!actionRef.startsWith("https://action/")) {
        // normalize server actions
        const url = new URL(actionRef, mockBase);
        actionRef = router.parsePath(url.pathname + url.search);
        if (!actionRef.startsWith(actionBase)) return;
      }
      if (method?.toUpperCase() !== "POST") throw new Error("Only POST forms are supported for Actions");
      const handler = actions.get(actionRef);
      if (handler) {
        evt.preventDefault();
        const data = new FormData(evt.target);
        if (evt.submitter && evt.submitter.name) data.append(evt.submitter.name, evt.submitter.value);
        handler.call({
          r: router,
          f: evt.target
        }, data);
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

function Router(props) {
  if (isServer) return StaticRouter(props);
  const getSource = () => ({
    value: window.location.pathname + window.location.search + window.location.hash,
    state: window.history.state
  });
  const beforeLeave = createBeforeLeave();
  return createRouter({
    get: getSource,
    set({
      value,
      replace,
      scroll,
      state
    }) {
      if (replace) {
        window.history.replaceState(keepDepth(state), "", value);
      } else {
        window.history.pushState(state, "", value);
      }
      scrollToHash(window.location.hash.slice(1), scroll);
      saveCurrentDepth();
    },
    init: notify => bindEvent(window, "popstate", notifyIfNotBlocked(notify, delta => {
      if (delta && delta < 0) {
        return !beforeLeave.confirm(delta);
      } else {
        const s = getSource();
        return !beforeLeave.confirm(s.value, {
          state: s.state
        });
      }
    })),
    create: setupNativeEvents(props.preload, props.explicitLinks, props.actionBase),
    utils: {
      go: delta => window.history.go(delta),
      beforeLeave
    }
  })(props);
}

function hashParser(str) {
  const to = str.replace(/^.*?#/, "");
  // Hash-only hrefs like `#foo` from plain anchors will come in as `/#foo` whereas a link to
  // `/foo` will be `/#/foo`. Check if the to starts with a `/` and if not append it as a hash
  // to the current path so we can handle these in-page anchors correctly.
  if (!to.startsWith("/")) {
    const [, path = "/"] = window.location.hash.split("#", 2);
    return `${path}#${to}`;
  }
  return to;
}
function HashRouter(props) {
  const getSource = () => window.location.hash.slice(1);
  const beforeLeave = createBeforeLeave();
  return createRouter({
    get: getSource,
    set({
      value,
      replace,
      scroll,
      state
    }) {
      if (replace) {
        window.history.replaceState(keepDepth(state), "", "#" + value);
      } else {
        window.location.hash = value;
      }
      const hashIndex = value.indexOf("#");
      const hash = hashIndex >= 0 ? value.slice(hashIndex + 1) : "";
      scrollToHash(hash, scroll);
      saveCurrentDepth();
    },
    init: notify => bindEvent(window, "hashchange", notifyIfNotBlocked(notify, delta => !beforeLeave.confirm(delta && delta < 0 ? delta : getSource()))),
    create: setupNativeEvents(props.preload, props.explicitLinks, props.actionBase),
    utils: {
      go: delta => window.history.go(delta),
      renderPath: path => `#${path}`,
      parsePath: hashParser,
      beforeLeave
    }
  })(props);
}

function createMemoryHistory() {
  const entries = ["/"];
  let index = 0;
  const listeners = [];
  const go = n => {
    // https://github.com/remix-run/react-router/blob/682810ca929d0e3c64a76f8d6e465196b7a2ac58/packages/router/history.ts#L245
    index = Math.max(0, Math.min(index + n, entries.length - 1));
    const value = entries[index];
    listeners.forEach(listener => listener(value));
  };
  return {
    get: () => entries[index],
    set: ({
      value,
      scroll,
      replace
    }) => {
      if (replace) {
        entries[index] = value;
      } else {
        entries.splice(index + 1, entries.length - index, value);
        index++;
      }
      listeners.forEach(listener => listener(value));
      setTimeout(() => {
        if (scroll) {
          scrollToHash(value.split("#")[1] || "", true);
        }
      }, 0);
    },
    back: () => {
      go(-1);
    },
    forward: () => {
      go(1);
    },
    go,
    listen: listener => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        listeners.splice(index, 1);
      };
    }
  };
}
function MemoryRouter(props) {
  const memoryHistory = props.history || createMemoryHistory();
  return createRouter({
    get: memoryHistory.get,
    set: memoryHistory.set,
    init: memoryHistory.listen,
    create: setupNativeEvents(props.preload, props.explicitLinks, props.actionBase),
    utils: {
      go: memoryHistory.go
    }
  })(props);
}

const _tmpl$$1 = /*#__PURE__*/template(`<a>`);
function A(props) {
  props = mergeProps({
    inactiveClass: "inactive",
    activeClass: "active"
  }, props);
  const [, rest] = splitProps(props, ["href", "state", "class", "activeClass", "inactiveClass", "end"]);
  const to = useResolvedPath(() => props.href);
  const href = useHref(to);
  const location = useLocation();
  const isActive = createMemo(() => {
    const to_ = to();
    if (to_ === undefined) return [false, false];
    const path = normalizePath(to_.split(/[?#]/, 1)[0]).toLowerCase();
    const loc = normalizePath(location.pathname).toLowerCase();
    return [props.end ? path === loc : loc.startsWith(path), path === loc];
  });
  return (() => {
    const _el$ = _tmpl$$1();
    spread(_el$, mergeProps$1(rest, {
      get href() {
        return href() || props.href;
      },
      get state() {
        return JSON.stringify(props.state);
      },
      get classList() {
        return {
          ...(props.class && {
            [props.class]: true
          }),
          [props.inactiveClass]: !isActive()[0],
          [props.activeClass]: isActive()[0],
          ...rest.classList
        };
      },
      "link": "",
      get ["aria-current"]() {
        return isActive()[1] ? "page" : undefined;
      }
    }), false, false);
    return _el$;
  })();
}
function Navigate(props) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    href,
    state
  } = props;
  const path = typeof href === "function" ? href({
    navigate,
    location
  }) : href;
  navigate(path, {
    replace: true,
    state
  });
  return null;
}

/**
 * This is mock of the eventual Solid 2.0 primitive. It is not fully featured.
 */
function createAsync(fn, options) {
  let resource;
  let prev = () => !resource || resource.state === "unresolved" ? undefined : resource.latest;
  [resource] = createResource(() => subFetch(fn, untrack(prev)), v => v, options);
  return () => resource();
}
function createAsyncStore(fn, options = {}) {
  let resource;
  let prev = () => !resource || resource.state === "unresolved" ? undefined : unwrap(resource.latest);
  [resource] = createResource(() => subFetch(fn, untrack(prev)), v => v, {
    ...options,
    storage: init => createDeepSignal(init, options.reconcile)
  });
  return () => resource();
}
function createDeepSignal(value, options) {
  const [store, setStore] = createStore({
    value
  });
  return [() => store.value, v => {
    typeof v === "function" && (v = v());
    setStore("value", reconcile(v, options));
    return store.value;
  }];
}

// mock promise while hydrating to prevent fetching
class MockPromise {
  static all() {
    return new MockPromise();
  }
  static allSettled() {
    return new MockPromise();
  }
  static any() {
    return new MockPromise();
  }
  static race() {
    return new MockPromise();
  }
  static reject() {
    return new MockPromise();
  }
  static resolve() {
    return new MockPromise();
  }
  catch() {
    return new MockPromise();
  }
  then() {
    return new MockPromise();
  }
  finally() {
    return new MockPromise();
  }
}
function subFetch(fn, prev) {
  if (isServer || !sharedConfig.context) return fn(prev);
  const ogFetch = fetch;
  const ogPromise = Promise;
  try {
    window.fetch = () => new MockPromise();
    Promise = MockPromise;
    return fn(prev);
  } finally {
    window.fetch = ogFetch;
    Promise = ogPromise;
  }
}

function redirect(url, init = 302) {
  let responseInit;
  let revalidate;
  if (typeof init === "number") {
    responseInit = {
      status: init
    };
  } else {
    ({
      revalidate,
      ...responseInit
    } = init);
    if (typeof responseInit.status === "undefined") {
      responseInit.status = 302;
    }
  }
  const headers = new Headers(responseInit.headers);
  headers.set("Location", url);
  revalidate && headers.set("X-Revalidate", revalidate.toString());
  const response = new Response(null, {
    ...responseInit,
    headers: headers
  });
  return response;
}
function reload(init = {}) {
  const {
    revalidate,
    ...responseInit
  } = init;
  const headers = new Headers(responseInit.headers);
  revalidate && headers.set("X-Revalidate", revalidate.toString());
  return new Response(null, {
    ...responseInit,
    headers
  });
}
function json(data, init = {}) {
  const {
    revalidate,
    ...responseInit
  } = init;
  const headers = new Headers(responseInit.headers);
  revalidate && headers.set("X-Revalidate", revalidate.toString());
  headers.set("Content-Type", "application/json");
  const response = new Response(JSON.stringify(data), {
    ...responseInit,
    headers
  });
  response.customBody = () => data;
  return response;
}

const _tmpl$ = /*#__PURE__*/template(`<form>`);
function Form(props) {
  const [, rest] = splitProps(props, ["ref"]);
  onMount(() => {
    routableForms.add(formRef);
  });
  onCleanup(() => routableForms.delete(formRef));
  let formRef;
  return (() => {
    const _el$ = _tmpl$();
    use(el => {
      props.ref && props.ref(el);
      formRef = el;
    }, _el$);
    spread(_el$, rest, false, false);
    return _el$;
  })();
}

export { A, Form, HashRouter, MemoryRouter, Navigate, Route, Router, StaticRouter, mergeSearchString as _mergeSearchString, action, cache, createAsync, createAsyncStore, createBeforeLeave, createMemoryHistory, createRouter, json, keepDepth, notifyIfNotBlocked, redirect, reload, revalidate, saveCurrentDepth, useAction, useBeforeLeave, useHref, useIsRouting, useLocation, useMatch, useNavigate, useParams, useResolvedPath, useSearchParams, useSubmission, useSubmissions };