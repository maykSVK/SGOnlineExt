(function (root) {
  "use strict";
  const TARGET = "Vala Mal Doran";
  const normalize = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();

  function integer(value) {
    const text = String(value).replace(/[\s\u00a0]/g, "");
    return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
  }

  function counters(link) {
    const remaining = integer(link.querySelector("strong")?.textContent ?? "");
    const tail = [...link.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(" ");
    const maximum = integer(tail.match(/(\d+)\s*$/)?.[1] ?? "");
    return { remaining, maximum };
  }

  function pageText(doc) {
    const copy = (doc.querySelector(".contentStranky") || doc.body).cloneNode(true);
    copy.querySelectorAll("script,style,#sgo-addon,#sgo-investigation").forEach(e => e.remove());
    return clean(copy.textContent);
  }

  function cooldown(text) {
    const t = normalize(text);
    if (!/\b(?:musite|musis)\s+(?:jeste\s+)?(?:pockat|cekat|vyckat)\b|\b(?:pockejte|vyckejte|prilis brzy)\b|\b(?:dalsi utok|(?:za)?utocit muzete|utoku muzete).{0,60}\b(?:az za|za \d+|nejdrive)\b/.test(t)) return null;
    const match = t.match(/(\d+)\s*(sekund\w*|vterin\w*|minut\w*)/);
    return { delay: match ? (Number(match[1]) * (match[2].startsWith("minut") ? 60 : 1) + 1) * 1000 : null };
  }

  function exhausted(text) {
    const t = normalize(text);
    return /\bmaximalni pocet (?:planet|utoku)\b/.test(t) ||
      /\b(?:limit|pocet utoku).{0,35}(?:vycerpan|dosazen)\w*\b/.test(t) ||
      /\bvycerpa\w*.{0,35}(?:limit|pocet utoku)\b/.test(t);
  }

  function pacingDelay(step = "between", random = Math.random) {
    const [min, max] = step === "submit" ? [1500, 4000] : [2500, 6000];
    return min + Math.floor(random() * (max - min + 1));
  }

  function response(doc) {
    const text = pageText(doc);
    // The add-on's own Gist token field is a password input and must not count as a login form.
    const loginField = [...doc.querySelectorAll('input[type="password"]')].some(e => !e.closest("#sgo-addon,#sgo-investigation"));
    if (loginField || /neprihlasen|stranka=uvod/.test(doc.URL)) {
      return { kind: "stop", message: "Prihlasenie vyprsalo. Prihlas sa a spusti novu seriu." };
    }
    if (/(captcha|overte.{0,30}(clovek|robot)|opiste.{0,30}(kod|obraz)|potvrdte.{0,30}nejste robot)/.test(normalize(text))) {
      return { kind: "stop", message: "Stranka vyzaduje rucne overenie. Automat bol zastaveny." };
    }
    const result = doc.querySelector("#datapl");
    const heading = clean(result?.querySelector("h2")?.textContent);
    if (/^(vitezstvi|porazka|prohra|remiza)/.test(normalize(heading))) {
      return { kind: "result", message: clean(result.textContent), text };
    }
    const notices = [...doc.querySelectorAll(".hlaska")].map(e => clean(e.textContent));
    const limit = notices.find(exhausted);
    if (limit) return { kind: "exhausted", message: limit };
    const wait = cooldown(text);
    if (wait) return { kind: "cooldown", ...wait, message: text };
    return { kind: "unknown", message: text };
  }

  function attackPage(doc, id, url) {
    const link = [...doc.querySelectorAll("a.lowopacity")].find(a => new URL(a.getAttribute("href"), url).searchParams.get("utok") === String(id));
    const count = link ? counters(link) : { remaining: null, maximum: null };
    const form = doc.querySelector("#formular");
    const target = clean(doc.querySelector("#nepritele")?.textContent);
    const submit = form?.querySelector('[name="zautocit"]');
    const fields = form ? [...form.querySelectorAll('input[name^="pocet_"]')].map(input => {
      const cell = input.closest("td");
      const amount = cell?.textContent.match(/([\d\s\u00a0]+)\s*ks/);
      return {
        name: input.name,
        label: clean(cell?.querySelector("strong")?.textContent || input.name),
        available: amount ? integer(amount[1]) : null
      };
    }) : [];
    const planets = form ? [...form.querySelectorAll('[name="planeta2"] option')].map(o => ({ value: o.value, label: clean(o.textContent) })) : [];
    const status = response(doc);
    if (status.kind === "exhausted") count.remaining = 0;
    const reason = clean(doc.querySelector(".hlaska")?.textContent || doc.querySelector("#nastvu")?.textContent || status.message);
    return {
      id: String(id), url, ...count, target, fields, planets,
      available: Boolean(submit && target === TARGET && fields.length && fields.every(f => f.available !== null)),
      reason, status
    };
  }

  function quantities(fields, config) {
    let total = 0;
    const values = {};
    for (const field of fields) {
      const selected = config[field.name] ?? "0";
      const value = selected === "all" ? field.available : integer(selected);
      if (value === null || field.available === null || value > field.available) {
        throw new Error(`Neplatny pocet pre ${field.label}; k dispozicii ${field.available}.`);
      }
      total += value;
      values[field.name] = value;
    }
    if (!total) throw new Error("Vyber aspon jednu jednotku s nenulovym poctom.");
    return values;
  }

  function nextAttack(order, plans, deadlines, cursor, now) {
    for (let offset = 0; offset < order.length; offset++) {
      const index = (cursor + offset) % order.length;
      const id = order[index];
      if (plans[id]?.enabled && (deadlines[id] || 0) <= now) return { id, cursor: (index + 1) % order.length };
    }
    return null;
  }

  const api = { TARGET, clean, normalize, integer, counters, pageText, cooldown, exhausted, pacingDelay, response, attackPage, quantities, nextAttack };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGO = api;
})(globalThis);
