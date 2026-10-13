// Wireframe settings panel: an in-window panel opened from the app menu.
// Changes apply live (the theme reacts to prefs instantly) and hovering a
// setting outlines the part of the browser it affects.
(() => {
  if (window.__wfSettings) return;
  window.__wfSettings = true;

  const BASE = new Error().fileName.replace(/[^/]*$/, "");

  // which part of the browser each setting touches (first match wins)
  const TARGETS = [
    [/controls|window-controls/, ".titlebar-buttonbox-container", "Window controls"],
    [/^wireframe\.(window|transparency)|wireframe.frame|squircle|^wireframe\.radius_scale/, "#browser", "Window"],
    [/webview|nogaps/, "#zen-tabbox-wrapper", "Page frame"],
    [/blank|wf-blank|pattern/, ".deck-selected .browserStack", "Page / empty tab"],
    [/essen/, ".zen-essentials-container", "Essentials"],
    [/new-tab/, "#tabs-newtab-button", "New tab button"],
    [/tab|folders|audio/, "#tabbrowser-arrowscrollbox", "Tabs"],
    [/urlbar/, "#urlbar-container", "URL bar"],
    [/sidebar-foot|workspace-switch/, "#zen-sidebar-foot-buttons", "Sidebar bottom"],
    [/workspace/, ".zen-current-workspace-indicator", "Space name"],
    [/toolbar\.hide|navigation/, "#zen-sidebar-top-buttons", "Top buttons"],
    [/statusbar/, "#statuspanel", "Status bar"],
    [/pip|player/, "#zen-media-controls-toolbar", "Media player"],
    [/font/, "#navigator-toolbox", "Sidebar text"],
    [/compact|ff-sidebar|pinned-ext|macos\.border|contextmenu/, "#navigator-toolbox", "Sidebar"],
  ];

  const prefType = Services.prefs.getPrefType.bind(Services.prefs);
  const read = (p) => {
    switch (prefType(p.property)) {
      case Services.prefs.PREF_BOOL: return Services.prefs.getBoolPref(p.property);
      case Services.prefs.PREF_INT: return Services.prefs.getIntPref(p.property);
      case Services.prefs.PREF_STRING: return Services.prefs.getStringPref(p.property);
      default: return p.defaultValue ?? (p.type === "checkbox" ? false : "");
    }
  };
  const write = (p, v) => {
    if (p.type === "checkbox") Services.prefs.setBoolPref(p.property, !!v);
    else if (p.value === "number") Services.prefs.setIntPref(p.property, Number(v));
    else Services.prefs.setStringPref(p.property, String(v));
    // Sine exposes string prefs as :root variables; keep them live too
    if (p.type === "string") {
      document.documentElement.style.setProperty("--" + p.property.replaceAll(".", "-"), v);
    }
  };

  // Sine's "conditions" format: a setting that does nothing in the current
  // setup (e.g. macOS button options with Windows-style controls) is shown
  // locked, with what it needs, instead of silently doing nothing
  const condOk = (c) => {
    const { property, value } = c.if || c.not;
    let v;
    try {
      v = typeof value === "boolean" ? Services.prefs.getBoolPref(property, false)
        : typeof value === "number" ? Services.prefs.getIntPref(property, 0)
        : Services.prefs.getStringPref(property, "");
    } catch {
      v = undefined;
    }
    return c.not ? v !== value : v === value;
  };
  const prefLabel = new Map();
  const optLabel = new Map(); // "pref=value" -> option label
  const blockedBy = (p) => {
    if (!p.conditions?.length) return null;
    const ok = p.conditions.map(condOk);
    if (p.operator === "AND" ? ok.every(Boolean) : ok.some(Boolean)) return null;
    const c = p.conditions[0];
    const { property, value } = c.if || c.not;
    const name = prefLabel.get(property) ?? property;
    if (typeof value === "boolean") return `needs "${name}" ${value === !c.not ? "on" : "off"}`;
    const shown = optLabel.get(`${property}=${value}`) ?? value;
    return c.not ? `not with "${name}": ${shown}` : `needs "${name}": ${shown}`;
  };

  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
    }
    el.append(...kids.flat().filter((k) => k !== null && k !== undefined));
    return el;
  };

  // ---------- preview highlight ----------
  const ring = h("div", { id: "wf-preview-ring", hidden: true }, h("span", { id: "wf-preview-label" }));
  const showTarget = (prop) => {
    const hit = TARGETS.find(([re]) => re.test(prop));
    const el = hit && document.querySelector(hit[1]);
    const r = el?.getBoundingClientRect();
    if (!r || r.width < 2 || r.height < 2) {
      ring.hidden = true;
      return;
    }
    // keep the ring inside the window
    const x = Math.max(2, r.x - 4), y = Math.max(2, r.y - 4);
    const right = Math.min(innerWidth - 2, r.right + 4), bottom = Math.min(innerHeight - 2, r.bottom + 4);
    Object.assign(ring.style, {
      left: `${x}px`, top: `${y}px`, width: `${right - x}px`, height: `${bottom - y}px`,
    });
    ring.firstChild.textContent = hit[2];
    ring.hidden = false;
  };
  const hideTarget = () => (ring.hidden = true);

  // ---------- controls ----------
  const control = (p) => {
    const value = read(p);
    if (p.type === "checkbox") {
      return h("button", {
        class: "wf-toggle", "aria-pressed": String(!!value), role: "switch",
        onclick: (e) => {
          const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
          write(p, on);
          e.currentTarget.setAttribute("aria-pressed", String(on));
        },
      }, h("span"));
    }
    if (p.type === "dropdown") {
      const opts = p.options ?? [];
      // short choices as buttons; long labels would run off the panel
      if (opts.length <= 4 && opts.reduce((n, o) => n + o.label.length, 0) <= 30) {
        const seg = h("div", { class: "wf-seg" });
        for (const o of opts) {
          seg.append(h("button", {
            "aria-pressed": String(o.value == value),
            onclick: () => {
              write(p, o.value);
              for (const b of seg.children) b.setAttribute("aria-pressed", "false");
              seg.children[opts.indexOf(o)].setAttribute("aria-pressed", "true");
            },
          }, o.label));
        }
        return seg;
      }
      const sel = h("select", { class: "wf-select", onchange: (e) => write(p, opts[e.target.selectedIndex].value) },
        opts.map((o) => h("option", { selected: o.value == value }, o.label)));
      return sel;
    }
    // string
    return h("input", {
      class: "wf-input", type: "text", value: String(value ?? ""), placeholder: p.placeholder ?? "default",
      onchange: (e) => write(p, e.target.value.trim()),
    });
  };

  // ---------- panel ----------
  let panel = null;
  // settings marked "restart" that changed while Zen is running
  const pendingRestart = new Set();

  async function build() {
    const prefs = await (await fetch(BASE + "preferences.json")).json();
    for (const p of prefs) {
      if (!p.property) continue;
      prefLabel.set(p.property, p.label);
      for (const o of p.options ?? []) optLabel.set(`${p.property}=${o.value}`, o.label);
    }
    const sections = [];
    for (const p of prefs) {
      if (p.type === "text" && p.size === "20px") sections.push({ title: p.label, items: [] });
      else if (p.property && sections.length) sections.at(-1).items.push(p);
    }

    const nav = h("nav", { class: "wf-nav" });
    const body = h("div", { class: "wf-body" });
    const search = h("input", {
      class: "wf-search", type: "search", placeholder: "Find a setting…",
      oninput: () => render(true),
    });
    const banner = h("div", { class: "wf-restart", hidden: true },
      h("span", {}),
      h("button", {
        onclick: () => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart),
      }, "Restart Zen"));
    let current = 0;

    const row = (p) => {
      const blocked = blockedBy(p);
      return h("div", {
        class: "wf-row",
        "data-blocked": blocked ? "" : null,
        inert: blocked ? "" : null,
        onmouseenter: () => showTarget(p.property),
        onmouseleave: hideTarget,
        onfocusin: () => showTarget(p.property),
      },
      h("label", { title: p.property }, p.label,
        p.restart ? h("small", {}, " · restart") : null,
        blocked ? h("small", { class: "wf-why" }, blocked) : null),
      control(p));
    };

    // animate: rows come in one after another (section switch, search);
    // a plain refresh after a change keeps them still
    const render = (animate) => {
      const top = body.scrollTop;
      const q = search.value.trim().toLowerCase();
      for (const [j, b] of [...nav.children].entries()) {
        b.setAttribute("aria-current", String(!q && current === j));
      }
      if (q) {
        const hits = sections.flatMap((sec) => sec.items
          .filter((p) => `${p.label} ${p.property} ${sec.title}`.toLowerCase().includes(q))
          .map((p) => [sec, p]));
        const kids = [h("h2", {}, hits.length ? `Results for "${search.value.trim()}"` : "Nothing found")];
        let last = null;
        for (const [sec, p] of hits) {
          if (sec !== last) kids.push(h("div", { class: "wf-group" }, sec.title));
          last = sec;
          kids.push(row(p));
        }
        body.replaceChildren(...kids);
      } else {
        const sec = sections[current];
        body.replaceChildren(
          h("h2", {}, sec.title),
          ...sec.items.map(row),
          h("button", {
            class: "wf-reset",
            onclick: () => {
              for (const p of sec.items) {
                if (Services.prefs.prefHasUserValue(p.property)) Services.prefs.clearUserPref(p.property);
                if (p.defaultValue !== undefined && !p.property.startsWith("zen.") && !p.property.startsWith("widget.")) {
                  write(p, p.defaultValue);
                }
              }
              render(true);
            },
          }, "Reset this section"),
        );
      }
      [...body.querySelectorAll(".wf-row, .wf-group")].forEach((el, k) => el.style.setProperty("--wf-i", Math.min(k, 12)));
      body.toggleAttribute("data-enter", !!animate);
      body.scrollTop = animate ? 0 : top;
    };
    const select = (i) => {
      current = i;
      search.value = "";
      render(true);
    };
    sections.forEach((sec, i) => nav.append(h("button", { onclick: () => select(i) }, sec.title)));

    // keep the panel in step with the prefs, whoever changes them (Sine's
    // settings page, about:config); one re-render per frame at most
    let queued = false;
    const onPref = (_s, _t, name) => {
      const p = prefs.find((x) => x.property === name);
      if (p?.restart) {
        pendingRestart.add(p.label);
        banner.firstChild.textContent = `Restart to apply: ${[...pendingRestart].join(", ")}`;
        banner.hidden = false;
      }
      if (queued || panel.hidden) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        // a text field being typed in would lose its caret
        if (!body.contains(document.activeElement) || document.activeElement.type !== "text") render(false);
      });
    };
    const watched = new Set(prefs.flatMap((p) => [p.property, ...(p.conditions ?? []).map((c) => (c.if || c.not).property)]).filter(Boolean));
    for (const name of watched) Services.prefs.addObserver(name, onPref);
    window.addEventListener("unload", () => {
      for (const name of watched) Services.prefs.removeObserver(name, onPref);
    }, { once: true });

    panel = h("div", { id: "wf-settings", hidden: true, role: "dialog", "aria-label": "Wireframe settings" },
      h("header", {},
        h("strong", {}, "Wireframe"),
        search,
        h("button", { class: "wf-close", title: "Close", onclick: close }, "✕")),
      h("div", { class: "wf-main" }, nav, body),
      banner);
    document.body.append(panel, ring);
    select(0);
  }

  async function open() {
    if (!panel) await build();
    panel.hidden = false;
    requestAnimationFrame(() => panel.setAttribute("open", ""));
  }
  function close() {
    if (!panel) return;
    panel.removeAttribute("open");
    hideTarget();
    setTimeout(() => (panel.hidden = !panel.hasAttribute("open")), 220);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel && !panel.hidden) close();
  }, true);

  // ---------- app menu entry ----------
  const addMenuItem = () => {
    const anchor = document.getElementById("appMenu-settings-button");
    if (!anchor || document.getElementById("appMenu-wireframe-button")) return;
    const item = document.createXULElement("toolbarbutton");
    item.id = "appMenu-wireframe-button";
    item.className = "subviewbutton";
    item.setAttribute("label", "Wireframe");
    item.addEventListener("command", () => {
      PanelUI.hide();
      open();
    });
    anchor.after(item);
  };
  // the main view is built lazily on first open
  document.getElementById("appMenu-popup")?.addEventListener("popupshowing", addMenuItem);
  addMenuItem();

  // ---------- transparency: no system caption / border ----------
  // With "accent color on title bars and window borders" on, Windows tints
  // the caption strip (the top ~30px) of the active window and draws a
  // border around it. On a see-through window (MicaForEveryone) that shows
  // as a darker band along the top that no CSS reaches. Ask the window
  // manager to leave both out while the window is transparent (Windows 11;
  // older versions ignore the call), and to restore them otherwise.
  if (AppConstants.platform === "win") {
    const DWMWA_BORDER_COLOR = 34;
    const DWMWA_CAPTION_COLOR = 35;
    const NONE = 0xfffffffe;
    const DEFAULT = 0xffffffff;
    const applyFrame = () => {
      const see = Services.prefs.getStringPref("wireframe.transparency", "off") !== "off";
      try {
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
        const handle = window.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle;
        const dwm = ctypes.open("dwmapi.dll");
        try {
          const set = dwm.declare("DwmSetWindowAttribute", ctypes.winapi_abi, ctypes.int32_t,
            ctypes.voidptr_t, ctypes.uint32_t, ctypes.voidptr_t, ctypes.uint32_t);
          const hwnd = ctypes.voidptr_t(ctypes.UInt64(handle));
          const color = ctypes.uint32_t(see ? NONE : DEFAULT);
          set(hwnd, DWMWA_BORDER_COLOR, color.address(), 4);
          set(hwnd, DWMWA_CAPTION_COLOR, color.address(), 4);
        } finally {
          dwm.close();
        }
      } catch (e) {
        console.error("[Wireframe] window frame:", e);
      }
    };
    applyFrame();
    Services.prefs.addObserver("wireframe.transparency", applyFrame);
    // the window manager may repaint the frame its own way after these
    window.addEventListener("sizemodechange", applyFrame);
    window.addEventListener("activate", applyFrame);
    window.addEventListener("unload", () => Services.prefs.removeObserver("wireframe.transparency", applyFrame), { once: true });
  }

  // ---------- split by dragging a tab onto a tab ----------
  // Zen splits when a dragged tab rests on another tab, but only within
  // its middle 20% for half a second, which is hard to hit. Widen it to the
  // middle half and shorten the wait; the outer quarters still reorder.
  // Defaults only: a value the user set in about:config wins.
  const defaults = Services.prefs.getDefaultBranch("");
  try {
    defaults.setIntPref("zen.splitView.drag-over-split-threshold", 25);
    defaults.setIntPref("zen.splitView.drag-over-split-delayMC", 320);
  } catch {}

  // ---------- url bar motion ----------
  // The panel's surface morphs between the docked bar and the open panel
  // (see "motion" in modules/urlbar.css). Its geometry lives in custom
  // properties, which only animate when registered, and @property is
  // ignored in a user sheet.
  for (const [name, syntax, initialValue] of [
    ["--wf-bt", "<length-percentage>", "0px"],
    ["--wf-br", "<length-percentage>", "0px"],
    ["--wf-bb", "<length-percentage>", "0px"],
    ["--wf-bl", "<length-percentage>", "0px"],
    ["--wf-rt", "<length>", "0px"],
    ["--wf-rb", "<length>", "0px"],
    ["--wf-bc", "<color>", "transparent"],
    ["--wf-split-line", "<color>", "transparent"],
  ]) {
    try {
      CSS.registerProperty({ name, syntax, inherits: false, initialValue });
    } catch {} // already registered (window reused)
  }

  // Firefox drops the open panel at once. When the bar is closing (focus
  // left it), we hold Firefox's close steps for a moment, mark the panel
  // [wf-closing] so CSS morphs it back on the live panel, then run the held
  // steps in order. Reopening meanwhile completes the close first.
  const urlbar = document.getElementById("urlbar");
  if (urlbar && matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    // how long each way back takes (longest transition + fade in urlbar.css)
    const HOLD = { dock: 350, frame: 330, line: 370, center: 320, fade: 150 };
    // pref wireframe.urlbar.motion: morph (default) | fade | off
    const motion = () => {
      if (Services.prefs.getStringPref("wireframe.motion", "") === "off") return "off";
      return Services.prefs.getStringPref("wireframe.urlbar.motion", "morph");
    };
    const root = document.documentElement;
    const view = gURLBar.view;
    const viewClose = view.close.bind(view);
    const toggle = Element.prototype.toggleAttribute;
    const hide = HTMLElement.prototype.hidePopover;
    const surface = urlbar.querySelector(".urlbar-background");
    const input = urlbar.querySelector(".urlbar-input-container");
    let closing = null;
    let replaying = false;
    let escAt = 0;
    // the docked bar's height and its input row's offset inside it,
    // measured while it sits in the sidebar
    let dockH = 0;
    let inOff = { x: 1, y: 1 };
    const measureDocked = () => {
      if (urlbar.hasAttribute("breakout-extend")) return;
      const u = urlbar.getBoundingClientRect();
      const i = input.getBoundingClientRect();
      if (!onScreen(u)) return;
      dockH = u.height;
      inOff = { x: i.left - u.left, y: i.top - u.top };
    };

    const compact = () => root.getAttribute("zen-compact-mode") === "true";
    // how the bar was opened; Zen drops its own markers before the panel
    // collapses, so remember it for the closing animation
    const origin = () => {
      if (urlbar.hasAttribute("zen-newtab")) return "line";
      if (urlbar.getAttribute("zen-floating-urlbar") === "true") return compact() ? "center" : "frame";
      return "dock";
    };
    const onScreen = (r) => r && r.width > 2 && r.height > 2 && r.right > 8 && r.left < innerWidth - 8;

    // the bar's slot in the sidebar; the bar itself has left it while open
    const dockRect = () => {
      const c = document.getElementById("urlbar-container")?.getBoundingClientRect();
      if (!onScreen(c)) return null;
      const h = Math.min(c.height, dockH || c.height);
      const top = c.top + (c.height - h) / 2;
      return { left: c.left, right: c.right, width: c.width, top, bottom: top + h, height: h };
    };

    // where the docked bar sits, relative to the open panel. Measured from
    // the edge the panel hangs on, since results still arrive and change
    // its height after this.
    const setDock = (d) => {
      const u = urlbar.getBoundingClientRect();
      const s = surface.style;
      if (Services.prefs.getBoolPref("wireframe.urlbar.position.top", false)) {
        s.setProperty("--wf-dock-t", `${d.top - u.top}px`);
        s.setProperty("--wf-dock-b", `calc(100% - ${d.bottom - u.top}px)`);
      } else {
        s.setProperty("--wf-dock-t", `calc(100% - ${u.bottom - d.top}px)`);
        s.setProperty("--wf-dock-b", `${u.bottom - d.bottom}px`);
      }
      s.setProperty("--wf-dock-r", `${u.right - d.right}px`);
      s.setProperty("--wf-dock-l", `${d.left - u.left}px`);
      // from layout offsets: Firefox/Zen may still be animating the input
      // row in with a transform, which a bounding rect would include
      const i = input.offsetParent === urlbar
        ? { left: u.left + input.offsetLeft, top: u.top + input.offsetTop }
        : input.getBoundingClientRect();
      input.style.setProperty("--wf-in-dx", `${d.left + inOff.x - i.left}px`);
      input.style.setProperty("--wf-in-dy", `${d.top + inOff.y - i.top}px`);
      input.style.setProperty("--wf-in-w", `${d.right - d.left - 2 * inOff.x}px`);
    };

    // opening: put the surface where the bar came from (no transition),
    // let one style flush see it there, then release it to the open state
    const enter = (from) => {
      if (!urlbar.hasAttribute("breakout-extend") || closing) {
        urlbar.removeAttribute("wf-enter");
        return;
      }
      let o = motion() === "fade" ? "fade" : origin();
      if (o === "dock" && !onScreen(from)) o = compact() ? "center" : "frame";
      urlbar.setAttribute("wf-origin", o);
      if (o === "fade") {
        urlbar.removeAttribute("wf-enter");
        return;
      }
      if (o === "dock") setDock(from);
      urlbar.setAttribute("wf-enter", o);
      getComputedStyle(surface).getPropertyValue("--wf-bt");
      urlbar.removeAttribute("wf-enter");
    };

    const finish = () => {
      const held = closing?.held ?? [];
      const fromEsc = closing?.fromEsc;
      closing = null;
      urlbar.removeAttribute("wf-closing");
      urlbar.removeAttribute("wf-origin");
      replaying = true;
      for (const step of held) {
        try {
          step();
        } catch (e) {
          console.error("[Wireframe] url bar close:", e);
        }
      }
      replaying = false;
      // Zen positions the open bar with an inline top and clears it right
      // after collapsing it; that came while the collapse was held, so it saw
      // the bar still expanded and set it again. Without this the docked bar
      // sits that far below its slot (off screen in compact mode).
      if (!urlbar.hasAttribute("breakout-extend")) urlbar.style.top = "";
      requestAnimationFrame(measureDocked);
      // Esc in a click-opened bar leaves focus in it, so Firefox would keep
      // it open; finish what Esc meant
      if (fromEsc && urlbar.hasAttribute("breakout-extend")) {
        gURLBar.blur();
        gBrowser.selectedBrowser.focus();
      }
    };

    const begin = () => {
      if (replaying) return false;
      if (closing) return true;
      if (motion() === "off") return false;
      if (root.getAttribute("zen-single-toolbar") !== "true" || !urlbar.hasAttribute("breakout-extend")) {
        return false;
      }
      let o = urlbar.getAttribute("wf-origin") || (motion() === "fade" ? "fade" : origin());
      if (o === "dock") {
        // back into the sidebar, if it is still there to land in
        const d = dockRect();
        if (d) setDock(d);
        else o = compact() ? "center" : "frame";
      }
      urlbar.removeAttribute("wf-enter");
      urlbar.setAttribute("wf-closing", o);
      closing = { held: [], timer: setTimeout(finish, HOLD[o] ?? 340) };
      return true;
    };

    // measure once the sidebar has laid out
    requestAnimationFrame(measureDocked);

    view.close = function (...args) {
      if (replaying) return viewClose(...args);
      const step = () => viewClose(...args);
      // focus already left the bar: this close is the start of a collapse
      if (closing || (urlbar.hasAttribute("breakout-extend") && !urlbar.hasAttribute("focused") && begin())) {
        closing.held.push(step);
        return;
      }
      // Esc: Zen closes the results and the bar collapses as a consequence;
      // treat it as the start of the collapse so the results go with it
      if (urlbar.hasAttribute("breakout-extend") && performance.now() - escAt < 60 && begin()) {
        closing.fromEsc = true;
        closing.held.push(step);
        return;
      }
      return viewClose(...args);
    };

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && urlbar.hasAttribute("breakout-extend")) escAt = performance.now();
    }, true);

    // safety net: if the browser hid the panel natively while Firefox still
    // treats the bar as expanded, it would sit out of view until a reload.
    // Put it back in the sidebar.
    urlbar.addEventListener("toggle", (e) => {
      if (e.newState !== "closed" || closing) return;
      requestAnimationFrame(() => {
        if (!closing && !urlbar.matches(":popover-open") && urlbar.hasAttribute("breakout-extend")) {
          toggle.call(urlbar, "breakout-extend", false);
          urlbar.removeAttribute("wf-origin");
          if (urlbar.hasAttribute("focused")) gURLBar.blur();
        }
      });
    });
    // Escape would also hide the popover natively right after Firefox
    // handled it; Firefox hides it itself anyway (held while we animate)
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && (closing || urlbar.hasAttribute("breakout-extend"))) e.preventDefault();
    });

    urlbar.toggleAttribute = function (name, force) {
      if (name === "breakout-extend") {
        if (force === false && this.hasAttribute(name) && begin()) {
          closing.held.push(() => toggle.call(this, name, force));
          return false;
        }
        if (force === true && closing) {
          // reopened while closing: finish the close first so Firefox's own
          // state stays consistent, then open normally
          clearTimeout(closing.timer);
          finish();
        }
        if (force === true && !this.hasAttribute(name) && motion() !== "off") {
          // where the docked bar is (Firefox may already have moved the bar
          // itself into the top layer by now, its slot stays put)
          const from = dockRect();
          this.setAttribute("wf-origin", origin());
          this.setAttribute("wf-enter", "");
          const result = toggle.call(this, name, force);
          // Zen sets its own markers (keyboard / new tab) right after the
          // toggle, in the same task: decide the origin once they're in
          queueMicrotask(() => enter(from));
          return result;
        }
      }
      return toggle.call(this, name, force);
    };

    urlbar.hidePopover = function () {
      if (closing && !replaying) {
        closing.held.push(() => hide.call(this));
        return;
      }
      return hide.call(this);
    };
  }

  window.gWireframeSettings = { open, close };
})();
