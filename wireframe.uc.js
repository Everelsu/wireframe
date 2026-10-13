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
    [/^wireframe\.(window|transparency)|wf-border-color|squircle|^wireframe\.radius_scale/, "#browser", "Window"],
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
      if (opts.length <= 4) {
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

  async function build() {
    const prefs = await (await fetch(BASE + "preferences.json")).json();
    const sections = [];
    for (const p of prefs) {
      if (p.type === "text" && p.size === "20px") sections.push({ title: p.label, items: [] });
      else if (p.property && sections.length) sections.at(-1).items.push(p);
    }

    const nav = h("nav", { class: "wf-nav" });
    const body = h("div", { class: "wf-body" });
    const select = (i) => {
      for (const [j, b] of [...nav.children].entries()) b.setAttribute("aria-current", String(i === j));
      body.replaceChildren(
        h("h2", {}, sections[i].title),
        ...sections[i].items.map((p) => h("div", {
          class: "wf-row",
          onmouseenter: () => showTarget(p.property),
          onmouseleave: hideTarget,
          onfocusin: () => showTarget(p.property),
        },
        h("label", { title: p.property }, p.label, p.restart ? h("small", {}, " · restart") : null),
        control(p))),
        h("button", {
          class: "wf-reset",
          onclick: () => {
            for (const p of sections[i].items) {
              if (Services.prefs.prefHasUserValue(p.property)) Services.prefs.clearUserPref(p.property);
              if (p.defaultValue !== undefined && !p.property.startsWith("zen.")) write(p, p.defaultValue);
            }
            select(i);
          },
        }, "Reset this section"),
      );
      body.scrollTop = 0;
    };
    sections.forEach((s, i) => nav.append(h("button", { onclick: () => select(i) }, s.title)));

    panel = h("div", { id: "wf-settings", hidden: true, role: "dialog", "aria-label": "Wireframe settings" },
      h("header", {},
        h("strong", {}, "Wireframe"),
        h("span", {}, "changes apply live · hover a setting to see what it touches"),
        h("button", { class: "wf-close", title: "Close", onclick: close }, "✕")),
      h("div", { class: "wf-main" }, nav, body));
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

  window.gWireframeSettings = { open, close };
})();
